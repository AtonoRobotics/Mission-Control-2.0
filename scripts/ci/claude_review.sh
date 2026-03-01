#!/usr/bin/env bash
# Mission Control — Headless Claude Code CI
# Uses `claude -p` (headless mode) for subjective validation beyond deterministic checks.
# Anthropic: "Claude Code can provide subjective code reviews beyond what traditional
# linting tools detect — typos, stale comments, misleading names, and more."
#
# Usage:
#   ./scripts/ci/claude_review.sh                    # review staged changes
#   ./scripts/ci/claude_review.sh --full             # review entire prompts/ directory
#   ./scripts/ci/claude_review.sh --eval-regression  # check for eval regressions
#
# Requirements:
#   - claude CLI installed and authenticated
#   - Run from project root

set -euo pipefail

MODE="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

run_claude() {
    local prompt="$1"
    local tools="${2:-}"
    local tool_args=""
    if [ -n "$tools" ]; then
        tool_args="--allowedTools $tools"
    fi
    # shellcheck disable=SC2086
    claude -p "$prompt" $tool_args --output-format text 2>&1
}

fail() {
    echo "✗ FAIL: $1" >&2
    exit 1
}

pass() {
    echo "✓ PASS: $1"
}

# ── Check 1: Deterministic integrity (always runs) ────────────────────────────

echo "=== Deterministic Integrity Checks ==="
if python scripts/integrity/run_ci_checks.py; then
    pass "Deterministic integrity"
else
    fail "Deterministic integrity checks failed. Fix before Claude review."
fi

# ── Check 2: Eval regression (always runs) ───────────────────────────────────

echo ""
echo "=== Eval Regression Check ==="
EVAL_OUTPUT=$(python evals/runners/run_evals.py 2>&1)
EVAL_EXIT=$?
echo "$EVAL_OUTPUT"

if [ $EVAL_EXIT -ne 0 ]; then
    fail "Eval regression detected. One or more golden cases changed verdict."
fi
pass "Eval suite — no regressions"

# ── Check 3: Claude prompt module review (on --full or prompt changes) ────────

CHANGED_PROMPTS=$(git diff --cached --name-only 2>/dev/null | grep "^prompts/" || true)

if [ "$MODE" = "--full" ] || [ -n "$CHANGED_PROMPTS" ]; then
    echo ""
    echo "=== Claude Prompt Module Review ==="

    REVIEW_PROMPT="Review the prompt modules that were changed in this diff.
For each changed module, check:
1. Does it stay under 50 lines? If over, suggest how to split.
2. Does it declare intent and outcome, NOT step-by-step procedure?
3. Does the # Version: line exist at line 3?
4. Is the language clear and at the right altitude — specific enough to guide behavior, flexible enough for heuristics?
5. Are there any conflicting instructions with core/never_do.md or core/null_policy.md?

Changed files:
$(echo "$CHANGED_PROMPTS")

Report: PASS if all checks clear, FAIL with specific line numbers if issues found.
Return ONLY the string PASS or FAIL on the last line."

    REVIEW_RESULT=$(run_claude "$REVIEW_PROMPT" "Read")
    echo "$REVIEW_RESULT"

    if echo "$REVIEW_RESULT" | tail -1 | grep -q "^FAIL"; then
        fail "Claude prompt review flagged issues. See output above."
    fi
    pass "Claude prompt module review"
fi

# ── Check 4: Scope consistency (on agent scope changes) ──────────────────────

CHANGED_SCOPE=$(git diff --cached --name-only 2>/dev/null | grep "scope_guard.py" || true)

if [ -n "$CHANGED_SCOPE" ]; then
    echo ""
    echo "=== Scope Consistency Check ==="

    SCOPE_PROMPT="Check that the AGENT_SCOPE definitions in backend/integrity/scope_guard.py
are consistent with the agent role modules in prompts/agents/.

For each agent in AGENT_SCOPE:
1. Does a corresponding prompts/agents/<agent_name>/role.md exist?
2. Are the permitted_output_types in code consistent with what the role.md describes?
3. Are the forbidden_output_keys in code consistent with what other agents' role.md files describe?

Report specific inconsistencies. Return PASS or FAIL on the last line."

    SCOPE_RESULT=$(run_claude "$SCOPE_PROMPT" "Read")
    echo "$SCOPE_RESULT"

    if echo "$SCOPE_RESULT" | tail -1 | grep -q "^FAIL"; then
        fail "Scope consistency check failed."
    fi
    pass "Scope consistency"
fi

# ── Check 5: CHANGELOG entry (on any code change) ────────────────────────────

CHANGED_CODE=$(git diff --cached --name-only 2>/dev/null | grep -v "^CHANGELOG" | grep -E "\.(py|md|sh)$" || true)
CHANGED_CHANGELOG=$(git diff --cached --name-only 2>/dev/null | grep "^CHANGELOG" || true)

if [ -n "$CHANGED_CODE" ] && [ -z "$CHANGED_CHANGELOG" ]; then
    fail "CHANGELOG.md not updated. Add an entry before committing. (GUARDRAILS.md L6-R3)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=================================="
echo "✓ All CI checks passed."
echo "=================================="
exit 0
