Update docs/SPEC.md with a change: $ARGUMENTS

Format: /project:spec-update "description of the spec change"

Steps:
1. ultrathink — spec changes are CRITICAL. Read the current spec first.
2. Write the change to docs/SPEC.md.
3. Bump the version number at line 2 (required — pre-commit hook enforces this).
4. Update CHANGELOG.md with the spec version change.
5. Check: does this spec change require a GUARDRAILS.md update?
   If yes: update GUARDRAILS.md + bump its version + update GUARDRAILS_VERSION in backend/core/integrity.py
6. Check: does this spec change require new eval cases?
   If yes: add to evals/fixtures/golden_cases.py
7. Run: python scripts/enforce_practices.py
8. Commit all changed files together in one atomic commit.

The spec version bump and CHANGELOG entry must be in the same commit.
