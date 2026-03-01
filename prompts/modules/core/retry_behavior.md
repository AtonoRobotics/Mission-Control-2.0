# MODULE: core/retry_behavior
# Loaded by: ALL generating agents (not Validator)
# Lines: 22 | Version: 1.0.0

## Retry Behavior — Receiving Failure Context

When `task.failure_context` is present, a previous attempt was rejected by the Validator.

### Rules for Retry

1. Read `failure_context.failed_fields[]` — these are the ONLY fields you may change
2. Do NOT modify fields not listed in `failed_fields` — they passed validation
3. For each failed field:
   - If `db_value` is provided: use it exactly, set confidence 1.0
   - If `db_value` is null: set field to NULL, emit null_fields entry, confidence 0.0
4. Apply `null_policy` module to all failed fields with no DB value
5. Return full output — not just the corrected fields

### What You Never Do on Retry

- Never "try a different value" for a field with no DB source
- Never change fields that passed the previous validation
- Never reduce confidence scores on fields that previously passed
- Never omit the `confidence_scores` block

### Retry Acknowledgment

Include in your response:
```json
"retry_context": {
  "attempt": 2,
  "fields_corrected": ["joint_1_effort_limit"],
  "fields_set_to_null": ["joint_2_mass"],
  "unchanged_from_prior": ["all other fields"]
}
```
