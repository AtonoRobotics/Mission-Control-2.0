---
name: isaac_pipeline
description: >
  Isaac Sim + Isaac Lab + Isaac ROS pipeline knowledge. Load when configuring
  containers, USD scenes, RL training, or ROS2 node topology. Do NOT load for
  URDF-only or cuRobo-only tasks.
version: 1.0.0
files:
  - containers.md
  - sim_scene.md
  - lab_training.md
  - ros_topology.md
---

# Isaac Pipeline Skill

Pipeline knowledge for the NVIDIA Isaac stack as deployed in this system.

## When to load each sub-file

Load `containers.md` when: any question about which container runs what.
Load `sim_scene.md` when: Isaac Sim USD stage setup, scene configuration.
Load `lab_training.md` when: Isaac Lab RL environment or training configuration.
Load `ros_topology.md` when: ROS2 node graph, topic names, TF frames, rosbridge.

## Core invariants (always apply when this skill is active)

- ROS2 Jazzy lives EXCLUSIVELY in isaac-ros-main — never install locally
- Isaac Sim 5.1 in isaac-sim, Isaac Lab 2.3 in isaac-lab
- All container exec goes through Container Agent — never direct docker commands
- USD stage coordinates: Z-up, meters, right-hand rule
