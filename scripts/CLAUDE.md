# scripts/ — Automation Scripts
Loaded when working in scripts/. These run in CI and pre-commit hooks.

## Key scripts
- `scripts/enforce_practices.py` — full Anthropic practices audit. Run first every session.
- `scripts/integrity/run_ci_checks.py` — fast deterministic guardrail checks (L1-L6)
- `scripts/integrity/check_import_boundaries.py` — architecture boundary enforcement
- `scripts/integrity/generate_module_hashes.py` — regenerate hashes after prompts/ edits
- `scripts/ci/claude_review.sh` — headless Claude review via `claude -p`
- `scripts/setup_dev.sh` — one-command dev setup

## Usage
```bash
python scripts/enforce_practices.py            # full audit
python scripts/enforce_practices.py --fix      # auto-fix safe violations
python scripts/enforce_practices.py --report   # write to docs/PRACTICE_AUDIT.md
```

## Adding a new integrity check
1. Add the check function to `scripts/integrity/run_ci_checks.py`
2. Add a corresponding BLOCK/WARN violation in `enforce_practices.py`
3. Add a golden eval case that catches the violation
4. Update pre-commit hook if check should block commits
