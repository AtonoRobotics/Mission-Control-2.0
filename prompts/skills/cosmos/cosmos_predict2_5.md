# Cosmos-Predict2.5 — Unified World Foundation Model

**Status:** Current release (October 2025)
**GitHub:** https://github.com/nvidia-cosmos/cosmos-predict2.5
**HuggingFace:** nvidia/Cosmos-Predict2.5-2B, nvidia/Cosmos-Predict2.5-14B
**Paper:** arXiv:2511.00062 — "World Simulation with Video Foundation Models for Physical AI"
**License:** NVIDIA Open Model License (commercial permitted)

---

## What It Is

Cosmos-Predict2.5 unifies three previously separate models into one:
- **Text2World:** Generate video from text description
- **Image2World:** Generate future frames from a single image
- **Video2World:** Predict future frames from video context

Single model, two scales: 2B and 14B parameters.
Trained on 200M curated video clips.
Uses Cosmos-Reason1 as its text encoder (physical AI VLM).

---

## Architecture

```
Input: Text prompt AND/OR image AND/OR video frames
         ↓
  Cosmos-Reason1 (text encoder)
  - Physical AI VLM for richer text grounding
  - Understands physics, causality, robot motion
  - Provides text embeddings with spatial-temporal awareness
         ↓
  Flow-based Diffusion Transformer
  - Replaces older DDPM approach (Predict1)
  - Unified architecture handles all 3 input modalities
  - Trained with RL-based post-training for quality
         ↓
Output: High-quality video of future world state
        Consistent physics, object permanence, robot motion
```

---

## Models Available

| Model | Size | Use Case | HuggingFace |
|---|---|---|---|
| Cosmos-Predict2.5-2B | 2B | Fast inference, development | nvidia/Cosmos-Predict2.5-2B |
| Cosmos-Predict2.5-14B | 14B | Production quality | nvidia/Cosmos-Predict2.5-14B |
| Predict2.5/Robot/Action-Cond | 2B/14B | Robot action-conditioned | nvidia/Cosmos-Predict2.5-2B-Robot |
| Predict2.5/Auto/Multiview | 14B | Autonomous vehicle multi-camera | nvidia/Cosmos-Predict2.5-14B-Auto |

---

## Install

```bash
git clone https://github.com/nvidia-cosmos/cosmos-predict2.5.git
cd cosmos-predict2.5

# Follow setup guide (CUDA 12.x required)
pip install -r requirements.txt

# Download model weights
huggingface-cli download nvidia/Cosmos-Predict2.5-2B \
    --local-dir ./checkpoints/cosmos-predict2.5-2b
```

**VRAM requirements:**
- 2B model: 40GB GPU (A100/H100)
- 14B model: 80GB GPU (H100)
- Full offloading mode: RTX 3090/4090 24GB (slower)

---

## Inference

### Text2World

```python
from cosmos_predict2_5 import CosmosPredictPipeline

pipeline = CosmosPredictPipeline.from_pretrained(
    "nvidia/Cosmos-Predict2.5-2B"
)

# Generate video from text
video = pipeline.text2world(
    prompt="A robotic arm picks up a red cube from a table and places it in a bin",
    num_frames=121,      # ~4 seconds at 30fps
    height=704,
    width=1280,
    guidance_scale=7.5,
)
# video: (T, H, W, 3) uint8
```

### Image2World

```python
from PIL import Image

image = Image.open("scene_start.jpg")

video = pipeline.image2world(
    image=image,
    prompt="The robot arm extends and grasps the object",
    num_frames=121,
    guidance_scale=7.0,
)
```

### Video2World (for GR00T-Dreams)

```python
# Used in GR00T-Dreams to generate action continuations
video_context = load_video("robot_approaching.mp4")  # first N frames

future_frames = pipeline.video2world(
    video=video_context,
    prompt="Robot continues to pick up the cube",
    num_future_frames=90,
)
```

### Action-Conditioned Generation (Robot)

```python
# For robot-specific post-trained checkpoints
from cosmos_predict2_5.robot import ActionConditionedPipeline

pipeline = ActionConditionedPipeline.from_pretrained(
    "nvidia/Cosmos-Predict2.5-2B-Robot"
)

# Generate video conditioned on planned actions
video = pipeline.predict(
    current_observation=obs_image,
    planned_actions=joint_trajectory,  # (T, N_joints) float32
    prompt="Execute pick and place",
)
```

---

## Post-Training for Robots (Robotics Domain Adaptation)

```bash
# Fine-tune on your robot's visual domain
python train.py \
    --config configs/robot_finetune.yaml \
    --base_model nvidia/Cosmos-Predict2.5-2B \
    --data_dir /path/to/robot_videos \
    --output_dir ./checkpoints/my_robot_cosmos \
    --num_gpus 8 \
    --batch_size 4 \
    --learning_rate 1e-5 \
    --num_steps 10000
```

**Data requirements for robot fine-tuning:**
- 1,000–10,000 video clips of robot operation
- 5–30 seconds per clip
- Multiple camera angles (at least front + side)
- Metadata: task description, success flag

---

## CLI Usage

```bash
# Text2World
python -m cosmos_predict2_5.inference \
    --mode text2world \
    --prompt "Robot arm assembly task" \
    --output output.mp4 \
    --num_gpus 1

# Image2World
python -m cosmos_predict2_5.inference \
    --mode image2world \
    --input_image scene.jpg \
    --prompt "Robot picks up object" \
    --output future.mp4

# With model offloading (24GB GPU)
python -m cosmos_predict2_5.inference \
    --mode text2world \
    --prompt "..." \
    --offload_strategy full \
    --output output.mp4
```

---

## Predict2.5 vs Predict1 Improvements

| Feature | Predict1 | Predict2.5 |
|---|---|---|
| Architecture | Separate Text2World / Video2World | Unified single model |
| Text encoder | Standard CLIP | Cosmos-Reason1 (physics-aware) |
| Training data | 20M hrs video | 200M curated clips |
| Post-training | None | RL-based quality refinement |
| Output quality | Good | Substantially improved |
| Physics accuracy | Moderate | High (reduced hallucination) |
| Long horizon | Limited | Extended via Video2World |

---

## Integration with Mission Control

**Primary use:** GR00T-Dreams pipeline for cinema robot generalization

```python
# In mission-control/autogen_teams/dreams_team.py
# Cosmos-Predict2.5 generates "dreams" of new camera moves
# from single reference image + language instruction

pipeline = CosmosPredictPipeline.from_pretrained(
    "nvidia/Cosmos-Predict2.5-14B"  # 14B for best quality
)

dreams = pipeline.image2world(
    image=reference_shot,
    prompt=f"Cinema robot arm executes {move_description}",
    num_frames=300,  # 10 seconds at 30fps
)
# Dreams fed to IDM → neural trajectories → GR00T fine-tuning
```
