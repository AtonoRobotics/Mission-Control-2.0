# GR00T Variant Modules — Teleop, Dexterity, Control, Perception

---

## GR00T-Teleop

**Purpose:** Collect high-quality human demonstration data via teleoperation
**Status:** Invite-only early access (join Humanoid Developer Program)
**Hardware:** Apple Vision Pro primary; PICO VR headset (AgiBot variant)

### What It Does

Streams Isaac Sim/Lab simulation to a VR headset. Human operator controls
simulated robot in real-time. All joint states and task outcomes recorded
as ground-truth demonstrations for GR00T-Mimic input.

### Architecture

```
Apple Vision Pro / PICO
       ↓ (control signals: hand pose, gaze, gestures)
NVIDIA CloudXR Runtime
       ↓ (streams rendered simulation frames)
Isaac XR Teleop Sample App
       ↓ (routes commands to Isaac Lab robot)
Isaac Lab simulation
       ↓ (records joint states at 30Hz)
Demonstration dataset (LeRobot format)
```

### Isaac XR Teleop

```bash
# CloudXR Runtime streams Isaac Lab to Vision Pro
# Install CloudXR SDK: https://developer.nvidia.com/cloudxr-sdk

# Start Isaac Lab with teleoperation enabled
python scripts/teleop/start_teleop_session.py \
    --robot_config configs/my_robot.yaml \
    --task pick_and_place \
    --record_output ./demos/session_001 \
    --cloudxr_server_ip 192.168.1.100

# Operator connects Vision Pro to CloudXR server
# Recordings saved automatically per episode
```

### Output

Each recording session produces:
```
demos/session_001/
├── episode_000/
│   ├── joint_states.npy      # (T, N_joints) float32
│   ├── ee_pose.npy           # (T, 7) [x,y,z,qx,qy,qz,qw]
│   ├── gripper_state.npy     # (T,) float32
│   ├── camera_rgb.mp4        # 30fps RGB
│   └── metadata.json         # task, success flag, duration
└── ...
```

---

## GR00T-Dexterity

**Purpose:** End-to-end pixel-to-action grasping for human-like dexterous manipulation
**Approach:** Reinforcement learning + reference workflows
**Focus:** Fine-grained object interaction, multi-finger control

### Capabilities

- **Gross manipulation:** Pick, place, push, pull large objects
- **Fine manipulation:** Precise finger placement, pinch grasps, pen/tool use
- **Bimanual:** Two-arm coordination, handoffs, assembly

### Training Approach

```python
# Reinforcement learning with shaped rewards
# Trained in Isaac Lab with physics-based finger simulation

from isaaclab.tasks.manipulation import DexterityTask

task = DexterityTask(
    robot_cfg=my_robot_cfg,
    object_cfg=target_object_cfg,
    reward_cfg=DexterityRewardCfg(
        contact_reward_weight=0.3,
        grasp_success_weight=1.0,
        finger_placement_weight=0.5,
    )
)
```

### Dexterity Models

Available from HuggingFace:
- `nvidia/GR00T-Dexterity-SingleArm-Grasp` — standard grasp policy
- `nvidia/GR00T-Dexterity-BiManual-Assembly` — two-arm assembly

---

## GR00T-Control

**Purpose:** Whole-body motion policies via imitation + reinforcement learning
**Focus:** Full humanoid locomotion + manipulation combined
**Approach:** Reference motion + IL from teleoperated datasets

### What It Provides

- Whole-body coordination: simultaneous arm + leg + torso control
- Loco-manipulation: walking while carrying, reaching while balancing
- Reactive balance: perturbation recovery during manipulation
- Natural motion: human-like movement quality

### Training Pipeline

```bash
# Step 1: Collect whole-body demos via GR00T-Teleop
# Step 2: Generate reference motions with physics retargeting
python scripts/control/retarget_motion.py \
    --human_motion ./mocap/human_walk.bvh \
    --robot_urdf ./robots/my_robot.urdf \
    --output ./reference_motions/walk.npy

# Step 3: Train whole-body policy
python scripts/control/train_wbc.py \
    --reference_motions ./reference_motions \
    --demo_dataset ./demos/whole_body \
    --output ./checkpoints/wbc_policy
```

### GR00T-Mobility (sub-module)

Reinforcement learning for locomotion:
- Terrain traversal (stairs, ramps, uneven ground)
- Velocity tracking
- Recovery from falls

```python
# Uses Isaac Lab RL framework
from isaaclab.tasks.locomotion import VelocityTrackingTask
# Trained with PPO or similar on-policy RL
```

---

## GR00T-Perception

**Purpose:** Situational awareness — long-term memory, VLM understanding, spatial reasoning
**Built on:** VLMs + retrieval-augmented memory + Isaac ROS
**Focus:** Environmental understanding and context-aware responses

### Components

**1. Vision-Language Understanding**
```python
# VLM for scene understanding
from groot.perception import VLMPerception

perception = VLMPerception(
    vlm_model="nvidia/Eagle-2.5",  # or Cosmos-Reason
    memory_backend="faiss",        # vector retrieval
)

# Scene query
result = perception.query(
    image=camera_frame,
    question="What objects are on the table?"
)
# Returns: structured scene description
```

**2. Retrieval-Augmented Memory**
```python
# Long-term episodic memory
from groot.perception import EpisodicMemory

memory = EpisodicMemory(
    embedding_model="nvidia/Cosmos-Embed",
    storage_path="./robot_memory",
)

# Store event
memory.store(
    observation=obs,
    event_description="Picked up blue cube from shelf C",
    timestamp=time.time(),
)

# Retrieve relevant past events
relevant = memory.retrieve(
    query="Where did I last see the blue cube?",
    top_k=5,
)
```

**3. Isaac ROS Integration**

```python
# Perception nodes run as Isaac ROS 4.0 components
# topic: /groot/perception/scene_description
# topic: /groot/perception/object_detections
# topic: /groot/perception/memory_query_response
```

---

## GR00T-Gen

**Purpose:** Visual augmentation — domain randomization + Cosmos upscaling
**Position in pipeline:** After GR00T-Mimic, before policy training

```bash
# Domain randomization
python scripts/gen/randomize_domain.py \
    --input_trajectories ./synthetic_data \
    --randomize lighting,textures,backgrounds,distractor_objects \
    --num_variations 5 \
    --output ./augmented_data/step1

# Cosmos upscaling (photorealism)
python scripts/gen/cosmos_upscale.py \
    --input_dir ./augmented_data/step1 \
    --cosmos_model Cosmos-Transfer \
    --output_dir ./augmented_data/final
```
