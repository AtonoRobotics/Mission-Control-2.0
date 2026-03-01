Run all integrity checks and report status.

Steps:
1. Run: python scripts/integrity/run_ci_checks.py
2. Run: python scripts/integrity/check_import_boundaries.py
3. Report: pass/fail per check, rule references for any failures.
4. If any CRITICAL failure: do not proceed with other tasks until resolved.
5. List specific files and lines that need fixing for each failure.

$ARGUMENTS (optional): pass a specific check name to run only that check.
