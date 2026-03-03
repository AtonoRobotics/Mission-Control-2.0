"""Unit tests for USD generation from component tree."""
import pytest


def test_generate_usd_minimal():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "#usda 1.0" in usda
    assert 'defaultPrim = "Test_Arm"' in usda
    assert 'upAxis = "Z"' in usda
    assert "base_link" in usda
    assert "link_1" in usda


def test_generate_usd_with_payload():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [{"link_name": "base_link", "mass": 12.5}],
        "payload_components": [
            {
                "joint_name": "camera_body_joint",
                "joint_type": "fixed",
                "parent_link": "base_link",
                "child_link": "camera_body_link",
                "origin_xyz": [0, 0, 0.05],
                "link": {"link_name": "camera_body_link", "mass": 2.6},
            },
        ],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "camera_body_link" in usda
    assert "2.6" in usda


def test_generate_usd_null_mass_omitted():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [{"link_name": "base_link", "mass": None}],
        "payload_components": [],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "physics:mass" not in usda
