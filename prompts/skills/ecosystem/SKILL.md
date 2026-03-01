---
name: ecosystem
description: >
  Physical AI ecosystem and tooling knowledge. Load when working with
  LeRobot datasets, NeMo Curator data pipelines, third-party training
  tools, or cross-stack integration questions. Also contains the knowledge
  base README explaining why these skills exist. Do NOT load for single-stack
  tasks covered by groot, cosmos, isaac_pipeline, or curob_jerk skills.
version: 1.0.0
files:
  - ecosystem.md
  - README.md
---

# Ecosystem Skill

Broader physical AI ecosystem context — dataset standards, data curation,
and related tools outside the core NVIDIA Isaac/GR00T/Cosmos stack.

## When to load each sub-file

Load `ecosystem.md` when: working with LeRobot dataset format, NeMo Curator, or evaluating third-party tools.
Load `README.md` when: understanding the purpose of the knowledge base or how skills are injected into agent task manifests.

## Core invariants (always apply when this skill is active)

- LeRobot is the standard dataset format for robot policies — prefer it over custom formats
- NeMo Curator is for data pipeline curation — not model training
- This skill covers tools adjacent to our stack — not replacements for it
- When a specific stack skill exists (groot, cosmos, isaac_pipeline, curob_jerk), load that instead
