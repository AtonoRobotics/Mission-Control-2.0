"""
Mission Control — Validation Workflow Nodes
Integrity checks: placeholder scanning, hash verification, DB field comparison, audit.
"""

import hashlib
import structlog
from dataclasses import asdict
from pathlib import Path
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


def _resolve_content(params: dict[str, Any], context: dict[str, Any]) -> str | None:
    """Extract content from params or from a referenced source node in context."""
    if "content" in params:
        return params["content"]
    source_node = params.get("source_node")
    if source_node and source_node in context:
        return context[source_node].get("content")
    return None


class ValidateNullCheckNode(NodeHandler):
    """
    Run PlaceholderScanner on file content from context.

    params:
      source_node: str — node_id whose output has a "content" key
      OR content: str — inline content string

    output:
      status: "ok" | "failed"
      findings: list of finding dicts
      critical: bool
      finding_count: int

    Failed if has_critical_placeholder_violations returns True.
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        content = _resolve_content(params, context)
        if content is None:
            return {
                "status": "failed",
                "findings": [],
                "critical": False,
                "finding_count": 0,
                "error": "No content found: provide 'content' or valid 'source_node'",
            }

        from integrity.placeholder_scanner import (
            PlaceholderScanner,
            has_critical_placeholder_violations,
        )

        scanner = PlaceholderScanner()
        # If content is a string, wrap it so the scanner can traverse it
        data = content if isinstance(content, dict) else {"content": content}
        findings = scanner.scan(data)
        critical = has_critical_placeholder_violations(findings)

        logger.info(
            "validate_null_check",
            run_id=run.run_id,
            finding_count=len(findings),
            critical=critical,
        )

        return {
            "status": "failed" if critical else "ok",
            "findings": [asdict(f) for f in findings],
            "critical": critical,
            "finding_count": len(findings),
        }


class ValidateHashCheckNode(NodeHandler):
    """
    Compute SHA256 of content and compare to expected hash.

    params:
      source_node: str — node_id whose output has a "content" key
      expected_hash: str — SHA256 hex digest
      OR file_path: str — path to read file from

    output:
      status: "ok" | "failed"
      computed_hash: str
      expected_hash: str
      match: bool
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        expected_hash = params.get("expected_hash", "")
        content_bytes: bytes | None = None

        # Try file_path first
        file_path = params.get("file_path")
        if file_path:
            path = Path(file_path)
            if not path.exists():
                return {
                    "status": "failed",
                    "computed_hash": "",
                    "expected_hash": expected_hash,
                    "match": False,
                    "error": f"File not found: {file_path}",
                }
            content_bytes = path.read_bytes()
        else:
            # Fall back to content from source_node or inline
            content = _resolve_content(params, context)
            if content is None:
                return {
                    "status": "failed",
                    "computed_hash": "",
                    "expected_hash": expected_hash,
                    "match": False,
                    "error": "No content: provide 'file_path', 'content', or valid 'source_node'",
                }
            content_bytes = content.encode("utf-8") if isinstance(content, str) else content

        computed_hash = hashlib.sha256(content_bytes).hexdigest()
        match = computed_hash == expected_hash

        logger.info(
            "validate_hash_check",
            run_id=run.run_id,
            match=match,
            computed=computed_hash[:16],
        )

        return {
            "status": "ok" if match else "failed",
            "computed_hash": computed_hash,
            "expected_hash": expected_hash,
            "match": match,
        }


class ValidateDbCompareNode(NodeHandler):
    """
    Compare field counts between a config output and expected field names.

    params:
      robot_id: str
      source_node: str — node_id whose output dict to check
      expected_fields: list[str] — field names that should be present

    output:
      status: "ok" | "failed"
      present: list[str]
      missing: list[str]
      coverage_pct: float (0.0 – 100.0)
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        robot_id = params.get("robot_id", "")
        expected_fields: list[str] = params.get("expected_fields", [])
        source_node = params.get("source_node")

        if not expected_fields:
            return {
                "status": "failed",
                "present": [],
                "missing": [],
                "coverage_pct": 0.0,
                "error": "No expected_fields provided",
            }

        # Get the output dict from the source node
        source_output: dict[str, Any] = {}
        if source_node and source_node in context:
            source_output = context[source_node]

        # Flatten keys from the source output (top-level only)
        present_keys = set(source_output.keys())
        present = [f for f in expected_fields if f in present_keys]
        missing = [f for f in expected_fields if f not in present_keys]
        coverage_pct = (len(present) / len(expected_fields) * 100.0) if expected_fields else 0.0

        logger.info(
            "validate_db_compare",
            run_id=run.run_id,
            robot_id=robot_id,
            coverage_pct=round(coverage_pct, 1),
            missing_count=len(missing),
        )

        return {
            "status": "ok" if not missing else "failed",
            "present": present,
            "missing": missing,
            "coverage_pct": round(coverage_pct, 1),
        }


class ValidateAuditNode(NodeHandler):
    """
    Run simplified drift score calculation on a file registry entry.

    Since DriftScoreCalculator needs DB agents which are not available in
    workflow context, this performs a lightweight check: count null fields,
    verify hash matches content, and tally warnings.

    params:
      file_record: dict with keys:
        file_hash: str — expected SHA256 of content
        null_fields: list[str] — fields known to be NULL
        content: str — the file content to audit

    output:
      status: "ok"
      drift_score: int
      events: list[dict]
      blocks_promotion: bool
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        from integrity.drift_score import BLOCK_PROMOTION_THRESHOLD, DRIFT_WEIGHTS

        file_record = params.get("file_record", {})
        content = file_record.get("content", "")
        expected_hash = file_record.get("file_hash", "")
        null_fields: list[str] = file_record.get("null_fields", [])

        drift_score = 0
        events: list[dict[str, Any]] = []

        # Check null fields — each adds weight for potential drift
        null_weight = DRIFT_WEIGHTS.get("null_field_now_populated", 2)
        for field_name in null_fields:
            drift_score += null_weight
            events.append({
                "drift_type": "null_field_now_populated",
                "field": field_name,
                "detail": f"Field '{field_name}' is NULL — may have a DB value now",
                "score_contribution": null_weight,
            })

        # Check hash if content and expected hash are provided
        if content and expected_hash:
            content_bytes = content.encode("utf-8") if isinstance(content, str) else content
            computed_hash = hashlib.sha256(content_bytes).hexdigest()
            if computed_hash != expected_hash:
                hash_weight = DRIFT_WEIGHTS.get("file_hash_mismatch", 3)
                drift_score += hash_weight
                events.append({
                    "drift_type": "file_hash_mismatch",
                    "field": "file_hash",
                    "detail": (
                        f"Content hash mismatch: "
                        f"expected {expected_hash[:16]}..., "
                        f"computed {computed_hash[:16]}..."
                    ),
                    "score_contribution": hash_weight,
                })

        # Run placeholder scan on content for additional warnings
        if content:
            from integrity.placeholder_scanner import PlaceholderScanner
            scanner = PlaceholderScanner()
            data = content if isinstance(content, dict) else {"content": content}
            findings = scanner.scan(data)
            if findings:
                # Each critical finding adds 1 to drift score
                for finding in findings:
                    contribution = 2 if finding.severity == "CRITICAL" else 1
                    drift_score += contribution
                    events.append({
                        "drift_type": "placeholder_detected",
                        "field": finding.field_path,
                        "detail": finding.message,
                        "score_contribution": contribution,
                    })

        blocks_promotion = drift_score >= BLOCK_PROMOTION_THRESHOLD

        logger.info(
            "validate_audit",
            run_id=run.run_id,
            drift_score=drift_score,
            event_count=len(events),
            blocks_promotion=blocks_promotion,
        )

        return {
            "status": "ok",
            "drift_score": drift_score,
            "events": events,
            "blocks_promotion": blocks_promotion,
        }
