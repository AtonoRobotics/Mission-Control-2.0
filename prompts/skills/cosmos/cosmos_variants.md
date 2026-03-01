# Cosmos-Transfer2.5 — Sim2Real and Data Augmentation

**GitHub:** https://github.com/nvidia-cosmos/cosmos-predict2.5 (Transfer section)
**Built on:** Cosmos-Predict2.5
**Purpose:** Transform structured/synthetic video into photorealistic training data

---

## What It Does

Cosmos-Transfer2.5 is a ControlNet-style framework built on Cosmos-Predict2.5.
It takes structured inputs (simulation renderings, depth maps, segmentation maps)
and generates photorealistic videos that preserve the underlying structure.

**Key use cases:**
- **Sim2Real:** Isaac Sim renders → photorealistic training video
- **Real2Real:** Augment real robot video with environment changes
- **Domain randomization:** Change lighting, textures, backgrounds while preserving motion

---

## Supported Control Inputs

| Input Type | What it controls |
|---|---|
| RGB video (structured) | Full scene structure from sim |
| Depth map | 3D structure preservation |
| Segmentation map | Object boundaries, robot silhouette |
| Edge map (Canny) | Fine structural details |
| Optical flow | Motion preservation |
| **Multi-control** | Combination of above (Transfer2.5 specialty) |

---

## Install & Inference

```bash
# Uses same repo as Cosmos-Predict2.5
cd cosmos-predict2.5

# Download Transfer model
huggingface-cli download nvidia/Cosmos-Transfer2.5-7B \
    --local-dir ./checkpoints/cosmos-transfer2.5

# Sim2Real: Isaac Sim rendering → photorealistic
python transfer/inference.py \
    --input_video ./isaac_sim_render.mp4 \
    --control_type rgb,depth \
    --prompt "Realistic factory environment, natural lighting" \
    --output ./photorealistic_output.mp4 \
    --model_path ./checkpoints/cosmos-transfer2.5

# Real2Real: augment environment while preserving robot motion
python transfer/inference.py \
    --input_video ./real_robot_video.mp4 \
    --control_type rgb \
    --prompt "Same robot motion but in outdoor warehouse" \
    --output ./augmented_video.mp4
```

---

## GR00T-Mimic Integration

Transfer2.5 is the augmentation step in GR00T-Mimic:

```
Isaac Lab simulation renders (physics-accurate but visually simple)
         ↓ Cosmos-Transfer2.5
Photorealistic renders (same motion, diverse environments)
         ↓
Training dataset with sim-to-real bridge built in
```

---

---

# Cosmos-Reason2 — Physical AI Reasoning VLM

**GitHub:** https://github.com/nvidia-cosmos/cosmos-reason2
**Size:** 7B parameters
**Purpose:** Chain-of-thought reasoning about physical world, motion, causality
**Leaderboard:** #1 on Physical Reasoning leaderboard (as of 2025)
**Available as:** NVIDIA NIM microservice

---

## What It Does

Cosmos-Reason2 is a multimodal VLM specifically trained on physical world reasoning.
Unlike general-purpose VLMs, it understands:
- Physics: gravity, momentum, collisions, fluid dynamics
- Robot motion: reachability, joint limits, trajectory feasibility
- Causality: what actions lead to what outcomes
- Spatial relationships: 3D scene understanding from 2D video

**Input:** Video or image + text query
**Output:** Text response via long-horizon chain-of-thought reasoning

---

## Architecture

```
Input: Video frames OR images + text question
         ↓
  Vision encoder (temporal-aware)
  - Processes video as sequence, not just frames
  - Understands motion and change over time
         ↓
  7B LLM with chain-of-thought
  - Grounded in physical common sense
  - Generates reasoning steps before final answer
         ↓
Output: "Step 1: The robot arm is at position X...
        Step 2: The cube is within reach because...
        Therefore: The next action should be..."
```

---

## Usage

```python
from cosmos_reason import CosmosReason

model = CosmosReason.from_pretrained("nvidia/Cosmos-Reason2-7B")

# Query about robot action feasibility
response = model.query(
    video_path="robot_scene.mp4",
    question="Can the robot pick up the blue cube without colliding with the red box?"
)
print(response)
# "Step 1: The blue cube is located at [0.3, 0.1, 0.75] relative to robot base.
#  Step 2: The red box occupies the region [0.2-0.4, 0.0-0.2, 0.6-0.8].
#  Step 3: A straight-line approach would intersect the red box boundary.
#  Step 4: An angled approach from 30° would clear the obstacle.
#  Answer: Yes, but requires 30° offset approach trajectory."

# Annotate synthetic data quality
annotation = model.annotate(
    video_path="synthetic_trajectory.mp4",
    annotation_task="rate_physics_plausibility"
)
# Returns: {"score": 0.87, "issues": ["gripper force too high at t=2.3s"]}
```

---

## Role in GR00T-Dreams Pipeline

```
Cosmos-Reason2 serves two roles in Dreams:
1. Text encoder for Cosmos-Predict2.5 (richer physics-aware prompts)
2. Data quality filter (critique generated neural trajectories)

# Filter low-quality dreams
for dream_video in generated_dreams:
    quality = cosmos_reason.rate_physics_plausibility(dream_video)
    if quality["score"] > 0.7:
        keep_for_training(dream_video)
    else:
        discard(dream_video)
```

---

---

# Cosmos-Policy — World Model as Policy Backbone

**Purpose:** Post-train Cosmos-Predict into a robot policy model
**Approach:** Replace video output head with action output head
**Available:** Cosmos-Predict2.5/Robot/Policy checkpoints on HuggingFace

---

## Concept

A well-trained world foundation model (Cosmos-Predict) already understands
how the world behaves. By replacing the video denoising head with an action
prediction head, it becomes a policy that generates actions based on its
understanding of world dynamics.

```
Standard Cosmos-Predict:
  observation → [WFM backbone] → video frames

Cosmos-Policy:
  observation → [WFM backbone] → robot actions
              (same backbone, different output head)
```

---

## Available Policy Models

```bash
# RoboCasa benchmark policy
huggingface-cli download nvidia/Cosmos-Predict2.5-2B-Robot-Policy-RoboCasa

# LIBERO benchmark policy
huggingface-cli download nvidia/Cosmos-Predict2.5-2B-Robot-Policy-Libero
```

---

## Post-Training as Policy

```bash
# Convert world model to policy model
python cosmos-predict2.5/robot/policy/finetune.py \
    --base_model nvidia/Cosmos-Predict2.5-2B-Robot \
    --dataset path/to/lerobot_dataset \
    --output_dir ./policy_checkpoints/my_robot \
    --num_steps 50000 \
    --action_dim 7      # DOF count for your robot
```

Inference guide: `cosmos-cookbook` repo → robot/policy section

---

---

# Cosmos-Curate — Video Data Curation Pipeline

**GitHub:** https://github.com/nvidia-cosmos/cosmos-curate
**Purpose:** Process, analyze, and organize large video datasets for world model training

---

## What It Does

Building world foundation models requires massive, high-quality video datasets.
Cosmos-Curate is a distributed pipeline that:
1. **Ingests** raw video at petabyte scale
2. **Filters** by quality (blur, exposure, relevance)
3. **Captions** videos automatically (action descriptions)
4. **Embeds** videos for semantic search
5. **Deduplicates** near-duplicate clips
6. **Packages** into training-ready shards

---

## Architecture

```
Raw video ingestion (S3, local, HTTP)
         ↓ Distributed processing (Dask + NVIDIA GPU cluster)
  Quality filtering
  - Motion analysis (reject static scenes)
  - Blur detection
  - Exposure/contrast checks
  - Scene type classification
         ↓
  Caption generation
  - Cosmos-Reason2 generates action descriptions
  - Used as text conditioning in Predict training
         ↓
  Embedding + deduplication
  - Cosmos-Embed NIM for semantic similarity
  - Near-duplicate removal
         ↓
Output: Curated, captioned, deduplicated training shards
```

---

## Usage

```bash
# Install
pip install cosmos-curate

# Curate a video dataset
cosmos-curate \
    --input_dir /path/to/raw_robot_videos \
    --output_dir /path/to/curated_dataset \
    --filter_quality 0.7 \        # quality threshold 0-1
    --generate_captions \
    --caption_model Cosmos-Reason2-7B \
    --deduplicate \
    --num_gpus 8

# Dataset search (semantic retrieval)
cosmos-curate search \
    --dataset /path/to/curated_dataset \
    --query "robot picking up small object with precision grip" \
    --top_k 100 \
    --output matching_clips.json
```

---

## NeMo Curator Integration

NeMo Curator provides the same capability with added scale:
- 20M hours of video processed in 2 weeks on Blackwell (vs 3.4 years on CPU)
- Integrates with NeMo training framework

```bash
# NeMo Curator video pipeline
nemo-curator \
    --pipeline video \
    --input /path/to/raw_videos \
    --output /path/to/curated \
    --num_nodes 8 \
    --gpus_per_node 8 \
    --captioning_model cosmos-reason2
```
