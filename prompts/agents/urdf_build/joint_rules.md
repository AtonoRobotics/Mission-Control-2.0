# MODULE: urdf_build/joint_rules
# Loaded by: URDF Build Agent
# Size: 30 lines
# Version: 1.0.0

## URDF Joint Requirements

Source for all values: empirical DB via DB Agent. No exceptions.

### Required per joint (missing = structural failure, not NULL)
- `name` — exact string from DB, case-sensitive
- `type` — revolute | prismatic | continuous | fixed
- `parent` link name — exact string from DB
- `child` link name — exact string from DB  
- `origin xyz` — translation in meters
- `origin rpy` — rotation in radians
- `axis xyz` — for revolute/prismatic only

### Critical NULLs (block promotion if NULL)
- `limit effort` — max torque in N·m
- `limit velocity` — max speed in rad/s or m/s
- `limit lower` — lower position bound
- `limit upper` — upper position bound

### Non-critical NULLs (warn, allow promotion)
- `dynamics damping`
- `dynamics friction`

### FIZ Joints (cinema-specific)
Focus, Iris, Zoom axes are joints.
Type is determined by mechanism — sourced from DB, never assumed.
FIZ joints are additional to the 6 primary arm joints.

### Confidence Scores Required
Every joint value gets a confidence score per confidence_score module.
Joint name sourced from DB: 1.0
Joint limit sourced from DB: 1.0
Any derived value: ≤ 0.95 with method
