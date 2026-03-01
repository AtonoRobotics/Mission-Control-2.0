# MODULE: hallucination_flags
# Loaded by: Validator Agent
# Size: 45 lines
# Version: 1.0.0

## Hallucination Detection — Priority-Ordered Checks

Run all checks independently. Each failure is a separate finding.

### Priority 1 — Physical Values (Highest Risk)
Invented physical constants are the most dangerous failure mode in robotics simulation.

Check: Every mass, inertia tensor component, joint limit (effort/velocity/position), 
damping, and friction value must exist verbatim in the empirical DB.

Detection pattern: Plausible round numbers (1.0, 0.5, 10.0, 100.0) are suspicious.
Real empirical values are typically irregular (1.247, 0.083, 47.3).
Flag any round-number physical constant for manual review even if confidence = 1.0.

Action: Query empirical DB for the exact value. If not found → FAIL.

### Priority 2 — NULL Fields Silently Filled
The most insidious hallucination: a field that should be NULL contains a value.

Check: Cross-reference every output field value against the empirical DB.
If the DB has NULL for that field and the output has a value → FAIL immediately.

Detection pattern: Values that are "typical for this type of robot" with no DB source.

### Priority 3 — Joint and Link Names
Wrong names cause silent simulation failures that are hard to trace.

Check: Every joint name and link name in URDF output must match DB exactly — 
case-sensitive, underscore-sensitive, no abbreviations.

Detection pattern: Shortened names ("joint1" vs "robot_arm_joint_1"), 
generic names ("base_link" when DB has "robot_base_link").

### Priority 4 — File Paths
Check: Every file path in output must be confirmed to exist on disk before output is accepted.
Unconfirmed paths are flagged as UNVERIFIED, not failed (file may not exist yet).
But path structure must match .env.machines registry path variables.

### Priority 5 — ROS2 Topic Names
Check: Topic names in launch files and sensor configs must match active ROS2 topic list
OR be explicitly marked as "new topic — not yet published".
Generic topic names ("/camera/image", "/joint_states") without namespace are suspicious.

### Priority 6 — Container Names
Check: Every container name must match exactly one entry in the container registry.
Typos here cause silent exec failures.

### Priority 7 — Script Imports
Check: Every Python import in generated scripts must be confirmed available 
in the target container's package list. Unknown imports → FAIL.

## Validator Output Format for Hallucination Findings

```json
{
  "hallucination_findings": [
    {
      "priority": 1,
      "field": "joint_1_effort_limit",
      "value_in_output": 50.0,
      "db_value": null,
      "verdict": "FAIL",
      "reason": "Value not found in empirical DB. Round number suspicious.",
      "action": "Set to NULL"
    }
  ]
}
```
