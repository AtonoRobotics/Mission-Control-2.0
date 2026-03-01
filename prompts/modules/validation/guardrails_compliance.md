# MODULE: validation/guardrails_compliance
# Loaded by: ALL agents
# Version: 1.0.0
# Responsibility: Single concern — declare version tags and compliance metadata in every output

## Guardrails Compliance — Required Output Fields

Every agent output must include these fields. They are non-negotiable.
The Validator Agent Check 1 will FAIL any output missing these fields.

### Required Version Tags
```json
{
  "spec_version": "2.0.0",
  "guardrails_version": "1.0.0",
  "empirical_db_schema_version": "3.1.0",
  "modules_loaded": {
    "null_policy": "1.0.0",
    "output_schema": "1.0.0",
    "never_do": "1.0.0"
  },
  "generated_at": "<ISO8601 timestamp>"
}
```

Populate from the values provided in your task_context. Do not guess version numbers.
The orchestrator injects current versions into every task dispatch.

### Required Task Echo
Echo back the task_id and expected_output_type to enable intent verification:
```json
{
  "task_id": "<from task_context>",
  "output_type": "<your declared output type>",
  "agent": "<your agent name>"
}
```

### Why This Matters
These fields enable three critical checks:
1. Drift detection — stale version tags identify outputs built against old specs
2. Intent verification — output_type confirms agent understood the task
3. Audit trail — generated_at + task_id enable full reconstruction of any build

An output without these fields is untraceable and cannot be validated.
