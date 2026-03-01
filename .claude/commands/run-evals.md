Run the eval suite and report results.

Steps:
1. Run: python evals/runners/run_evals.py $ARGUMENTS
2. Report pass rate, any failures with expected vs actual verdict.
3. If any PASS case is now FAIL, or any FAIL case is now PASS, this is a regression — stop and report before continuing.
4. If all pass, confirm baseline is healthy.

Common arguments:
  (none)                     — run all 20 cases
  --category scope_violation — run one category
  --id B-001                 — run one case
