"""
Mission Control — Pipeline Templates
Pre-built Physical AI pipeline DAGs for common workflows.
Bipartite graph pattern: asset nodes (data) and operation nodes (transforms) alternate.
"""

# =============================================================================
# Template Metadata
# =============================================================================

TEMPLATE_META: dict[str, dict] = {
    "groot_manipulation": {
        "name": "GR00T Manipulation",
        "description": (
            "End-to-end manipulation pipeline: scene composition, demo recording, "
            "GR00T-Mimic augmentation, Cosmos domain transfer, fine-tuning, and arena eval."
        ),
        "tags": ["gr00t", "cosmos", "manipulation"],
    },
    "rl_locomotion": {
        "name": "RL Locomotion",
        "description": (
            "Reinforcement learning locomotion pipeline using Isaac Lab: "
            "scene composition, RL training, evaluation, and deployment."
        ),
        "tags": ["isaac-lab", "rl", "locomotion"],
    },
    "sim2real_transfer": {
        "name": "Sim2Real Transfer",
        "description": (
            "Sim-to-real domain transfer pipeline: collect simulation data, "
            "apply Cosmos transfer for photorealism, fine-tune base model."
        ),
        "tags": ["cosmos", "sim2real"],
    },
    "cinema_motion": {
        "name": "Cinema Motion",
        "description": (
            "Cinema motion validation pipeline for CR10: validate camera trajectory "
            "with cuRobo, deploy validated motion package to real robot."
        ),
        "tags": ["curobo", "cinema", "cr10"],
    },
}

# =============================================================================
# Template Definitions
# =============================================================================

TEMPLATES: dict[str, dict] = {
    # -----------------------------------------------------------------
    # GR00T Manipulation
    # -----------------------------------------------------------------
    "groot_manipulation": {
        "schema_version": "1.0.0",
        "template": "groot_manipulation",
        "osmo_compatible": True,
        "nodes": [
            # Row 0 — input assets
            {"id": "robot_usd",       "category": "asset",     "type": "robot_usd",        "label": "Robot USD",              "config": {}, "position": {"x": 0,    "y": 0}},
            {"id": "env_usd",         "category": "asset",     "type": "environment_usd",  "label": "Environment USD",        "config": {}, "position": {"x": 0,    "y": 150}},
            # Row 1 — compose
            {"id": "compose_scene",   "category": "operation", "type": "usd_compose",      "label": "Compose Scene",          "config": {}, "position": {"x": 250,  "y": 75}},
            # Row 2 — scene asset
            {"id": "scene_usd",       "category": "asset",     "type": "scene_usd",        "label": "Scene USD",              "config": {}, "position": {"x": 500,  "y": 75}},
            # Row 3 — record demos
            {"id": "record_demos",    "category": "operation", "type": "demo_record",      "label": "Record Demos",           "config": {"num_demos": 100}, "position": {"x": 750,  "y": 75}},
            # Row 4 — demo dataset
            {"id": "demo_dataset",    "category": "asset",     "type": "demo_dataset",     "label": "Demo Dataset",           "config": {}, "position": {"x": 1000, "y": 75}},
            # Row 5 — GR00T-Mimic augmentation
            {"id": "groot_mimic",     "category": "operation", "type": "groot_mimic",      "label": "GR00T-Mimic",            "config": {"augment_factor": 10}, "position": {"x": 1250, "y": 75}},
            # Row 6 — augmented data
            {"id": "augmented_data",  "category": "asset",     "type": "synth_dataset",    "label": "Augmented Data",         "config": {}, "position": {"x": 1500, "y": 75}},
            # Row 7 — Cosmos domain transfer
            {"id": "cosmos_transfer", "category": "operation", "type": "cosmos_transfer",  "label": "Cosmos Transfer",        "config": {"model": "Cosmos-1.0-Transfer"}, "position": {"x": 1750, "y": 75}},
            # Row 8 — photorealistic data
            {"id": "photo_data",      "category": "asset",     "type": "synth_dataset",    "label": "Photorealistic Data",    "config": {}, "position": {"x": 2000, "y": 0}},
            # Branch — base model input
            {"id": "groot_base",      "category": "asset",     "type": "pretrained_model", "label": "GR00T N1.6 Base",        "config": {"model": "gr00t-n1.6-base"}, "position": {"x": 2000, "y": 150}},
            # Row 9 — fine-tune
            {"id": "finetune",        "category": "operation", "type": "groot_finetune",   "label": "Fine-tune",              "config": {"epochs": 50, "lr": 1e-4}, "position": {"x": 2250, "y": 75}},
            # Row 10 — checkpoint
            {"id": "checkpoint",      "category": "asset",     "type": "checkpoint",       "label": "Checkpoint",             "config": {}, "position": {"x": 2500, "y": 75}},
            # Row 11a — arena eval branch
            {"id": "arena_eval",      "category": "operation", "type": "arena_eval",       "label": "Arena Eval",             "config": {}, "position": {"x": 2750, "y": 0}},
            {"id": "eval_report",     "category": "asset",     "type": "eval_report",      "label": "Report",                 "config": {}, "position": {"x": 3000, "y": 0}},
            # Row 11b — deploy branch
            {"id": "deploy",          "category": "operation", "type": "deploy",           "label": "Deploy",                 "config": {}, "position": {"x": 2750, "y": 150}},
            {"id": "deployment",      "category": "asset",     "type": "deployment_pkg",   "label": "Deployment",             "config": {}, "position": {"x": 3000, "y": 150}},
        ],
        "edges": [
            {"id": "e1",  "source": "robot_usd",       "target": "compose_scene",   "data_type": "usd"},
            {"id": "e2",  "source": "env_usd",         "target": "compose_scene",   "data_type": "usd"},
            {"id": "e3",  "source": "compose_scene",   "target": "scene_usd",       "data_type": "usd"},
            {"id": "e4",  "source": "scene_usd",       "target": "record_demos",    "data_type": "usd"},
            {"id": "e5",  "source": "record_demos",    "target": "demo_dataset",    "data_type": "dataset"},
            {"id": "e6",  "source": "demo_dataset",    "target": "groot_mimic",     "data_type": "dataset"},
            {"id": "e7",  "source": "groot_mimic",     "target": "augmented_data",  "data_type": "dataset"},
            {"id": "e8",  "source": "augmented_data",  "target": "cosmos_transfer", "data_type": "dataset"},
            {"id": "e9",  "source": "cosmos_transfer", "target": "photo_data",      "data_type": "dataset"},
            {"id": "e10", "source": "photo_data",      "target": "finetune",        "data_type": "dataset"},
            {"id": "e11", "source": "groot_base",      "target": "finetune",        "data_type": "model"},
            {"id": "e12", "source": "finetune",        "target": "checkpoint",      "data_type": "checkpoint"},
            {"id": "e13", "source": "checkpoint",      "target": "arena_eval",      "data_type": "checkpoint"},
            {"id": "e14", "source": "arena_eval",      "target": "eval_report",     "data_type": "report"},
            {"id": "e15", "source": "checkpoint",      "target": "deploy",          "data_type": "checkpoint"},
            {"id": "e16", "source": "deploy",          "target": "deployment",      "data_type": "package"},
        ],
    },

    # -----------------------------------------------------------------
    # RL Locomotion
    # -----------------------------------------------------------------
    "rl_locomotion": {
        "schema_version": "1.0.0",
        "template": "rl_locomotion",
        "osmo_compatible": True,
        "nodes": [
            {"id": "robot_usd",     "category": "asset",     "type": "robot_usd",       "label": "Robot USD",       "config": {}, "position": {"x": 0,    "y": 0}},
            {"id": "terrain_usd",   "category": "asset",     "type": "environment_usd", "label": "Terrain USD",     "config": {}, "position": {"x": 0,    "y": 150}},
            {"id": "compose",       "category": "operation", "type": "usd_compose",     "label": "Compose Scene",   "config": {}, "position": {"x": 250,  "y": 75}},
            {"id": "scene_usd",     "category": "asset",     "type": "scene_usd",       "label": "Scene USD",       "config": {}, "position": {"x": 500,  "y": 75}},
            {"id": "isaac_lab_rl",  "category": "operation", "type": "isaac_lab_rl",    "label": "Isaac Lab RL",    "config": {"algo": "PPO", "max_iterations": 1000}, "position": {"x": 750,  "y": 75}},
            {"id": "checkpoint",    "category": "asset",     "type": "checkpoint",      "label": "Checkpoint",      "config": {}, "position": {"x": 1000, "y": 75}},
            {"id": "eval",          "category": "operation", "type": "arena_eval",      "label": "Eval",            "config": {}, "position": {"x": 1250, "y": 0}},
            {"id": "report",        "category": "asset",     "type": "eval_report",     "label": "Report",          "config": {}, "position": {"x": 1500, "y": 0}},
            {"id": "deploy",        "category": "operation", "type": "deploy",          "label": "Deploy",          "config": {}, "position": {"x": 1250, "y": 150}},
            {"id": "deployment",    "category": "asset",     "type": "deployment_pkg",  "label": "Deployment",      "config": {}, "position": {"x": 1500, "y": 150}},
        ],
        "edges": [
            {"id": "e1", "source": "robot_usd",    "target": "compose",      "data_type": "usd"},
            {"id": "e2", "source": "terrain_usd",  "target": "compose",      "data_type": "usd"},
            {"id": "e3", "source": "compose",      "target": "scene_usd",    "data_type": "usd"},
            {"id": "e4", "source": "scene_usd",    "target": "isaac_lab_rl", "data_type": "usd"},
            {"id": "e5", "source": "isaac_lab_rl", "target": "checkpoint",   "data_type": "checkpoint"},
            {"id": "e6", "source": "checkpoint",   "target": "eval",         "data_type": "checkpoint"},
            {"id": "e7", "source": "eval",         "target": "report",       "data_type": "report"},
            {"id": "e8", "source": "checkpoint",   "target": "deploy",       "data_type": "checkpoint"},
            {"id": "e9", "source": "deploy",       "target": "deployment",   "data_type": "package"},
        ],
    },

    # -----------------------------------------------------------------
    # Sim2Real Transfer
    # -----------------------------------------------------------------
    "sim2real_transfer": {
        "schema_version": "1.0.0",
        "template": "sim2real_transfer",
        "osmo_compatible": True,
        "nodes": [
            {"id": "robot_usd",       "category": "asset",     "type": "robot_usd",        "label": "Robot USD",           "config": {}, "position": {"x": 0,    "y": 0}},
            {"id": "env_usd",         "category": "asset",     "type": "environment_usd",  "label": "Environment USD",     "config": {}, "position": {"x": 0,    "y": 150}},
            {"id": "compose",         "category": "operation", "type": "usd_compose",      "label": "Compose Scene",       "config": {}, "position": {"x": 250,  "y": 75}},
            {"id": "scene_usd",       "category": "asset",     "type": "scene_usd",        "label": "Scene USD",           "config": {}, "position": {"x": 500,  "y": 75}},
            {"id": "collect_sim",     "category": "operation", "type": "demo_record",      "label": "Collect Sim Data",    "config": {"num_episodes": 500}, "position": {"x": 750,  "y": 75}},
            {"id": "sim_dataset",     "category": "asset",     "type": "synth_dataset",    "label": "Sim Dataset",         "config": {}, "position": {"x": 1000, "y": 75}},
            {"id": "cosmos_transfer", "category": "operation", "type": "cosmos_transfer",  "label": "Cosmos Transfer",     "config": {"model": "Cosmos-1.0-Transfer"}, "position": {"x": 1250, "y": 75}},
            {"id": "real_data",       "category": "asset",     "type": "synth_dataset",    "label": "Real-Style Data",     "config": {}, "position": {"x": 1500, "y": 0}},
            {"id": "base_model",      "category": "asset",     "type": "pretrained_model", "label": "Base Model",          "config": {}, "position": {"x": 1500, "y": 150}},
            {"id": "finetune",        "category": "operation", "type": "groot_finetune",   "label": "Fine-tune",           "config": {"epochs": 30}, "position": {"x": 1750, "y": 75}},
            {"id": "checkpoint",      "category": "asset",     "type": "checkpoint",       "label": "Checkpoint",          "config": {}, "position": {"x": 2000, "y": 75}},
            {"id": "eval",            "category": "operation", "type": "arena_eval",       "label": "Eval",                "config": {}, "position": {"x": 2250, "y": 75}},
            {"id": "report",          "category": "asset",     "type": "eval_report",      "label": "Report",              "config": {}, "position": {"x": 2500, "y": 75}},
        ],
        "edges": [
            {"id": "e1",  "source": "robot_usd",       "target": "compose",         "data_type": "usd"},
            {"id": "e2",  "source": "env_usd",         "target": "compose",         "data_type": "usd"},
            {"id": "e3",  "source": "compose",         "target": "scene_usd",       "data_type": "usd"},
            {"id": "e4",  "source": "scene_usd",       "target": "collect_sim",     "data_type": "usd"},
            {"id": "e5",  "source": "collect_sim",     "target": "sim_dataset",     "data_type": "dataset"},
            {"id": "e6",  "source": "sim_dataset",     "target": "cosmos_transfer", "data_type": "dataset"},
            {"id": "e7",  "source": "cosmos_transfer", "target": "real_data",       "data_type": "dataset"},
            {"id": "e8",  "source": "real_data",       "target": "finetune",        "data_type": "dataset"},
            {"id": "e9",  "source": "base_model",      "target": "finetune",        "data_type": "model"},
            {"id": "e10", "source": "finetune",        "target": "checkpoint",      "data_type": "checkpoint"},
            {"id": "e11", "source": "checkpoint",      "target": "eval",            "data_type": "checkpoint"},
            {"id": "e12", "source": "eval",            "target": "report",          "data_type": "report"},
        ],
    },

    # -----------------------------------------------------------------
    # Cinema Motion
    # -----------------------------------------------------------------
    "cinema_motion": {
        "schema_version": "1.0.0",
        "template": "cinema_motion",
        "osmo_compatible": False,
        "nodes": [
            {"id": "cr10_urdf",       "category": "asset",     "type": "robot_urdf",      "label": "CR10 URDF",            "config": {"robot_id": "dobot_cr10"}, "position": {"x": 0,   "y": 0}},
            {"id": "curobo_config",   "category": "asset",     "type": "curobo_config",   "label": "cuRobo Config",        "config": {}, "position": {"x": 0,   "y": 150}},
            {"id": "camera_traj",     "category": "asset",     "type": "sensor_config",   "label": "Camera Trajectory",    "config": {}, "position": {"x": 0,   "y": 300}},
            {"id": "curobo_validate", "category": "operation", "type": "curobo_validate", "label": "cuRobo Validate",      "config": {"check_joint_limits": True, "check_singularity": True}, "position": {"x": 250, "y": 150}},
            {"id": "validation_rpt",  "category": "asset",     "type": "eval_report",     "label": "Validation Report",    "config": {}, "position": {"x": 500, "y": 150}},
            {"id": "deploy_cr10",     "category": "operation", "type": "deploy",          "label": "Deploy to CR10",       "config": {"target_ip": "192.168.5.1"}, "position": {"x": 750, "y": 150}},
            {"id": "motion_pkg",      "category": "asset",     "type": "deployment_pkg",  "label": "Motion Package",       "config": {}, "position": {"x": 1000, "y": 150}},
        ],
        "edges": [
            {"id": "e1", "source": "cr10_urdf",       "target": "curobo_validate", "data_type": "urdf"},
            {"id": "e2", "source": "curobo_config",   "target": "curobo_validate", "data_type": "config"},
            {"id": "e3", "source": "camera_traj",     "target": "curobo_validate", "data_type": "trajectory"},
            {"id": "e4", "source": "curobo_validate", "target": "validation_rpt",  "data_type": "report"},
            {"id": "e5", "source": "validation_rpt",  "target": "deploy_cr10",     "data_type": "report"},
            {"id": "e6", "source": "deploy_cr10",     "target": "motion_pkg",      "data_type": "package"},
        ],
    },
}


# =============================================================================
# Helper Functions
# =============================================================================


def get_template(template_id: str) -> dict | None:
    """Return a full template definition by ID, or None if not found."""
    return TEMPLATES.get(template_id)


def list_templates() -> list[dict]:
    """Return summary metadata for all available templates."""
    result = []
    for tid, meta in TEMPLATE_META.items():
        tpl = TEMPLATES.get(tid)
        result.append({
            "id": tid,
            "name": meta["name"],
            "description": meta["description"],
            "tags": meta["tags"],
            "node_count": len(tpl["nodes"]) if tpl else 0,
            "edge_count": len(tpl["edges"]) if tpl else 0,
        })
    return result
