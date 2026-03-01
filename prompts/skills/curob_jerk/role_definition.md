# Role Definition
# Part of: curob_jerk skill
# Load when: any task involves cuRobo configuration or scope questions

## What cuRobo does in this system

cuRobo receives raw joint-space trajectories from cinema arm motion controllers.
These trajectories contain mechanical artifacts (cogging, backlash, cable drag).

cuRobo outputs smoothed trajectories with jerk minimized in joint space,
preserving the intended cinematic camera path while removing mechanical noise.

Input:  raw_trajectory[joint_0..5][t] — from motion controller
Output: smooth_trajectory[joint_0..5][t] — jerk-minimized, artifact-free

## What cuRobo does NOT do in this system

- Path planning (the path is already defined by the motion controller)
- Obstacle avoidance (the arm operates in a controlled studio environment)
- Collision detection (not needed — studio is pre-cleared before every shot)
- Kinematics solving (handled by the motion controller upstream)
- Any real-time control loop interaction

## Processing mode: batch

cuRobo runs in BATCH mode on pre-recorded trajectories, not online.
Latency is not a constraint. Smoothing quality is the only objective.
Batch size of 32+ trajectories is typical.
