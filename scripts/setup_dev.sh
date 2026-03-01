#!/usr/bin/env bash
# Mission Control — First-time developer setup
# Run once after cloning or extracting the tarball.

set -euo pipefail
echo "Mission Control — Developer Setup"
echo "=================================="

# 1. Install pre-commit hook
cp .claude/hooks/pre_commit_full.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✓ Pre-commit hook installed"

# 2. Generate module hashes (needed before first claude -p run)
python scripts/integrity/generate_module_hashes.py
echo "✓ Module hashes generated"

# 3. Run integrity checks
python scripts/integrity/run_ci_checks.py
echo "✓ Integrity checks passed"

# 4. Run eval suite
python evals/runners/run_evals.py
echo "✓ Eval suite baseline confirmed"

# 5. Confirm .env.machines exists
if [ ! -f ".env.machines" ]; then
    cp .env.machines.example .env.machines 2>/dev/null || \
    echo "⚠ .env.machines not found — copy from .env.machines.example and fill in your values"
else
    echo "✓ .env.machines found"
fi

echo ""
echo "Setup complete. Start Claude Code with:"
echo "  claude"
echo ""
echo "Claude Code will:"
echo "  - Load CLAUDE.md automatically (root + subdirectory)"
echo "  - Have slash commands: /project:build-urdf, /project:run-evals, etc."
echo "  - Run integrity checks before accepting any session work"
