"""
Mission Control — Integrity Package
Deterministic, code-enforced guardrails for all 6 compliance layers.
See docs/GUARDRAILS.md for the full rule specification.

Import order for startup:
  1. from backend.integrity import run_all_startup_checks
  2. failures = run_all_startup_checks()
  3. if has_critical_failures(failures): raise SystemExit
"""

from backend.integrity.placeholder_scanner import (
    PlaceholderScanner,
    scan_for_placeholders,
    has_critical_placeholder_violations,
)
from backend.integrity.scope_guard import ScopeGuard
from backend.integrity.intent_verifier import IntentVerifier, TaskIntent
from backend.integrity.drift_score import DriftScoreCalculator


def run_all_startup_checks():
    """Delegate to core integrity module for startup checks."""
    from backend.core.integrity import run_startup_integrity_check
    return run_startup_integrity_check()
