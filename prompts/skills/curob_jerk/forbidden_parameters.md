# Forbidden Parameters
# Part of: curob_jerk skill
# Load when: validating cuRobo configs — any of these present = immediate FAIL

## Parameters that indicate path planning or collision (forbidden in this system)

The following parameter names must not appear anywhere in a cuRobo config output,
at any nesting level. Their presence means an agent used cuRobo beyond its defined scope.

**Collision / world model**
- collision_spheres
- collision_cache  
- world_model
- world_coll_checker
- collision_activation_distance

**Obstacle definitions**
- obstacle_cuboids
- obstacle_spheres
- obstacle_capsules
- obstacle_mesh

**Path planning / motion generation**
- motion_gen
- path_planning
- path_plan_config
- kinematics_solver
- use_cuda_graph_lbfgs
- project_pose_to_goal_frame
- trajopt_solver (only the path-planning variant — TrajOpt for jerk is permitted)

## What IS permitted

- Joint-space jerk limit parameters
- Per-joint velocity and acceleration bounds
- TrajOpt configuration scoped to jerk minimization
- Batch processing parameters
- Output trajectory format parameters

When uncertain whether a parameter is permitted or forbidden: it is forbidden.
Flag it in the validator report for operator review.
