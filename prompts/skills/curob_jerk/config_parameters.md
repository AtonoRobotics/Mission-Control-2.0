# Config Parameters
# Part of: curob_jerk skill
# Load when: writing cuRobo YAML configs

## Permitted top-level config sections

jerk_limits:
  - Per-joint jerk limits in rad/s³
  - Source: empirical DB joints table, jerk_limit column
  - NULL in DB = NULL in config (no defaults, no estimates)

velocity_limits:
  - Per-joint velocity limits in rad/s
  - Source: empirical DB joints table, velocity_limit column

acceleration_limits:
  - Per-joint acceleration limits in rad/s²
  - Source: empirical DB joints table, acceleration_limit column

batch_processing:
  - batch_size: integer (32 is standard)
  - output_format: "joint_trajectory"
  - preserve_endpoints: true (always — cinematic paths have defined start/end)

trajopt:
  - scope: jerk_minimization ONLY
  - Cost weights for jerk, velocity, acceleration
  - NOT for goal reaching, NOT for collision cost

## Config file naming convention
curob_robot{robot_id}_v{schema_version}.yaml
Example: curob_robot7_v3.1.0.yaml
