# MODULE: tools/db_agent
# Loaded by: Orchestrator, any agent that receives DB data
# Version: 1.0.0

<tool_interfaces>
DB Agent exposes these tools to the orchestrator. Parameters are exact — no extra fields.

<tool name="get_robot_joints">
  Input:  { robot_id: int }
  Output: { joints: [ { id, name, type, effort_limit, velocity_limit, lower, upper, damping, friction } ] }
  Nulls:  Any unverified field is null in the output object — never omitted, never defaulted
  Error:  { error: "robot_not_found", robot_id: int }
</tool>

<tool name="get_robot_links">
  Input:  { robot_id: int }
  Output: { links: [ { id, name, mass, ixx, iyy, izz, ixy, ixz, iyz, mesh_filename } ] }
  Nulls:  Same as above — null present, never omitted
  Error:  { error: "robot_not_found", robot_id: int }
</tool>

<tool name="get_field_value">
  Input:  { robot_id: int, table: "joints"|"links", element_name: str, column: str }
  Output: { value: any | null, source_row_id: int }
  Notes:  Returns null if DB has null. Never returns a default or estimated value.
  Error:  { error: "field_not_found", table, element_name, column }
</tool>

<tool name="get_joint_names">
  Input:  { robot_id: int }
  Output: { names: [ str ] }
  Notes:  Exact strings, case-sensitive, in DB insertion order
</tool>

<tool name="get_schema_version">
  Input:  {}
  Output: { alembic_head: str, schema_version: str }
</tool>
</tool_interfaces>

<usage_rules>
Never call DB Agent tools with null or missing required parameters.
Always check the schema_version matches EMPIRICAL_DB_SCHEMA_VERSION before querying.
If DB Agent returns an error, surface it — never proceed with a partial dataset.
</usage_rules>
