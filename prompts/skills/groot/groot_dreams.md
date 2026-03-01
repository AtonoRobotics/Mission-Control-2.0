# GR00T-Dreams — Neural Trajectory Generation via World Foundation Models

**Type:** Blueprint / Reference Workflow
**GitHub:** https://github.com/nvidia/GR00T-dreams
**Paper:** DreamGen: Unlocking Generalization in Robot Learning through Video World Models
         arXiv:2505.12705
**Built on:** Cosmos-Predict2 (world foundation model)
**Purpose:** Generate synthetic data for NEW tasks and environments — not just variants

---

## What It Does

GR00T-Dreams uses Cosmos world foundation models to generate "neural trajectories":
video sequences of a robot performing tasks it has never seen in training data.
Unlike GR00T-Mimic (which scales known tasks), Dreams creates entirely new behaviors.

**Key result:** NVIDIA Research developed GR00T N1.5 using Dreams in 36 hours —
a process that would have taken nearly 3 months of manual data collection.

GR00T N1.5 achieved 38.3% success rate on 12 new DreamGen tasks (new verbs) vs
13.1% for N1 (which only repeated pre-training tasks).

---

## Architecture

```
Input: Single image of environment + language instruction ("open a laptop")
         ↓
  Cosmos-Predict2 (fine-tuned on robot data)
  - Generates video of robot executing the task
  - Produces "dream" = plausible future rollout
  - Multiple diverse outputs from same input
         ↓
  Inverse Dynamics Model (IDM)
  - Extracts action tokens from generated video
  - Maps pixel-space motions → robot joint commands
  - Produces compact behavioral token sequence
         ↓
  Neural Trajectories
  - Used as large-scale synthetic training dataset
  - Compatible with GR00T N1.x fine-tuning pipeline
  - Can co-train with real data OR train independently
         ↓
Output: Robot policy that generalizes to new tasks/environments
```

---

## Install

```bash
git clone https://github.com/nvidia/GR00T-dreams.git
cd GR00T-dreams

# Set up Cosmos-Predict2 environment first
# (separate env from fine-tuning to avoid conflicts)
./setup/setup_cosmos_predict2.sh

# Set up IDM environment
./setup/setup_idm.sh

# Verify all dependencies
python scripts/verify_setup.py
```

---

## Running GR00T-Dreams

### Step 1: Post-train Cosmos-Predict2 on your robot data

```bash
# Fine-tune world model on your robot's visual domain
python cosmos_predict2/train.py \
    --config cosmos_predict2/configs/robot_finetune.yaml \
    --data_path /path/to/robot_videos \
    --output_dir ./cosmos_checkpoints/my_robot \
    --num_gpus 8  # H100 required
```

See: `cosmos-predict2/documentations/training_gr00t.md`

### Step 2: Generate neural trajectories (DreamGen inference)

```bash
python scripts/generate_dreams.py \
    --cosmos_checkpoint ./cosmos_checkpoints/my_robot \
    --input_image ./scenes/table_setup.jpg \
    --task_instructions tasks/new_verbs.txt \
    --output_dir ./dreams/raw \
    --num_videos_per_task 100 \
    --video_length 5.0  # seconds
```

See: `cosmos-predict2/documentations/training_gr00t.md#inference-for-dreamgen-benchmark`

### Step 3: Extract action tokens with IDM

```bash
# IDM processes generated videos → action sequences
python IDM_dump/scripts/extract_actions.py \
    --video_dir ./dreams/raw \
    --embodiment_name my_robot \
    --output_dir ./dreams/actions \
    --global_metadata_dir IDM_dump/global_metadata

# Required files per embodiment:
# IDM_dump/global_metadata/{embodiment}/modality.json
# IDM_dump/global_metadata/{embodiment}/stats.json
```

### Step 4: Fine-tune IDM for your embodiment

```bash
# For new embodiments, add to data config first
# edit: groot/experiment/data_config_idm.py

# Fine-tune IDM
cd IDM_dump
./scripts/finetune/{your_embodiment}_finetune.sh

# Recommended config:
# batch_size: maximum GPU allows
# steps: 20,000
```

---

## Supported Embodiments (built-in)

- Fourier GR-1
- Unitree G1
- 1X NEO (bimanual)
- AgiBot AX-12

**Adding custom embodiment:**
```python
# groot/experiment/data_config_idm.py
EMBODIMENT_IDM_CONFIGS["my_robot"] = IDMConfig(
    action_dim=7,
    state_dim=14,
    camera_resolution=(224, 224),
    modality_path="IDM_dump/global_metadata/my_robot/modality.json",
    stats_path="IDM_dump/global_metadata/my_robot/stats.json",
)
```

---

## Evaluation

```bash
# Instruction Following (IF) metric
python eval/evaluate_if.py \
    --policy_checkpoint ./checkpoints/my_robot \
    --task_suite dreamgen_benchmark

# Physics Alignment (PA) metric
python eval/evaluate_pa.py \
    --policy_checkpoint ./checkpoints/my_robot \
    --task_suite dreamgen_benchmark
```

---

## DreamGen Benchmark Tasks (12 new verbs)

Tasks that GR00T N1.5 learned from Dreams data (never in teleoperation training):
- Opening laptop
- Turning on lamp
- Pouring liquid
- Wiping surface
- Pressing button
- Lifting lid
- Folding cloth
- Plugging in cable
- Adjusting dial
- Sliding drawer
- Hanging object
- Sorting by color

---

## Dreams vs Mimic: When to Use Which

**Use GR00T-Dreams when:**
- Robot needs to learn entirely new task categories
- No teleoperation data exists for the target task
- Generalizing to new environments (different lab, different lighting)
- Building a generalist policy

**Use GR00T-Mimic when:**
- Robot already performs a task, needs more data for robustness
- Scaling known demonstrations to object/position variations
- Building a specialist policy for specific task

**For cinema robots:** Dreams is valuable for generating motion paths for camera
angles and movements that were never explicitly programmed — generalization from
known pan/tilt moves to novel crane sweeps and dolly moves.
