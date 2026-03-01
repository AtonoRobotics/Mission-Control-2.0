# GR00T N1.6 — Foundation Model for Generalist Robots

**Status:** Current release (as of 2025). Supersedes N1.5.
**Type:** Vision-Language-Action (VLA) model
**GitHub:** https://github.com/NVIDIA/Isaac-GR00T
**HuggingFace:** nvidia/Isaac-GR00T-N1.6-3B
**License:** NVIDIA Open Model License (commercial use permitted)

---

## What It Is

GR00T N1.6 is a cross-embodiment VLA model that takes multimodal input
(language instructions + images) and outputs continuous robot actions.
Single model, single set of weights — runs on multiple robot embodiments
(bimanual, semi-humanoid, humanoid).

**Key capabilities:**
- Grasping and manipulating objects with one or both arms
- Transferring items between arms
- Multi-step tasks requiring long context
- Material handling, packaging, inspection

---

## Architecture (N1.6 specific)

```
Input: Language instruction + camera images (flexible resolution, native aspect ratio)
         ↓
  Cosmos-Reason-2B VLM (internal NVIDIA variant)
  - Vision encoder → image tokens
  - LLM → text tokens + embodied reasoning
  - Supports flexible resolution WITHOUT padding
  - Trained on general vision-language + embodied reasoning tasks
         ↓
  Diffusion Transformer (DiT) head
  - 32 layers (2x larger than N1.5's 16 layers)
  - Cross-attends to VLM embeddings
  - Processes robot state + noised actions
  - Denoises → continuous action output
         ↓
Output: Continuous joint actions
```

**Dual-system cognition (from N1 architecture):**
- System 2 (VLM): Slow, deliberate reasoning — interprets environment, plans
- System 1 (DiT): Fast, reactive control — generates precise motor commands

---

## Install

```bash
# Requires Python 3.10+, CUDA 12.x, PyTorch 2.x
git clone https://github.com/NVIDIA/Isaac-GR00T.git
cd Isaac-GR00T

# Install with uv (recommended)
pip install uv
uv sync

# Or pip
pip install -e ".[dev]"
```

**Hardware requirements:**
- Minimum: 1× A100 80GB or H100 for inference
- Fine-tuning: 1–8× H100 recommended
- Policy server runs on same GPU as fine-tuning environment

---

## Running Inference

```python
from groot.model import GR00TPolicy

# Load pre-trained model
policy = GR00TPolicy.from_pretrained("nvidia/Isaac-GR00T-N1.6-3B")

# Run inference (single step)
action = policy.predict(
    images={"camera_0": img_tensor},        # (C, H, W) float32
    language_instruction="Pick up the red cube",
    robot_state=joint_positions,            # (N_joints,)
)
# action shape: (action_horizon, action_dim)
```

**Policy server (for real robot deployment):**
```bash
# Start the policy server
python -m groot.server.run_gr00t_server \
    --model nvidia/Isaac-GR00T-N1.6-3B \
    --port 8000

# Client connects and sends observations, receives actions
```

---

## Fine-tuning on Custom Robot

GR00T N1.6 is designed for post-training with 20–40 demonstrations.

**Data format:** LeRobot dataset format (HuggingFace)
```python
# Dataset structure
dataset/
├── data/
│   ├── chunk-000/
│   │   ├── episode_000000.parquet   # actions, states
│   │   └── ...
├── videos/
│   ├── chunk-000/
│   │   ├── observation.images.camera_0/
│   │   │   └── episode_000000.mp4
└── meta/
    ├── info.json                    # dataset metadata
    ├── tasks.jsonl                  # language annotations
    └── stats.json                   # normalization stats
```

**Fine-tuning script:**
```bash
python scripts/finetune.py \
    --model nvidia/Isaac-GR00T-N1.6-3B \
    --dataset path/to/lerobot_dataset \
    --output_dir ./checkpoints/my_robot \
    --num_epochs 100 \
    --batch_size 32 \
    --learning_rate 1e-4
```

**Recommended fine-tuning config:**
- Batch size: max your GPU allows
- Steps: 20,000 for good convergence
- Freeze VLM backbone, train DiT + adapter

---

## Supported Embodiments

Pre-trained on bimanual, semi-humanoid, and full humanoid data.
Post-training targets include:
- Fourier GR-1
- Unitree G1
- 1X NEO
- Custom 6-DOF arms (via embodiment config)

**Adding new embodiment:**
```python
# In groot/experiment/data_config.py
EMBODIMENT_CONFIGS = {
    "my_robot": EmbodimentConfig(
        action_dim=7,           # DOF count
        state_dim=14,           # joint pos + vel
        camera_keys=["cam_0"],
        modality_config="path/to/modality.json",
    )
}
```

---

## Simulation Evaluation Benchmarks

GR00T N1.6 is evaluated on:
- **LIBERO** — language-conditioned manipulation
- **SimplerEnv** — sim-to-real transfer
- **RoboCasa** — household manipulation

```bash
# Run LIBERO benchmark
python scripts/eval_libero.py \
    --checkpoint ./checkpoints/my_robot/best.ckpt \
    --task_suite libero_spatial

# Run SimplerEnv
python scripts/eval_simpler.py \
    --checkpoint ./checkpoints/my_robot/best.ckpt
```

---

## Key Improvements over N1.5

| Feature | N1.5 | N1.6 |
|---|---|---|
| VLM backbone | Eagle 2.5 | Cosmos-Reason-2B |
| DiT layers | 16 | 32 |
| Image resolution | Fixed | Native aspect ratio, flexible |
| Embodiment data | Humanoid | Bimanual + semi-humanoid + humanoid |
| Language following | Good | Significantly improved |

---

## Integration with Mission Control

GR00T N1.6 is the **policy model target** for trained cinema robot arms.
Pipeline:
1. Generate URDF (mission-control urdf_build agent)
2. Convert to USD (usd_conversion agent)
3. Run in Isaac Sim 5.1 (scene_build agent)
4. Collect demonstrations via GR00T-Teleop
5. Augment with GR00T-Mimic or GR00T-Dreams
6. Fine-tune GR00T N1.6 on cinema robot embodiment
7. Deploy policy on robot hardware via policy server

**Citation:**
```
GR00T N1: An Open Foundation Model for Generalist Humanoid Robots
NVIDIA et al., arXiv:2503.14734, 2025
```
