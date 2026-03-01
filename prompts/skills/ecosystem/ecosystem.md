# Physical AI Ecosystem — LeRobot, NeMo Curator, Datasets, Related Tools

---

## HuggingFace LeRobot

**GitHub:** https://github.com/huggingface/lerobot
**Purpose:** Standard dataset format + training tools for robot policies
**Integration:** Native format for GR00T fine-tuning, GR00T-Mimic output, Cosmos-Policy

### Why It Matters

LeRobot is the de facto standard for robot learning datasets.
NVIDIA Physical AI Dataset, GR00T-Mimic output, and DreamGen trajectories all
use LeRobot format. If your data isn't in LeRobot format, it can't directly
feed GR00T fine-tuning.

### Dataset Format

```
lerobot_dataset/
├── data/
│   └── chunk-000/             # chunks of ~1000 episodes
│       └── episode_000000.parquet
├── videos/
│   └── chunk-000/
│       └── observation.images.camera_0/
│           └── episode_000000.mp4
└── meta/
    ├── info.json              # dataset metadata (required)
    ├── tasks.jsonl            # language annotations per episode
    ├── episodes.jsonl         # episode metadata
    └── stats.json             # normalization statistics
```

**info.json schema:**
```json
{
  "fps": 30,
  "total_episodes": 1000,
  "total_frames": 300000,
  "features": {
    "action": {"dtype": "float32", "shape": [7]},
    "observation.state": {"dtype": "float32", "shape": [14]},
    "observation.images.camera_0": {"dtype": "video"}
  },
  "robot_type": "my_robot_6dof"
}
```

**Parquet columns:**
| Column | Type | Description |
|---|---|---|
| `action` | float32[N] | Joint positions/velocities/torques |
| `observation.state` | float32[M] | Proprioception (joint pos + vel + EE pose) |
| `observation.images.camera_0` | int64 | Video frame index |
| `timestamp` | float64 | Seconds from episode start |
| `episode_index` | int32 | Episode number |
| `task_index` | int32 | Task/language instruction ID |
| `done` | bool | Episode terminal flag |

### Installing LeRobot

```bash
pip install lerobot

# Or from source
git clone https://github.com/huggingface/lerobot.git
cd lerobot
pip install -e ".[dev]"
```

### Creating a LeRobot Dataset from Your Data

```python
from lerobot.common.datasets.lerobot_dataset import LeRobotDataset
from lerobot.common.datasets.utils import create_lerobot_dataset_card

# Create dataset from collected episodes
dataset = LeRobotDataset.create(
    repo_id="your_org/cinema_robot_demos",
    fps=30,
    features={
        "action": {"dtype": "float32", "shape": (7,)},
        "observation.state": {"dtype": "float32", "shape": (14,)},
        "observation.images.camera_0": {"dtype": "video", "shape": (480, 640, 3)},
    },
)

# Add episodes
for episode_data in my_collected_data:
    dataset.add_episode(
        episode_data["frames"],
        task="Move camera arm to position A",
    )

dataset.push_to_hub()  # optional: share on HuggingFace
```

### Training a Policy with LeRobot

```bash
# Train ACT policy on your dataset
python lerobot/scripts/train.py \
    --dataset_repo_id your_org/cinema_robot_demos \
    --policy_type act \
    --output_dir ./outputs/act_cinema_robot \
    --num_steps 100000 \
    --batch_size 8

# Train Diffusion Policy
python lerobot/scripts/train.py \
    --dataset_repo_id your_org/cinema_robot_demos \
    --policy_type diffusion \
    --output_dir ./outputs/diffusion_cinema_robot
```

---

## NVIDIA NeMo Curator

**GitHub:** https://github.com/NVIDIA-NeMo/NeMo (NeMo Curator module)
**Purpose:** Large-scale video and text dataset curation for world model training
**Scale:** 20M hours video processed in 2 weeks on Blackwell (vs 3.4 years CPU)

### What It Does

```
Raw video/data → NeMo Curator → High-quality training dataset

Processing steps:
1. Ingest from S3/local/HTTP
2. Quality filtering (blur, motion, relevance)
3. Video captioning (auto-generate action descriptions)
4. Semantic embedding + deduplication
5. Shard packaging for training
```

### Install

```bash
pip install nemo-curator[video]

# Or full NeMo framework
pip install nemo_toolkit[all]
```

### Video Curation Pipeline

```python
from nemo_curator import VideoDataset, VideoCurationPipeline

pipeline = VideoCurationPipeline(
    quality_filter_threshold=0.7,
    captioning_model="cosmos-reason2",
    embedding_model="cosmos-embed",
    dedup_threshold=0.95,
    num_gpus=8,
)

dataset = VideoDataset.from_directory("/path/to/raw_robot_videos")
curated = pipeline.process(dataset)
curated.save("/path/to/curated_output")
```

### CLI

```bash
nemo-curator-video \
    --input /path/to/raw_videos \
    --output /path/to/curated \
    --filter_quality \
    --generate_captions \
    --captioning_model cosmos-reason2 \
    --deduplicate \
    --num_nodes 4 \
    --gpus_per_node 8
```

---

## NVIDIA Physical AI Dataset

**HuggingFace:** https://huggingface.co/nvidia (search PhysicalAI-Robotics)
**Size:** 15TB, 320,000+ trajectories
**Format:** LeRobot format
**License:** Commercial-grade, pre-validated

### What's In It

| Dataset | Content | Size |
|---|---|---|
| PhysicalAI-Robotics-Manipulation-SingleArm | Franka Panda pick/place/stack | 6 tasks |
| PhysicalAI-Robotics-Manipulation-Objects | Bimanual manipulation | 3 tasks |
| PhysicalAI-Robotics-NuRec | Nova Carter 360° indoor mapping | Multi-camera |
| Humanoid motion trajectories | 24,000 GR-1 simulated teleoperation | Sim data |
| Unitree G1 real-world data | First real-world G1 trajectories | Real data |

### Downloading

```bash
# Specific robotics dataset
huggingface-cli download \
    nvidia/PhysicalAI-Robotics-Manipulation-SingleArm \
    --repo-type dataset \
    --local-dir ./datasets/manipulation

# Full physical AI collection (large!)
huggingface-cli download \
    nvidia/PhysicalAI-Dataset \
    --repo-type dataset \
    --local-dir ./datasets/physical_ai
```

### Using for Post-Training

```python
from lerobot.common.datasets.lerobot_dataset import LeRobotDataset

# Load NVIDIA dataset directly
dataset = LeRobotDataset(
    "nvidia/PhysicalAI-Robotics-Manipulation-SingleArm",
    split="train",
)

# Mix with your own data
from torch.utils.data import ConcatDataset
combined = ConcatDataset([dataset, your_local_dataset])
```

---

## Cosmos Dataset Search

**Purpose:** Semantic search over massive video datasets
**Powered by:** Cosmos-Embed NIM + Cosmos-Curate

```bash
# Search for specific robot behaviors in large dataset
cosmos-curate search \
    --dataset /path/to/physical_ai_dataset \
    --query "robot arm precision grasp of small cylindrical object" \
    --top_k 500 \
    --output matching_episodes.json

# Use matching clips for targeted fine-tuning
```

---

## Robomimic

**GitHub:** https://github.com/ARISE-Initiative/robomimic
**Purpose:** Imitation learning toolkit, used by GR00T-Mimic for policy training
**Policies:** BC, BC-RNN, IRIS, IQL, TD3-BC

```bash
pip install robomimic

# Train recurrent GMM policy (used in GR00T-Mimic pipeline)
python robomimic/scripts/train.py \
    --config robomimic/exps/templates/bc_rnn.json \
    --dataset path/to/groot_mimic_output.hdf5
```

**Converts from LeRobot to HDF5:**
```python
from robomimic.utils.dataset_utils import convert_lerobot_to_robomimic

convert_lerobot_to_robomimic(
    lerobot_dataset_path="./synthetic_data",
    output_path="./robomimic_dataset.hdf5",
)
```

---

## RoboGen / Genesis

**Genesis:** https://github.com/Genesis-Embodied-AI/Genesis
**Purpose:** Generative simulation for robotics — procedural scene/task generation

```bash
pip install genesis-world

import genesis as gs
gs.init(backend=gs.cuda)

scene = gs.Scene()
robot = scene.add_entity(gs.morphs.URDF(file="my_robot.urdf"))
scene.build()

# Procedural task generation
for _ in range(1000):
    scene.reset()
    # randomize object positions, lighting, textures
    task_data = scene.collect_trajectory(policy)
    save_lerobot_format(task_data)
```

---

## OpenPI / pi0

**GitHub:** https://github.com/Physical-Intelligence/openpi
**Purpose:** Open-source π0 (pi-zero) policy — flow matching for robot control
**Architecture:** Gemma-2 2B VLM + flow matching action head

```bash
pip install openpi-client

# Inference server
python -m openpi.serving.server --port 8000

# Client
from openpi.client import PolicyClient
client = PolicyClient("localhost:8000")
action = client.infer(images=obs_images, instruction="pick up cube")
```

**Useful for:** Alternative to GR00T when working with PaliGemma/Gemma2 backbone.

---

## ACT / Diffusion Policy (Reference Implementations)

**ACT:** https://github.com/tonyzhaozh/act
**Diffusion Policy:** https://diffusion-policy.cs.columbia.edu

Both are natively supported by LeRobot:
```bash
# ACT training via LeRobot
python lerobot/scripts/train.py --policy_type act

# Diffusion Policy training
python lerobot/scripts/train.py --policy_type diffusion
```

These are useful as lightweight baselines before scaling to GR00T.
