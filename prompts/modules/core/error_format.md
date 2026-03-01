# MODULE: core/error_format
# Loaded by: ALL agents
# Lines: 18 | Version: 1.0.0

## Error Reporting — All Agents

Every error in `errors[]` must use this structure. No free-form strings.

```json
{
  "error_code": "NULL_FIELD_CRITICAL | OUT_OF_SCOPE | DB_MISMATCH | FILE_NOT_FOUND | CONTAINER_NOT_FOUND | SCHEMA_VIOLATION | IMPORT_UNAVAILABLE | CUROB_SCOPE_VIOLATION",
  "field": "<field name or null>",
  "element": "<joint name, link name, param name, or null>",
  "message": "<precise, one-sentence description of what failed>",
  "source": "<what system or check detected this>",
  "action": "<what must happen to resolve: set_to_null | escalate | operator_review | retry_with_fix>"
}
```

`out_of_scope` errors must identify the correct agent:
```json
{ "error_code": "OUT_OF_SCOPE", "message": "File writing is not this agent's domain", "correct_agent": "file_agent" }
```

Never use generic messages like "something went wrong" or "invalid value".
