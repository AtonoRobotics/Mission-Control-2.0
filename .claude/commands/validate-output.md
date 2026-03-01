Validate an agent output JSON against all guardrail checks.

Paste the agent output JSON after the command, or provide a file path: $ARGUMENTS

Steps:
1. Parse the output (file path or inline JSON).
2. Run PlaceholderScanner — report any CRITICAL findings immediately.
3. Run ScopeGuard for the agent declared in the output.
4. Run IntentVerifier if a TaskIntent can be inferred.
5. Check version tags against current SPEC_VERSION and GUARDRAILS_VERSION.
6. Check confidence scores for invalid range (0.01–0.79).
7. Report: verdict (PASS/WARN/FAIL), findings by layer, recommended action.

This is a dry-run — does NOT send output through the live validation chain.
