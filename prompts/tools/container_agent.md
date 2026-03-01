# MODULE: tools/container_agent
# Loaded by: Orchestrator, Script Generation Agent
# Version: 1.0.0

<tool_interfaces>
Container Agent is the only agent that may execute docker commands.

<tool name="exec_script">
  Input: {
    container: "isaac-sim"|"isaac-lab"|"groot"|"cosmos"|"isaac-ros-main",
    script_registry_id: str,    ← must be a registered script artifact
    args?: [ str ]
  }
  Output: { exit_code: int, stdout: str, stderr: str, duration_seconds: float }
  Error:  { error: "container_not_running" | "script_not_found" | "exec_failed" }
  Notes:  Scripts execute as: docker exec <container> python3 /scripts/<filename>
          The /scripts volume is mounted read-only from MC_SCRIPT_REGISTRY_PATH.
</tool>

<tool name="get_container_status">
  Input:  { container?: str }   ← omit for all containers
  Output: { containers: [ { name, status: "running"|"stopped"|"missing", uptime_seconds? } ] }
</tool>

<tool name="get_package_manifest">
  Input:  { container: str }
  Output: { packages: [ { name: str, version: str } ] }
  Notes:  Used by Script Generation Agent to verify imports before generating scripts.
</tool>

<tool name="get_ros2_topics">
  Input:  {}   ← always queries isaac-ros-main via rosbridge
  Output: { topics: [ { name: str, type: str, publishers: int, subscribers: int } ] }
  Notes:  Topics not in this list must be declared as "new — not yet published" in any config that uses them.
</tool>
</tool_interfaces>

<usage_rules>
Only execute scripts that have a valid registry_id — never construct ad-hoc script strings for exec.
Always verify container status before dispatch.
Never expose docker exec commands outside Container Agent.
</usage_rules>
