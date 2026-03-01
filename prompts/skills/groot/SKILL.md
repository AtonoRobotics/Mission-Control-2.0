---
name: groot
description: >
  GR00T foundation model and blueprint knowledge. Load when working with
  GR00T N1.6 training, fine-tuning, or deployment; GR00T-Mimic synthetic
  data generation; GR00T-Dreams world-model trajectories; or GR00T variant
  modules (Teleop, Dexterity, Control, Perception). Do NOT load for
  Isaac Sim scene setup or cuRobo tasks.
version: 1.0.0
files:
  - groot_n1_6.md
  - groot_mimic.md
  - groot_dreams.md
  - groot_variants.md
---

# GR00T Skill

NVIDIA GR00T ecosystem knowledge for robot foundation models, synthetic data
generation, and policy training pipelines.

## When to load each sub-file

Load `groot_n1_6.md` when: training, fine-tuning, or deploying the GR00T N1.6 VLA model.
Load `groot_mimic.md` when: generating synthetic trajectory datasets from demonstrations.
Load `groot_dreams.md` when: generating synthetic data for new tasks via world foundation models.
Load `groot_variants.md` when: configuring teleoperation, dexterity, control, or perception modules.

## Core invariants (always apply when this skill is active)

- GR00T N1.6 is the current release — do not reference N1.5 or earlier
- Training runs in Isaac Lab — not standalone PyTorch scripts
- Synthetic data pipelines (Mimic, Dreams) are Omniverse blueprints, not GR00T components
- GR00T-Dreams requires Cosmos-Predict2 — load the cosmos skill if configuring the world model
