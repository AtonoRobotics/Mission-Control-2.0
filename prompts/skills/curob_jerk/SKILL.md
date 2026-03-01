---
name: curob_jerk
description: >
  cuRobo jerk minimization domain knowledge. Load ONLY when configuring cuRobo
  or validating cuRobo configs. This skill defines what cuRobo does and does NOT
  do in this system. Critical for preventing scope creep into path planning.
version: 1.0.0
files:
  - role_definition.md
  - config_parameters.md
  - forbidden_parameters.md
---

# cuRobo Jerk Minimization Skill

cuRobo serves one purpose in this system: removing mechanical shake from
joint-space trajectories produced by 6-axis cinema arms.

## Core distinction — load this first

cuRobo's role here is **jerk minimization only**.
This is not path planning. This is not obstacle avoidance. This is not collision detection.

Load `role_definition.md` for the full scope boundary.
Load `config_parameters.md` when writing cuRobo YAML configs.
Load `forbidden_parameters.md` when validating cuRobo output — any forbidden param = FAIL.

## Why this matters

cuRobo's documentation covers many capabilities. This system uses a narrow subset.
Agents that generalize from cuRobo docs will produce configs with features that are
wrong for this system. The skill defines the boundary explicitly.
