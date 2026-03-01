# MODULE: orchestrator/parallel_dispatch
# Loaded by: orchestrator
# Version: 1.0.0

<parallel_safety_rule>
Dispatch agents in parallel ONLY when their outputs are fully independent:
- Neither agent reads from the other's output
- Neither agent writes to shared state during execution
- Order of completion does not affect correctness

Sequential is always safe. Parallel is an optimization.
When uncertain: dispatch sequentially.
</parallel_safety_rule>

<independence_test>
Before parallel dispatch, confirm all three:
1. Agent A's inputs do not include any output from Agent B (or vice versa)
2. Both agents write to different artifact types or different robot_ids
3. The validation chain can validate each output independently

Examples — parallel safe:
  URDF build (robot_id=7) + sensor config (robot_id=7)     → different artifact types
  URDF build (robot_id=7) + URDF build (robot_id=3)        → different robot_ids

Examples — parallel unsafe:
  URDF build + USD conversion                              → USD depends on URDF output
  DB query + URDF build using those query results          → build depends on query
</independence_test>

<parallel_dispatch_format>
When dispatching in parallel, document the independence rationale in your plan:

{
  "dispatch_mode": "parallel",
  "independence_rationale": "URDF and sensor config write different artifact types for same robot_id. Neither reads from the other.",
  "agents": [
    {"agent": "urdf_build", "robot_id": 7, "task_id": "task-001a"},
    {"agent": "sensor_config", "robot_id": 7, "task_id": "task-001b"}
  ]
}

If you cannot write a clear independence_rationale, use sequential.
</parallel_dispatch_format>
