---
name: cosmos
description: >
  NVIDIA Cosmos world foundation model knowledge. Load when working with
  Cosmos-Predict2.5 video generation, Cosmos-Transfer2.5 sim2real domain
  transfer, or world model inference for synthetic data. Do NOT load for
  GR00T training or Isaac Sim scene tasks.
version: 1.0.0
files:
  - cosmos_predict2_5.md
  - cosmos_variants.md
---

# Cosmos Skill

NVIDIA Cosmos world foundation model stack for physical AI video generation
and sim2real transfer.

## When to load each sub-file

Load `cosmos_predict2_5.md` when: configuring Cosmos-Predict2.5 inference, model selection (2B vs 14B), or video generation pipelines.
Load `cosmos_variants.md` when: configuring Cosmos-Transfer2.5 for sim2real domain transfer or data augmentation.

## Core invariants (always apply when this skill is active)

- Cosmos-Predict2.5 is the current release — do not reference Cosmos 1.0 or Cosmos-Tokenizer alone
- Two model sizes: 2B (fast, single GPU) and 14B (high fidelity, multi-GPU)
- Transfer2.5 is built on Predict2.5 — not a separate model family
- GR00T-Dreams depends on Cosmos — if both are needed, load both skills
