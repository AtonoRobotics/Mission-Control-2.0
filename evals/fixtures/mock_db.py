"""
evals/fixtures/mock_db.py

Fixture database for eval cases that require DB cross-checking.
Provides a deterministic, in-memory DB matching the empirical DB schema.

Used by:
  - B-* eval cases (hallucination detection — value not in DB)
  - C-* eval cases (silent NULL fill — DB has NULL but output has value)

Usage:
    from evals.fixtures.mock_db import MOCK_DB, get_field, is_null

    value = get_field(robot_id=7, table="joints", element="j1_shoulder", column="effort_limit")
    # Returns 47.3 (the real DB value, not the hallucinated 50.0)

Schema mirrors empirical DB v3.1.0 exactly.
NULL entries represent verified-absent data — not missing entries.
"""

from __future__ import annotations
from typing import Any


# ── Robot 7 — 6-axis cinema arm (primary test robot) ─────────────────────────
# Values are illustrative but realistic for a cinema-grade industrial arm.
# Real values would come from manufacturer CAD + datasheets.

_JOINTS_R7: dict[str, dict[str, Any]] = {
    "j1_shoulder": {
        "type": "revolute",
        "effort_limit": 47.3,         # Nm — from datasheet
        "velocity_limit": 1.57,       # rad/s
        "lower": -3.14159,
        "upper": 3.14159,
        "damping": None,              # NULL — no verified source
        "friction": None,             # NULL — no verified source
        "axis_x": 0.0,
        "axis_y": 0.0,
        "axis_z": 1.0,
    },
    "j2_upper_arm": {
        "type": "revolute",
        "effort_limit": 85.1,
        "velocity_limit": 1.57,
        "lower": -2.61799,
        "upper": 2.61799,
        "damping": None,
        "friction": None,
        "axis_x": 0.0,
        "axis_y": 1.0,
        "axis_z": 0.0,
    },
    "j3_elbow": {
        "type": "revolute",
        "effort_limit": 42.7,
        "velocity_limit": 1.57,
        "lower": -2.26893,
        "upper": 2.26893,
        "damping": None,
        "friction": None,
        "axis_x": 0.0,
        "axis_y": 1.0,
        "axis_z": 0.0,
    },
    "j4_forearm": {
        "type": "revolute",
        "effort_limit": 21.3,
        "velocity_limit": 3.14159,
        "lower": -6.28318,
        "upper": 6.28318,
        "damping": None,
        "friction": None,
        "axis_x": 1.0,
        "axis_y": 0.0,
        "axis_z": 0.0,
    },
    "j5_wrist": {
        "type": "revolute",
        "effort_limit": 10.8,
        "velocity_limit": 3.14159,
        "lower": -2.26893,
        "upper": 2.26893,
        "damping": None,
        "friction": None,
        "axis_x": 0.0,
        "axis_y": 1.0,
        "axis_z": 0.0,
    },
    "j6_flange": {
        "type": "revolute",
        "effort_limit": 9.4,
        "velocity_limit": 6.28318,
        "lower": -6.28318,
        "upper": 6.28318,
        "damping": None,
        "friction": None,
        "axis_x": 1.0,
        "axis_y": 0.0,
        "axis_z": 0.0,
    },
}

_LINKS_R7: dict[str, dict[str, Any]] = {
    "base_link": {
        "mass": 4.823,               # kg — from manufacturer CAD
        "ixx": 0.04127,
        "iyy": 0.03891,
        "izz": 0.02983,
        "ixy": -0.00142,
        "ixz": 0.00087,
        "iyz": -0.00063,
        "mesh_filename": "base_link.stl",
    },
    "link_1": {
        "mass": 2.341,
        "ixx": 0.01823,
        "iyy": 0.01654,
        "izz": 0.00932,
        "ixy": None,                 # NULL — CAD not available for this link
        "ixz": None,
        "iyz": None,
        "mesh_filename": "link_1.stl",
    },
    "link_2": {
        "mass": None,                # NULL — no verified source
        "ixx": None,
        "iyy": None,
        "izz": None,
        "ixy": None,
        "ixz": None,
        "iyz": None,
        "mesh_filename": None,
    },
    "link_3": {
        "mass": 1.872,
        "ixx": 0.00934,
        "iyy": 0.00876,
        "izz": 0.00542,
        "ixy": -0.00031,
        "ixz": 0.00018,
        "iyz": -0.00009,
        "mesh_filename": "link_3.stl",
    },
    "link_4": {
        "mass": 0.934,
        "ixx": 0.00312,
        "iyy": 0.00298,
        "izz": 0.00187,
        "ixy": None,
        "ixz": None,
        "iyz": None,
        "mesh_filename": "link_4.stl",
    },
    "link_5": {
        "mass": 0.621,
        "ixx": 0.00143,
        "iyy": 0.00138,
        "izz": 0.00092,
        "ixy": None,
        "ixz": None,
        "iyz": None,
        "mesh_filename": "link_5.stl",
    },
    "flange_link": {
        "mass": 0.284,
        "ixx": 0.00043,
        "iyy": 0.00041,
        "izz": 0.00038,
        "ixy": None,
        "ixz": None,
        "iyz": None,
        "mesh_filename": "flange_link.stl",
    },
}

# ── Robot 3 — test robot for intent mismatch cases ───────────────────────────

_JOINTS_R3: dict[str, dict[str, Any]] = {
    "j1_base": {
        "type": "revolute",
        "effort_limit": 120.0,
        "velocity_limit": 1.0,
        "lower": -3.14159,
        "upper": 3.14159,
        "damping": None,
        "friction": None,
        "axis_x": 0.0,
        "axis_y": 0.0,
        "axis_z": 1.0,
    },
}

_LINKS_R3: dict[str, dict[str, Any]] = {
    "base_link": {
        "mass": 7.21,
        "ixx": 0.08231,
        "iyy": 0.07891,
        "izz": 0.05923,
        "ixy": None,
        "ixz": None,
        "iyz": None,
        "mesh_filename": "r3_base.stl",
    },
}


# ── Top-level mock DB ─────────────────────────────────────────────────────────

MOCK_DB: dict[int, dict[str, Any]] = {
    7: {"joints": _JOINTS_R7, "links": _LINKS_R7},
    3: {"joints": _JOINTS_R3, "links": _LINKS_R3},
}

SCHEMA_VERSION = "3.1.0"


# ── Query interface — matches DB Agent tool signatures ────────────────────────

def get_field(
    robot_id: int,
    table: str,
    element: str,
    column: str,
) -> Any:
    """
    Retrieve a single field value. Returns None for NULL fields.
    Raises KeyError for unknown robot_id, table, element, or column.
    """
    robot = MOCK_DB.get(robot_id)
    if robot is None:
        raise KeyError(f"robot_id={robot_id} not found in mock DB")
    tbl = robot.get(table)
    if tbl is None:
        raise KeyError(f"table='{table}' not found for robot_id={robot_id}")
    element_row = tbl.get(element)
    if element_row is None:
        raise KeyError(f"element='{element}' not found in {table} for robot_id={robot_id}")
    if column not in element_row:
        raise KeyError(f"column='{column}' not found in {table}.{element}")
    return element_row[column]


def is_null(robot_id: int, table: str, element: str, column: str) -> bool:
    """True if the DB value for this field is NULL (None)."""
    try:
        return get_field(robot_id, table, element, column) is None
    except KeyError:
        return False  # Missing = not in DB, different from NULL


def get_joint_names(robot_id: int) -> list[str]:
    """Return joint names in insertion order for a robot."""
    robot = MOCK_DB.get(robot_id)
    if robot is None:
        raise KeyError(f"robot_id={robot_id} not found")
    return list(robot["joints"].keys())


def get_link_names(robot_id: int) -> list[str]:
    robot = MOCK_DB.get(robot_id)
    if robot is None:
        raise KeyError(f"robot_id={robot_id} not found")
    return list(robot["links"].keys())


def values_match(
    robot_id: int,
    table: str,
    element: str,
    column: str,
    output_value: Any,
    tolerance: float = 1e-6,
) -> bool:
    """
    Check if output_value matches the DB value within tolerance.
    Returns False if DB value is NULL (output should also be NULL/None in that case).
    """
    db_value = get_field(robot_id, table, element, column)
    if db_value is None:
        return output_value is None
    if output_value is None:
        return False
    try:
        return abs(float(db_value) - float(output_value)) <= tolerance
    except (TypeError, ValueError):
        return str(db_value) == str(output_value)
