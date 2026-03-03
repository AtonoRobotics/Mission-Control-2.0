"""Unit tests for config generator — URDF output from component tree."""
import pytest


def test_generate_urdf_minimal():
    """Bare robot arm with no payload generates valid URDF."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 6,
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
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5, "inertia_ixx": 0.05, "inertia_iyy": 0.05, "inertia_izz": 0.03},
            {"link_name": "link_1", "mass": 3.7, "inertia_ixx": 0.01, "inertia_iyy": 0.01, "inertia_izz": 0.005},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert '<?xml version="1.0"' in urdf_xml
    assert '<robot name="Test Arm">' in urdf_xml
    assert 'joint_1' in urdf_xml
    assert 'base_link' in urdf_xml
    assert '<mass value="12.5"/>' in urdf_xml
    assert '</robot>' in urdf_xml


def test_generate_urdf_with_payload():
    """Robot with camera payload adds fixed joints and links."""
    from backend.services.config_generator import generate_urdf_from_config

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
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [
            {
                "joint_name": "camera_plate_joint",
                "joint_type": "fixed",
                "parent_link": "link_1",
                "child_link": "camera_plate_link",
                "origin_xyz": [0, 0, 0.05],
                "origin_rpy": [0, 0, 0],
                "link": {
                    "link_name": "camera_plate_link",
                    "mass": 0.45,
                },
            },
            {
                "joint_name": "camera_body_joint",
                "joint_type": "fixed",
                "parent_link": "camera_plate_link",
                "child_link": "camera_body_link",
                "origin_xyz": [0, 0, 0.03],
                "origin_rpy": [0, 0, 0],
                "link": {
                    "link_name": "camera_body_link",
                    "mass": 2.6,
                },
            },
        ],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "camera_plate_joint" in urdf_xml
    assert "camera_body_joint" in urdf_xml
    assert "camera_plate_link" in urdf_xml
    assert '<mass value="2.6"/>' in urdf_xml


def test_generate_urdf_null_inertia_omitted():
    """Links with NULL inertia should omit inertial block, not use placeholders."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [
            {"link_name": "base_link", "mass": None, "inertia_ixx": None},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "<inertial>" not in urdf_xml
    assert "0.001" not in urdf_xml  # No placeholder inertia


def test_generate_urdf_track_base():
    """Track base adds prismatic joint."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "track",
        "base_config": {"track_length_mm": 3000},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "base_track_joint" in urdf_xml
    assert 'type="prismatic"' in urdf_xml
