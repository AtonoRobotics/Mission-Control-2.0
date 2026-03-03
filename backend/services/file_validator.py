"""
Mission Control — File Registry Validation Chain
Wires integrity checkers into the file registry status transitions:
  draft → validated:  SHA256 re-check, PlaceholderScanner, file-type-specific checks
  validated → promoted: DriftScoreCalculator (lightweight), blocks if score >= 10
"""

import hashlib
import structlog
from dataclasses import dataclass, asdict
from typing import Any
from xml.etree import ElementTree

from integrity.placeholder_scanner import (
    PlaceholderScanner,
    has_critical_placeholder_violations,
    PlaceholderFinding,
)
from integrity.scope_guard import ScopeGuard
from integrity.drift_score import BLOCK_PROMOTION_THRESHOLD

logger = structlog.get_logger(__name__)


@dataclass
class ValidationResult:
    passed: bool
    errors: list[str]
    warnings: list[str]
    null_fields: dict[str, str]  # field_name -> reason


async def validate_for_status_change(
    file_record: Any,
    new_status: str,
    content: str | None = None,
) -> ValidationResult:
    """
    Run validation checks appropriate for the requested status transition.

    Args:
        file_record: FileRegistry ORM instance
        new_status: target status ("validated" or "promoted")
        content: file content string (if stored in DB or uploaded)

    Returns:
        ValidationResult with pass/fail, errors, warnings, and null_fields
    """
    if new_status == "validated":
        return await _validate_draft_to_validated(file_record, content)
    elif new_status == "promoted":
        return await _validate_validated_to_promoted(file_record, content)
    else:
        # No validation needed for other transitions
        return ValidationResult(passed=True, errors=[], warnings=[], null_fields={})


async def _validate_draft_to_validated(
    file_record: Any,
    content: str | None,
) -> ValidationResult:
    """
    Validation chain for draft → validated:
    1. Re-compute SHA256, compare to stored hash
    2. Run PlaceholderScanner — CRITICAL findings block
    3. For URDF: parse XML, count joints/links
    4. For cuRobo YAML: run ScopeGuard forbidden field check
    5. Populate null_fields from WARN findings
    """
    errors: list[str] = []
    warnings: list[str] = []
    null_fields: dict[str, str] = {}

    if content is None:
        # Try to get content from the record attribute
        content = getattr(file_record, "content", None)

    if content is None:
        errors.append("No content available for validation")
        return ValidationResult(passed=False, errors=errors, warnings=warnings, null_fields=null_fields)

    # 1. SHA256 re-check
    computed_hash = hashlib.sha256(content.encode()).hexdigest()
    stored_hash = file_record.file_hash
    if computed_hash != stored_hash:
        errors.append(
            f"Hash mismatch: stored={stored_hash[:16]}... computed={computed_hash[:16]}..."
        )

    # 2. PlaceholderScanner
    scanner = PlaceholderScanner()
    data = {"content": content}
    findings = scanner.scan(data)

    critical_findings = [f for f in findings if f.severity == "CRITICAL"]
    warn_findings = [f for f in findings if f.severity == "WARN"]

    if has_critical_placeholder_violations(findings):
        for f in critical_findings:
            errors.append(f"[{f.rule}] {f.message}")

    for f in warn_findings:
        warnings.append(f"[{f.rule}] {f.message}")
        null_fields[f.field_path] = f.message

    # 3. File-type-specific checks
    file_type = file_record.file_type

    if file_type == "urdf":
        urdf_result = _validate_urdf(content, file_record)
        errors.extend(urdf_result.get("errors", []))
        warnings.extend(urdf_result.get("warnings", []))

    elif file_type == "curobo_yaml":
        curobo_result = _validate_curobo_yaml(content)
        errors.extend(curobo_result.get("errors", []))
        warnings.extend(curobo_result.get("warnings", []))

    passed = len(errors) == 0

    logger.info(
        "file_validation_complete",
        file_id=str(file_record.file_id),
        file_type=file_type,
        passed=passed,
        error_count=len(errors),
        warning_count=len(warnings),
    )

    return ValidationResult(
        passed=passed,
        errors=errors,
        warnings=warnings,
        null_fields=null_fields,
    )


async def _validate_validated_to_promoted(
    file_record: Any,
    content: str | None,
) -> ValidationResult:
    """
    Validation for validated → promoted:
    - Lightweight drift score: count null_fields, check hash, tally findings
    - Block if score >= BLOCK_PROMOTION_THRESHOLD (10)
    """
    errors: list[str] = []
    warnings: list[str] = []
    score = 0

    # Count null fields
    null_fields = file_record.null_fields or {}
    if isinstance(null_fields, dict):
        score += len(null_fields) * 2
        if null_fields:
            warnings.append(f"Drift: {len(null_fields)} null fields contribute {len(null_fields) * 2} to drift score")

    # Check content for remaining placeholders
    if content is None:
        content = getattr(file_record, "content", None)

    if content:
        scanner = PlaceholderScanner()
        findings = scanner.scan({"content": content})
        if findings:
            score += len(findings)
            warnings.append(f"Drift: {len(findings)} placeholder findings add {len(findings)} to score")

    if score >= BLOCK_PROMOTION_THRESHOLD:
        errors.append(
            f"Drift score {score} >= threshold {BLOCK_PROMOTION_THRESHOLD}. "
            f"Promotion blocked — resolve null fields and placeholder findings first."
        )

    passed = len(errors) == 0

    logger.info(
        "file_promotion_check",
        file_id=str(file_record.file_id),
        drift_score=score,
        passed=passed,
    )

    return ValidationResult(
        passed=passed,
        errors=errors,
        warnings=warnings,
        null_fields=null_fields if isinstance(null_fields, dict) else {},
    )


def _validate_urdf(content: str, file_record: Any) -> dict:
    """Parse URDF XML and count joints/links."""
    errors: list[str] = []
    warnings: list[str] = []

    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as e:
        errors.append(f"URDF XML parse error: {e}")
        return {"errors": errors, "warnings": warnings}

    joints = root.findall(".//joint")
    links = root.findall(".//link")

    if not links:
        errors.append("URDF has no <link> elements")
    if not joints:
        warnings.append("URDF has no <joint> elements")

    # Cross-reference with robot DOF if available
    robot_id = file_record.robot_id
    if robot_id:
        joint_count = len(joints)
        warnings.append(f"URDF has {joint_count} joints, {len(links)} links for robot '{robot_id}'")

    return {"errors": errors, "warnings": warnings, "joint_count": len(joints), "link_count": len(links)}


def _validate_curobo_yaml(content: str) -> dict:
    """Run ScopeGuard check on cuRobo config content."""
    errors: list[str] = []
    warnings: list[str] = []

    # Use ScopeGuard to check for forbidden cuRobo params
    guard = ScopeGuard()
    # Wrap content in a dict that simulates an agent output
    output = {"content": content, "output": content}
    violations = guard.check("curob_config", output)

    for v in violations:
        if v.severity == "CRITICAL":
            errors.append(f"[{v.rule}] {v.detail}")
        else:
            warnings.append(f"[{v.rule}] {v.detail}")

    return {"errors": errors, "warnings": warnings}
