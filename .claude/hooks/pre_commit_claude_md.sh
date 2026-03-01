#!/usr/bin/env bash
# Pre-commit hook: CLAUDE.md prohibited actions section must not shrink
# Implements L5-R4 from GUARDRAILS.md
# Rules may only be added, never removed.

set -euo pipefail

CLAUDE_FILE="docs/CLAUDE.md"

if ! git diff --cached --name-only | grep -q "^${CLAUDE_FILE}$"; then
    exit 0
fi

# Count prohibited action items in HEAD vs staged
# Rules are lines containing "Never directly:" or starting with "- " under prohibited section
count_prohibited() {
    local ref="$1"
    git show "${ref}:${CLAUDE_FILE}" 2>/dev/null | grep -c "Never directly\|^- " || echo "0"
}

HEAD_COUNT=$(count_prohibited "HEAD")
STAGED_COUNT=$(count_prohibited ":${CLAUDE_FILE}")

if [ "$STAGED_COUNT" -lt "$HEAD_COUNT" ]; then
    echo "✗ PRE-COMMIT BLOCKED: docs/CLAUDE.md has fewer rules than before."
    echo "  HEAD rule count:   ${HEAD_COUNT}"
    echo "  Staged rule count: ${STAGED_COUNT}"
    echo ""
    echo "  Rules in CLAUDE.md may only be added, never removed."
    echo "  Rule: GUARDRAILS.md L5-R4"
    echo ""
    echo "  If a rule genuinely needs removal, it requires:"
    echo "  1. A GUARDRAILS.md version bump"
    echo "  2. A SPEC.md version bump"
    echo "  3. An entry in CHANGELOG.md explaining why"
    exit 1
fi

echo "✓ CLAUDE.md rule count verified: ${HEAD_COUNT} → ${STAGED_COUNT}"
exit 0
