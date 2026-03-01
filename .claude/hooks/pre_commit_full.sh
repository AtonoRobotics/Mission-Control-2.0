#!/usr/bin/env bash
# Composite pre-commit hook — runs all checks in sequence
# Install: cp .claude/hooks/pre_commit_full.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -euo pipefail

echo "Running Mission Control pre-commit checks..."

# 1. Spec version consistency
bash .claude/hooks/pre_commit_spec_version.sh

# 2. Module hash staleness
bash .claude/hooks/pre_commit_module_hashes.sh

# 3. CLAUDE.md rule count
bash .claude/hooks/pre_commit_claude_md.sh

# 4. Fast deterministic CI checks (no Claude API)
python scripts/integrity/run_ci_checks.py

# 5. Eval regression (fast — deterministic only)
python evals/runners/run_evals.py

echo "✓ All pre-commit checks passed."
