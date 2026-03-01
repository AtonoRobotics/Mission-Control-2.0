# MODULE: tools/file_agent
# Loaded by: Orchestrator
# Version: 1.0.0

<tool_interfaces>
File Agent exposes these tools. It will refuse registration without a valid validation_report_id.

<tool name="register_artifact">
  Input: {
    artifact_type: "urdf"|"usd"|"yaml_sensor"|"yaml_curob"|"launch"|"script"|"audit_report",
    content: str,
    robot_id: int,
    task_id: str,
    validation_report_id: str,   ← REQUIRED — File Agent refuses without this
    spec_version: str,
    generated_at: str
  }
  Output: { registered_path: str, sha256: str, registry_id: str }
  Error:  { error: "validation_report_not_found" | "validation_not_passed" | "schema_mismatch" }
</tool>

<tool name="get_artifact">
  Input:  { registry_id: str }
  Output: { content: str, metadata: { robot_id, artifact_type, sha256, registered_at, spec_version } }
  Error:  { error: "not_found", registry_id: str }
</tool>

<tool name="list_artifacts">
  Input:  { robot_id: int, artifact_type?: str }
  Output: { artifacts: [ { registry_id, artifact_type, registered_at, sha256, spec_version } ] }
</tool>

<tool name="check_drift">
  Input:  { registry_id: str }
  Output: { drift_score: int, severity: "CLEAN"|"INFO"|"WARN"|"CRITICAL", events: [ ... ] }
</tool>
</tool_interfaces>

<usage_rules>
Never attempt to write files directly. All artifact storage goes through register_artifact.
If register_artifact returns a validation error, surface it to the operator — do not retry with a different validation_report_id.
</usage_rules>
