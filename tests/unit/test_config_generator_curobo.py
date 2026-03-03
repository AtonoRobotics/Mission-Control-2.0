"""Unit tests for cuRobo YAML generation from component tree."""
import pytest
import yaml


def test_generate_curobo_minimal():
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 2,
        "joints": [
            {
                "joint_name": "joint_1",
                "velocity_limit": 2.618,
                "acceleration_limit": 5.0,
                "jerk_limit": 20.0,
            },
            {
                "joint_name": "joint_2",
                "velocity_limit": 2.618,
                "acceleration_limit": 5.0,
                "jerk_limit": 20.0,
            },
        ],
        "ee_link": "camera_body_link",
        "payload_components": [
            {
                "joint_name": "camera_body_joint",
                "link": {"link_name": "camera_body_link"},
            },
        ],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    parsed = yaml.safe_load(yaml_str)

    assert "robot_cfg" in parsed
    kin = parsed["robot_cfg"]["kinematics"]
    assert kin["ee_link"] == "camera_body_link"
    assert len(kin["cspace"]["joint_names"]) == 2
    assert len(kin["cspace"]["max_velocity"]) == 2


def test_generate_curobo_no_collision_spheres():
    """cuRobo config must NOT include collision_spheres or world_model."""
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "joints": [{"joint_name": "j1", "velocity_limit": 2.0, "acceleration_limit": 5.0, "jerk_limit": 20.0}],
        "ee_link": "link_1",
        "payload_components": [],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    assert "collision_spheres" not in yaml_str
    assert "world_model" not in yaml_str
    assert "obstacle" not in yaml_str


def test_generate_curobo_null_limit_omitted():
    """Joints with NULL velocity limit should be omitted from limits."""
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 2,
        "joints": [
            {"joint_name": "j1", "velocity_limit": 2.618, "acceleration_limit": 5.0, "jerk_limit": 20.0},
            {"joint_name": "j2", "velocity_limit": None, "acceleration_limit": None, "jerk_limit": None},
        ],
        "ee_link": "link_2",
        "payload_components": [],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    parsed = yaml.safe_load(yaml_str)
    # j2 should still be listed but with null_fields noted
    assert "null_fields" in parsed["robot_cfg"]
    assert any("j2" in f.get("joint_name", "") for f in parsed["robot_cfg"]["null_fields"])
