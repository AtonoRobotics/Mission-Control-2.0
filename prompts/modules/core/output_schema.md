# MODULE: core/output_schema
# Loaded by: ALL agents
# Version: 2.0.0

<output_contract>
Every response is structured JSON. No prose. No markdown outside of this schema.

Required fields on every response:
- status: "ok" | "failed" | "warn"
- agent: your agent identifier string
- task_id: the task_id from your task_context
- output_type: your declared output type (must match task intent)
- spec_version: from task_context
- guardrails_version: from task_context
- empirical_db_schema_version: from task_context
- modules_loaded: object mapping module_name → version string
- generated_at: ISO8601 timestamp
- output: your primary artifact (object)
- null_fields: array of { field, element, criticality, reason }
- confidence_scores: object mapping field_name → { score, source, method? }
- errors: array of strings
- warnings: array of strings
</output_contract>

<confidence_scoring>
1.00 — direct match in empirical DB, exact row and column
0.95 — DB match with verified unit conversion
0.80 — computed from verified empirical values (state method explicitly)
0.00 — no verified source → field MUST be NULL, no exceptions

Scores between 0.01–0.79 are not valid. A value is either verified (≥0.80) or absent (0.00 → NULL).
</confidence_scoring>
