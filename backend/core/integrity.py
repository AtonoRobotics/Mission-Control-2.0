"""
Mission Control — Core Integrity
Single source of truth for version constants and startup integrity validation.
Any change here must match a corresponding change in docs/GUARDRAILS.md.
"""

from __future__ import annotations

import hashlib
import json
import structlog
from pathlib import Path
from dataclasses import dataclass

logger = structlog.get_logger(__name__)

# ── Version Constants ─────────────────────────────────────────────────────────
# These must match the versions declared in their respective documents.
# CI checks enforce consistency.

SPEC_VERSION = "2.0.0"
GUARDRAILS_VERSION = "1.0.0"
EMPIRICAL_DB_SCHEMA_VERSION = "3.1.0"

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent
PROMPTS_ROOT = ROOT / "prompts"
MODULE_HASHES_PATH = PROMPTS_ROOT / "module_hashes.json"
DOCS_ROOT = ROOT / "docs"


# ── Startup Integrity Check ───────────────────────────────────────────────────

@dataclass
class IntegrityFailure:
    layer: str
    rule: str
    detail: str
    severity: str  # "CRITICAL" | "WARN"


def run_startup_integrity_check() -> list[IntegrityFailure]:
    """
    Run all integrity checks at application startup.
    Called from main.py lifespan before accepting requests.
    Returns list of failures. Any CRITICAL failure should halt startup.
    """
    failures: list[IntegrityFailure] = []

    failures.extend(_check_spec_version_in_doc())
    failures.extend(_check_guardrails_version_in_doc())
    failures.extend(_check_module_hashes())
    failures.extend(_check_required_modules_exist())

    if failures:
        for f in failures:
            logger.error(
                "integrity_check_failed",
                layer=f.layer,
                rule=f.rule,
                detail=f.detail,
                severity=f.severity,
            )
    else:
        logger.info("integrity_check_passed", message="All startup integrity checks passed.")

    return failures


def has_critical_failures(failures: list[IntegrityFailure]) -> bool:
    return any(f.severity == "CRITICAL" for f in failures)


# ── Individual Checks ─────────────────────────────────────────────────────────

def _check_spec_version_in_doc() -> list[IntegrityFailure]:
    """Verify SPEC.md declares the version that matches SPEC_VERSION constant."""
    spec_path = DOCS_ROOT / "SPEC.md"
    if not spec_path.exists():
        return [IntegrityFailure("spec", "L5-R1", "docs/SPEC.md not found", "CRITICAL")]

    header = "\n".join(spec_path.read_text().split("\n")[:5])
    if SPEC_VERSION not in header:
        return [IntegrityFailure(
            "spec", "L5-R1",
            f"SPEC.md header does not contain SPEC_VERSION='{SPEC_VERSION}'. "
            f"Header: '{header}'",
            "CRITICAL",
        )]
    return []


def _check_guardrails_version_in_doc() -> list[IntegrityFailure]:
    """Verify GUARDRAILS.md declares the version that matches GUARDRAILS_VERSION constant."""
    gr_path = DOCS_ROOT / "GUARDRAILS.md"
    if not gr_path.exists():
        return [IntegrityFailure("spec", "L5-R2", "docs/GUARDRAILS.md not found", "CRITICAL")]

    content = gr_path.read_text()
    version_line = f"**Version:** {GUARDRAILS_VERSION}"
    if version_line not in content:
        return [IntegrityFailure(
            "spec", "L5-R2",
            f"GUARDRAILS.md does not contain '{version_line}'. "
            f"GUARDRAILS_VERSION constant and document are out of sync.",
            "CRITICAL",
        )]
    return []


def _check_module_hashes() -> list[IntegrityFailure]:
    """
    Verify every prompt module matches its stored SHA256 hash.
    Catches modules modified without a version bump (L3-R2).
    """
    failures: list[IntegrityFailure] = []

    if not MODULE_HASHES_PATH.exists():
        return [IntegrityFailure(
            "drift", "L3-R2",
            f"module_hashes.json not found at {MODULE_HASHES_PATH}. "
            "Run: python scripts/integrity/generate_module_hashes.py",
            "CRITICAL",
        )]

    stored: dict[str, str] = json.loads(MODULE_HASHES_PATH.read_text())

    for module_path_str, expected_hash in stored.items():
        module_file = PROMPTS_ROOT / f"{module_path_str}.md"
        if not module_file.exists():
            failures.append(IntegrityFailure(
                "drift", "L3-R2",
                f"Prompt module missing: {module_file}",
                "CRITICAL",
            ))
            continue

        actual_hash = _sha256(module_file.read_bytes())
        if actual_hash != expected_hash:
            failures.append(IntegrityFailure(
                "drift", "L3-R2",
                f"Prompt module hash mismatch: {module_path_str}\n"
                f"  Expected: {expected_hash}\n"
                f"  Actual:   {actual_hash}\n"
                f"  Module was modified without updating module_hashes.json and version.",
                "CRITICAL",
            ))

    return failures


def _check_required_modules_exist() -> list[IntegrityFailure]:
    """Verify all modules referenced in prompt_loader manifest exist on disk."""
    try:
        from core.prompt_loader import validate_all_modules_exist
    except ImportError:
        try:
            from backend.core.prompt_loader import validate_all_modules_exist
        except ImportError:
            return [IntegrityFailure(
                "architecture", "L4-R1",
                "prompt_loader module could not be imported — prompt system not yet set up",
                "WARN",
            )]
    missing = validate_all_modules_exist()
    if not missing:
        return []

    failures = []
    for agent, paths in missing.items():
        for path in paths:
            failures.append(IntegrityFailure(
                "architecture", "L4-R1",
                f"Agent '{agent}' references missing prompt module: {path}",
                "CRITICAL",
            ))
    return failures


# ── Hash Utilities ────────────────────────────────────────────────────────────

def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: Path) -> str:
    return _sha256(path.read_bytes())


def compute_current_module_hashes() -> dict[str, str]:
    """
    Compute SHA256 for all current prompt modules.
    Used by generate_module_hashes.py to regenerate module_hashes.json.
    """
    hashes = {}
    for md_file in sorted(PROMPTS_ROOT.rglob("*.md")):
        relative = md_file.relative_to(PROMPTS_ROOT)
        # Store without .md extension, matching prompt_loader convention
        key = str(relative.with_suffix(""))
        hashes[key] = _sha256(md_file.read_bytes())
    return hashes
