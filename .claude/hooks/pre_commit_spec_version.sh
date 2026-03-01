#!/usr/bin/env bash
# Pre-commit hook: SPEC.md changes require version bump
# Implements L5-R1 from GUARDRAILS.md
#
# Install: cp .claude/hooks/pre_commit_spec_version.sh .git/hooks/pre-commit
# Or add to .pre-commit-config.yaml

set -euo pipefail

SPEC_FILE="docs/SPEC.md"
INTEGRITY_FILE="backend/core/integrity.py"

# Check if SPEC.md is staged for commit
if ! git diff --cached --name-only | grep -q "^${SPEC_FILE}$"; then
    exit 0  # SPEC.md not being committed — nothing to check
fi

# SPEC.md is staged — verify the version was bumped
# Extract version from staged version of file
STAGED_VERSION=$(git show ":${SPEC_FILE}" 2>/dev/null | head -3 | grep -oP '(?<=\*\*Version:\*\* )\S+' || true)

if [ -z "$STAGED_VERSION" ]; then
    echo "✗ PRE-COMMIT BLOCKED: docs/SPEC.md does not declare a version on the first 3 lines."
    echo "  Add: **Version:** X.Y.Z"
    echo "  Rule: GUARDRAILS.md L5-R1"
    exit 1
fi

# Extract version from HEAD (pre-change)
HEAD_VERSION=$(git show "HEAD:${SPEC_FILE}" 2>/dev/null | head -3 | grep -oP '(?<=\*\*Version:\*\* )\S+' || echo "0.0.0")

if [ "$STAGED_VERSION" = "$HEAD_VERSION" ]; then
    echo "✗ PRE-COMMIT BLOCKED: docs/SPEC.md was modified but version was not bumped."
    echo "  Current version: ${HEAD_VERSION}"
    echo "  Staged version:  ${STAGED_VERSION} (unchanged)"
    echo "  Rule: GUARDRAILS.md L5-R1 — spec changes require version increment."
    echo "  Action: Update **Version:** in docs/SPEC.md and update SPEC_VERSION in ${INTEGRITY_FILE}"
    exit 1
fi

# Also verify integrity.py SPEC_VERSION constant was updated in the same commit
if git diff --cached --name-only | grep -q "^${INTEGRITY_FILE}$"; then
    STAGED_CONSTANT=$(git show ":${INTEGRITY_FILE}" | grep -oP '(?<=SPEC_VERSION = ")[^"]+' || true)
    if [ "$STAGED_CONSTANT" != "$STAGED_VERSION" ]; then
        echo "✗ PRE-COMMIT BLOCKED: SPEC_VERSION in ${INTEGRITY_FILE} (${STAGED_CONSTANT})"
        echo "  does not match version in ${SPEC_FILE} (${STAGED_VERSION})."
        echo "  Update SPEC_VERSION = \"${STAGED_VERSION}\" in ${INTEGRITY_FILE}"
        exit 1
    fi
else
    echo "✗ PRE-COMMIT BLOCKED: docs/SPEC.md version bumped to ${STAGED_VERSION}"
    echo "  but ${INTEGRITY_FILE} was not updated in this commit."
    echo "  Update SPEC_VERSION = \"${STAGED_VERSION}\" in ${INTEGRITY_FILE}"
    exit 1
fi

echo "✓ SPEC.md version bump verified: ${HEAD_VERSION} → ${STAGED_VERSION}"
exit 0
