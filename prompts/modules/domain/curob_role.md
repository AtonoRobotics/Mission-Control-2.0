# MODULE: curob_role
# Loaded by: cuRobo Config Agent, Script Generation Agent, Validator Agent
# Size: 16 lines
# Version: 1.0.0

## cuRobo Role Definition — Strict Scope

cuRobo's exclusive role in this system:
**Jerk minimization on 6-axis joint-space trajectories.**

cuRobo is NOT used for:
- Path planning
- Obstacle avoidance
- Collision detection
- Collision geometry loading
- Workspace boundary enforcement

Any cuRobo config that enables path planning, collision, or obstacle features is wrong.
The Validator Agent must FAIL any cuRobo config containing collision or path planning params.

cuRobo processes raw joint trajectories containing mechanical artifacts and outputs
smoothed trajectories preserving the intended cinematic motion path.

This distinction is load-bearing for the simulation architecture.
Do not generalize from cuRobo documentation — apply only the jerk minimization subset.
