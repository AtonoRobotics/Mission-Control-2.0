#!/usr/bin/env bash
# Pre-commit hook: prompt module changes require module_hashes.json update
# Implements L5-R3 and L3-R2 from GUARDRAILS.md
#
# Install: add to .git/hooks/pre-commit or .pre-commit-config.yaml

set -euo pipefail

HASHES_FILE="prompts/module_hashes.json"

# Check if any .md file in prompts/ is staged
STAGED_MODULES=$(git diff --cached --name-only | grep '^prompts/.*\.md$' || true)

if [ -z "$STAGED_MODULES" ]; then
    exit 0  # No prompt modules staged — nothing to check
fi

# Prompt modules are being changed — hashes file must also be staged
if ! git diff --cached --name-only | grep -q "^${HASHES_FILE}$"; then
    echo "✗ PRE-COMMIT BLOCKED: Prompt module(s) modified but ${HASHES_FILE} not updated."
    echo ""
    echo "  Modified modules:"
    echo "$STAGED_MODULES" | sed 's/^/    /'
    echo ""
    echo "  Run: python scripts/integrity/generate_module_hashes.py"
    echo "  Then: git add ${HASHES_FILE}"
    echo ""
    echo "  Rule: GUARDRAILS.md L5-R3 — module hash must stay current."
    echo "  Reason: Stale hashes cause agents to refuse initialization at startup."
    exit 1
fi

# Also verify module version was bumped (L5-R5)
FAILED_VERSIONS=()
while IFS= read -r module_file; do
    if [ -z "$module_file" ]; then continue; fi

    STAGED_VERSION=$(git show ":${module_file}" 2>/dev/null | grep -oP '(?<=# Version: )\S+' | head -1 || true)
    HEAD_VERSION=$(git show "HEAD:${module_file}" 2>/dev/null | grep -oP '(?<=# Version: )\S+' | head -1 || echo "")

    if [ -n "$HEAD_VERSION" ] && [ "$STAGED_VERSION" = "$HEAD_VERSION" ]; then
        FAILED_VERSIONS+=("$module_file (version ${STAGED_VERSION} unchanged)")
    fi
done <<< "$STAGED_MODULES"

if [ ${#FAILED_VERSIONS[@]} -gt 0 ]; then
    echo "✗ PRE-COMMIT BLOCKED: Prompt module(s) modified without version bump."
    echo ""
    for f in "${FAILED_VERSIONS[@]}"; do
        echo "  $f"
    done
    echo ""
    echo "  Increment '# Version: X.Y.Z' at line 3 of each modified module."
    echo "  Rule: GUARDRAILS.md L5-R5"
    exit 1
fi

echo "✓ Prompt module hashes and versions verified."
exit 0
