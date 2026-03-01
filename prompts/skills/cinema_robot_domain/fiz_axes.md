# FIZ Axes
# Part of: cinema_robot_domain skill
# Load when: any task models Focus, Iris, or Zoom axes

## What FIZ Is

Focus, Iris, Zoom — cinema lens control axes attached to the arm's end effector.
These are physical actuated joints, not virtual parameters.
They appear in the URDF as joints with their own limits, types, and names.

## FIZ in URDF

FIZ joints are additional to the 6 primary arm joints.
A fully-configured cinema arm URDF has 9 joints: 6 arm + 3 FIZ.
FIZ joint type (continuous vs prismatic vs revolute) depends on the lens drive mechanism.
Source from DB — never assume rotary or linear based on the axis name.

## FIZ joint naming

Exact names from DB. Common patterns (not authoritative — always use DB):
  focus_joint, iris_joint, zoom_joint
Never shorten to f_joint, i_joint, z_joint without DB confirmation.

## What FIZ is NOT

FIZ is not a camera parameter (focal length, aperture setting).
FIZ is not controlled by the arm's motion controller directly.
FIZ is controlled by a separate lens controller — reflected in the ROS2 topic structure.
