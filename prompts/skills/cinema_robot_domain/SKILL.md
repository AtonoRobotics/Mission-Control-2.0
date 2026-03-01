---
name: cinema_robot_domain
description: >
  Cinema robot arm domain knowledge. Load when working with 6-axis cinema
  motion control robots, FIZ axes, camera mounts, or mechanical artifacts
  (cogging, backlash, cable drag). Do NOT load for general robotics tasks.
version: 1.0.0
files:
  - arm_geometry.md
  - fiz_axes.md
  - mechanical_artifacts.md
  - camera_mount.md
---

# Cinema Robot Domain Skill

Domain context for 6-axis cinema arms used in motion-controlled film production.

## When to load each sub-file

Load `arm_geometry.md` when: building URDF, configuring joint limits, setting up scenes.
Load `fiz_axes.md` when: any task involves Focus, Iris, or Zoom axis modeling.
Load `mechanical_artifacts.md` when: configuring cuRobo or discussing smoothing parameters.
Load `camera_mount.md` when: configuring ZED X sensor, sensor configs, or TF frames.

## Core invariants (always apply when this skill is active)

- Robots are 6-axis industrial arms for cinema — not mobile, not humanoid, not autonomous
- Motion is deterministic and repeatable — cinematic paths are authored, not planned
- FIZ axes are additional to the 6 primary joints — total joint count is 9 for a full cinema arm
- All mechanical artifact handling (cogging, backlash, drag) belongs to cuRobo, not URDF
