# Mission Control — Physical AI Knowledge Base

Agent-consumable reference for the NVIDIA physical AI stack.
Injected into AutoGen task manifests at dispatch time to ground Qwen models in correct APIs.

**Purpose:** Prevent API version hallucination. Qwen 72B and Qwen Coder 32B training
cutoffs predate Isaac Sim 5.1, Isaac Lab 2.3, GR00T N1.6, and Cosmos 2.5.
Without this knowledge base, generated scripts use deprecated imports and wrong schemas.

---

## File Index

### GR00T Foundation Models
| File | Contents |
|---|---|
| `groot/groot_n1_6.md` | GR00T N1.6 — latest VLA model, architecture, install, fine-tuning |
| `groot/groot_mimic.md` | GR00T-Mimic — synthetic trajectory generation from demonstrations |
| `groot/groot_dreams.md` | GR00T-Dreams — new task generation via Cosmos world models |
| `groot/groot_teleop.md` | GR00T-Teleop — data collection via VR/AR teleoperation |
| `groot/groot_dexterity.md` | GR00T-Dexterity — dexterous manipulation suite |
| `groot/groot_control.md` | GR00T-Control — whole-body motion policies |
| `groot/groot_perception.md` | GR00T-Perception — VLM + retrieval memory |

### Cosmos World Foundation Models
| File | Contents |
|---|---|
| `cosmos/cosmos_predict2_5.md` | Cosmos-Predict2.5 — unified Text2World/Image2World/Video2World |
| `cosmos/cosmos_transfer2_5.md` | Cosmos-Transfer2.5 — Sim2Real, data augmentation |
| `cosmos/cosmos_reason2.md` | Cosmos-Reason2 — chain-of-thought physical reasoning VLM |
| `cosmos/cosmos_policy.md` | Cosmos as policy backbone — VLA post-training |
| `cosmos/cosmos_curate.md` | Cosmos-Curate — video curation and processing pipeline |

### Isaac Stack
| File | Contents |
|---|---|
| `isaac_sim_5_1/urdf_import.md` | Isaac Sim 5.1 URDF import — correct APIs, extension names |
| `isaac_sim_5_1/usd_schema.md` | USD prim structure, PhysX articulation, joint drives |
| `isaac_lab_2_3/env_registration.md` | Isaac Lab 2.3 env config, task registration |
| `isaac_lab_2_3/policy_training.md` | RL/IL training workflows, checkpoint paths |
| `isaac_ros_4_0/launch_patterns.md` | Isaac ROS 4.0 launch files, node graph |
| `curob/jerk_config.md` | cuRobo YAML schema — jerk minimization only |
| `nvblox_zed_x/integration.md` | nvblox + ZED X sensor fusion, topic names |

### Ecosystem
| File | Contents |
|---|---|
| `ecosystem/lerobot.md` | HuggingFace LeRobot — dataset format, training integration |
| `ecosystem/nemo_curator.md` | NeMo Curator — video curation pipeline |
| `ecosystem/physical_ai_dataset.md` | NVIDIA Physical AI Dataset — what's in it, how to use |

---

## How Agents Use This

Claude Code injects the relevant section into each task manifest before dispatch:

```python
# In dispatch/dispatch.py — pre-dispatch context injection
task["knowledge_context"] = load_knowledge_for_task(task["artifact_type"])

# load_knowledge_for_task() maps:
# urdf        → isaac_sim_5_1/urdf_import.md + isaac_sim_5_1/usd_schema.md
# yaml_curob  → curob/jerk_config.md
# launch      → isaac_ros_4_0/launch_patterns.md
# scene       → isaac_sim_5_1/usd_schema.md + nvblox_zed_x/integration.md
```

Qwen Coder 32B then receives this as part of its system context,
grounding it in the correct Isaac Sim 5.1 / Isaac Lab 2.3 APIs.
