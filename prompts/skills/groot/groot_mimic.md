# GR00T-Mimic — Synthetic Motion Trajectory Generation

**Type:** Blueprint / Reference Workflow
**GitHub:** https://github.com/NVIDIA-Omniverse-blueprints/synthetic-manipulation-motion-generation
**Built on:** NVIDIA Omniverse + NVIDIA Cosmos
**Purpose:** Generate exponentially large synthetic trajectory datasets from a few demonstrations

---

## What It Does

GR00T-Mimic takes a small number of human teleoperation demonstrations and generates
thousands of physically valid synthetic motion trajectories. It specializes an existing
robot in known tasks (depth over breadth — contrast with GR00T-Dreams which creates new tasks).

**Key result:** NVIDIA generated 780K synthetic trajectories (equivalent to 6.5K hours /
9 months of human data) in just 11 hours. Combined with real data, improved GR00T N1
performance by 40% over real-data-only training.

---

## Pipeline

```
Step 1: GR00T-Teleop
  Human operator → Apple Vision Pro / space mouse
  → CloudXR streams Isaac Lab simulation
  → Records robot joint states + task outcomes
  → Output: N demonstrations (typically 20–100)

Step 2: GR00T-Mimic (trajectory generation)
  Input: N demonstrations
  → Annotate key waypoints
  → Interpolate between waypoints using Isaac Lab physics
  → Apply motion variation (object position, grasp angle, speed)
  → Validate trajectory physically (collision, reachability)
  → Output: N × 100–1000 synthetic trajectories

Step 3: GR00T-Gen (optional augmentation)
  Input: Validated trajectories
  → Domain randomization (lighting, textures, background)
  → 3D upscaling via Cosmos Transfer
  → Output: Photorealistic augmented dataset

Step 4: Train policy in Isaac Lab
  Input: Augmented synthetic dataset
  → Imitation learning (e.g., recurrent GMM from Robomimic)
  → Output: Deployable robot policy
```

---

## Hardware Requirements

```
GR00T-Mimic (trajectory generation):
  - Isaac Lab simulation: Any NVIDIA GPU, 8GB+ VRAM
  - Recommended: A100 or H100

GR00T-Gen + Cosmos Transfer (augmentation):
  - MUST run on separate node from Isaac Lab
  - Minimum: H100 80GB (Cosmos Transfer requirement)
  - AWS P5 (H100), GCP A3, Azure ND H100 v5
```

---

## Install

```bash
git clone https://github.com/NVIDIA-Omniverse-blueprints/synthetic-manipulation-motion-generation.git
cd synthetic-manipulation-motion-generation

# Follow Cosmos HuggingFace model requirements first
# https://huggingface.co/nvidia/Cosmos-1.0-Transfer

pip install -r requirements.txt
```

---

## Running GR00T-Mimic

```bash
# Step 1: Process teleoperation demonstrations
python scripts/process_demos.py \
    --input_dir ./demos/raw \
    --output_dir ./demos/processed \
    --robot_config configs/my_robot.yaml

# Step 2: Generate synthetic trajectories
python scripts/generate_trajectories.py \
    --demo_dir ./demos/processed \
    --output_dir ./synthetic_data \
    --num_trajectories 1000 \
    --task "pick_and_place" \
    --variation_seed 42

# Step 3: Validate trajectories in Isaac Lab
python scripts/validate_trajectories.py \
    --trajectory_dir ./synthetic_data \
    --isaac_lab_cfg configs/isaac_lab.yaml \
    --output_dir ./validated_data

# Step 4: Augment with Cosmos Transfer (requires separate H100 node)
python scripts/augment_with_cosmos.py \
    --input_dir ./validated_data \
    --cosmos_model nvidia/Cosmos-1.0-Transfer-7B \
    --output_dir ./augmented_data \
    --num_augmentations 5  # per trajectory
```

---

## Output Format

Trajectories are saved in LeRobot format for direct use with GR00T fine-tuning:

```
synthetic_data/
├── data/
│   └── chunk-000/
│       └── episode_000000.parquet   # columns: action, state, timestamp
├── videos/
│   └── chunk-000/
│       └── observation.images.camera_0/
│           └── episode_000000.mp4
└── meta/
    ├── info.json
    └── stats.json
```

**Parquet schema:**
```
action:                float32[action_dim]   # joint positions/velocities
observation.state:     float32[state_dim]    # proprioception
observation.images.*:  video frame index
timestamp:             float64 (seconds)
task_index:            int32
```

---

## Trajectory Generation Config

```yaml
# configs/trajectory_gen.yaml
task:
  name: "pick_and_place"
  object_classes: ["cube", "cylinder"]
  table_height: 0.75

variation:
  object_position_range: 0.2      # meters, uniform random
  object_rotation_range: 180      # degrees, uniform random
  grasp_approach_angle: 30        # degrees variation

generation:
  num_trajectories: 1000
  physics_timestep: 0.01          # Isaac Lab physics step
  max_attempts_per_trajectory: 50 # reject and retry if physics invalid
  success_threshold: 0.95         # fraction that must succeed

output:
  format: "lerobot"
  fps: 30
  image_resolution: [224, 224]
```

---

## Integration: GR00T-Mimic vs GR00T-Dreams

| Dimension | GR00T-Mimic | GR00T-Dreams |
|---|---|---|
| Input | Teleoperation demonstrations | Single image + language |
| Output | Synthetic variants of known tasks | New tasks in new environments |
| Physics | Isaac Lab (classical) | Cosmos (neural world model) |
| Use case | Specialist: depth on known skills | Generalist: breadth, new verbs |
| Hardware | Standard GPU | H100 80GB required |
| Data flywheel | Augments existing real data | Generates net-new training data |

**For cinema robot arms:** Use GR00T-Mimic first to scale existing motion capture
demonstrations, then GR00T-Dreams to generalize to new camera moves and environments.
