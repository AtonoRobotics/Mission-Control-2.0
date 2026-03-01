# Arm Geometry
# Part of: cinema_robot_domain skill
# Load when: URDF build, joint configuration, scene placement

## 6-Axis Structure

Primary joints: 6 revolute joints (J1–J6), sourced from empirical DB.
Joint naming: exact strings from DB, case-sensitive. Do not abbreviate or rename.
Joint types: all revolute unless DB specifies otherwise.
Base joint: operator flag at build time — `base_locked=true` → fixed, `false` → revolute.
Never default the base joint type.

## Physical Properties Source

All mass, inertia, and joint limit values come exclusively from the empirical DB.
The DB sources these from: manufacturer CAD files (mass/inertia) and datasheets (joint limits).
NULL in DB = no verified source = NULL in URDF. No substitution.

## Coordinate Convention

Joint axis vectors follow REP-103 convention (ROS right-hand rule).
Origin positions and rotations are in meters and radians.
Verify axis direction from DB — do not assume standard orientations for industrial arms.
