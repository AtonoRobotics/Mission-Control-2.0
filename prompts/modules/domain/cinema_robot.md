# MODULE: cinema_robot
# Loaded by: URDF Build, Scene Build, cuRobo Config, Script Generation agents
# Size: 24 lines
# Version: 1.0.0

## Cinema Robot Domain Context

### Robot Type
6-axis industrial robot arms configured for cinema motion control.
NOT humanoid. NOT mobile. NOT autonomous navigation.
Deterministic, repeatable, high-precision cinematic motion.

### FIZ Axes
Focus, Iris, Zoom — cinema lens control axes.
Must be modeled in URDF as joints (continuous or prismatic depending on mechanism).
FIZ axes are additional to the 6 primary arm joints.
FIZ joint names, limits, and types come from the empirical DB — never assumed.

### Mechanical Artifacts
These are real and must not be ignored in simulation configs:
- Motor cogging: periodic torque ripple at low speeds
- Cable drag: velocity-dependent resistive torque
- Gearbox backlash: dead-band in position reversal

cuRobo addresses cogging, drag, and backlash via jerk minimization — NOT this agent.
Do not attempt to model these in URDF dynamics — that is cuRobo's domain.

### Camera Mount
ZED X stereo camera mounts at the end effector.
frame_id for the camera must match the TF tree — sourced from the sensor config registry.
Never assume frame_id naming conventions.

### Base Joint
Base may be locked (fixed joint) or free (revolute).
This is an operator-specified flag at build time — never default to either.
