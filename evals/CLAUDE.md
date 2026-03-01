# evals/ — Evaluation Framework
Loaded automatically when working in evals/ subdirectory.

## Running evals
```bash
python evals/runners/run_evals.py                           # all 20 cases
python evals/runners/run_evals.py --category scope_violation # one category
python evals/runners/run_evals.py --id B-001                # single case
```

## Eval categories
- `correct` (A-*) — must PASS. These are well-formed outputs.
- `hallucination_physical_value` (B-*) — must FAIL. Planted fake values.
- `silent_null_fill` (C-*) — must FAIL. NULL fields silently populated.
- `scope_violation` (D-*) — must FAIL. Agent outside its boundaries.
- `intent_mismatch` (E-*) — must FAIL. Wrong robot, stale version, wrong count.

## Adding eval cases
Edit `evals/fixtures/golden_cases.py`. Each case needs:
- `id`: letter-number (e.g. "F-001" for a new category)
- `category`: snake_case string
- `expected_verdict`: "PASS" | "WARN" | "FAIL"
- `expected_fail_reason`: what the failure should cite (for FAIL cases)
- `agent_output`: realistic dict matching the agent's output schema

## Anthropic guidance
Start evaluating immediately. Effect sizes are large in early development —
a prompt change can shift 30%→80% with 20 cases. Add cases before adding features.
