# Mechanical Artifacts
# Part of: cinema_robot_domain skill
# Load when: configuring cuRobo, analyzing trajectory smoothness

## What mechanical artifacts are

Physical imperfections in cinema arm motion that create unwanted vibration:
- Motor cogging: periodic torque ripple from stepper/servo motor magnets
- Cable drag: friction and compliance from power/signal cables along the arm
- Gearbox backlash: lost motion when motor reversal occurs in gear teeth
- Bearing stiction: static friction that causes position jump at rest-to-motion

## Why they matter for the digital twin

Raw joint trajectories from motion controllers contain these artifacts as
high-frequency jitter superimposed on the intended cinematic motion path.

For simulation accuracy: artifacts must be removed before digital twin replay.
For training data: artifacts corrupt neural network training if not removed.

## Who handles them

cuRobo — jerk minimization in joint space — is the sole handler of mechanical artifacts.
This is cuRobo's ENTIRE purpose in this system.
URDF does not model artifacts. Isaac Sim does not remove them. nvblox ignores them.
