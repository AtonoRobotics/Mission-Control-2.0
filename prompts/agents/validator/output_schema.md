# MODULE: validator/output_schema
# Loaded by: Validator Agent only
# Size: 42 lines
# Version: 1.0.0

## Validator Agent — Output Schema

Every validator response must conform exactly to this schema:

```json
{
  "validator_id": "validator-agent-v1",
  "task_id": "<uuid_from_orchestrator>",
  "validated_output_type": "urdf | usd | launch | yaml_sensor | yaml_curob | script | audit_report",
  "verdict": "PASS | WARN | FAIL",
  "checks_run": 10,
  "checks_passed": 0,
  "checks_warned": 0,
  "checks_failed": 0,
  "db_queries_executed": 0,
  "findings": [
    {
      "check_number": 3,
      "check_name": "empirical_db_cross_check",
      "severity": "FAIL | WARN | INFO",
      "field": "<field_name>",
      "element": "<joint_name | link_name | param_name>",
      "output_value": "<value_in_agent_output>",
      "db_value": "<value_from_empirical_db | null>",
      "verdict": "FAIL",
      "reason": "<precise explanation>",
      "action_required": "<set_to_null | escalate | manual_review>"
    }
  ],
  "hallucination_findings": [
    {
      "priority": 1,
      "field": "<field_name>",
      "value_in_output": "<value>",
      "db_value": null,
      "verdict": "FAIL",
      "reason": "<explanation>",
      "suspicious_pattern": "round_number | generic_name | unknown_import | wrong_container"
    }
  ],
  "db_query_log": [
    {
      "table": "<table>",
      "robot_id": 0,
      "column": "<column>",
      "query_result": null,
      "output_value": null,
      "match": false,
      "tolerance_used": 1e-6
    }
  ],
  "retry_count": 0,
  "max_retries": 2,
  "escalate_to_operator": false,
  "timestamp": "<ISO8601>"
}
```

Verdicts:
- PASS: all checks passed, all confidence scores verified
- WARN: non-critical issues found, operator notified, file can proceed with acknowledgment  
- FAIL: critical issues found, output rejected, retry triggered
