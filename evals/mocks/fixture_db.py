"""
evals/mocks/fixture_db.py
In-memory fixture database for eval and unit tests.

WARNING: Values here are TEST FIXTURES, not real empirical data.
They are intentionally slightly irregular to catch round-number detection.

DO NOT use these values in production or as DB defaults.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any


@dataclass
class FixtureJoint:
    id: int
    robot_id: int
    name: str
    joint_type: str
    effort_limit: float | None
    velocity_limit: float | None
    lower_limit: float | None
    upper_limit: float | None
    damping: float | None
    friction: float | None
    jerk_limit: float | None
    acceleration_limit: float | None


@dataclass
class FixtureLink:
    id: int
    robot_id: int
    name: str
    mass: float | None
    ixx: float | None
    iyy: float | None
    izz: float | None
    ixy: float | None
    ixz: float | None
    iyz: float | None


# Robot 7 — used in most eval cases
# Values are irregular floats to simulate real empirical data
FIXTURE_JOINTS_R7: list[FixtureJoint] = [
    FixtureJoint(14, 7, "j1_shoulder",  "revolute", 47.3,  1.55, -2.89,  2.89,  None,  None,  98.7,  9.4),
    FixtureJoint(15, 7, "j2_upper_arm", "revolute", 47.3,  1.55, -1.73,  1.73,  None,  None,  98.7,  9.4),
    FixtureJoint(16, 7, "j3_elbow",     "revolute", 32.1,  2.01, -2.53,  2.53,  None,  None,  98.7,  9.4),
    FixtureJoint(17, 7, "j4_forearm",   "revolute", 32.1,  2.01, -3.14,  3.14,  None,  None, 148.2, 14.1),
    FixtureJoint(18, 7, "j5_wrist",     "revolute", 14.8,  3.18, -2.01,  2.01,  None,  None, 148.2, 14.1),
    FixtureJoint(19, 7, "j6_flange",    "revolute",  8.7,  5.24, -6.28,  6.28,  None,  None, 298.6, 29.7),
]

FIXTURE_LINKS_R7: list[FixtureLink] = [
    FixtureLink(1,  7, "base_link",    12.347, 0.1823, 0.1823, 0.0312, 0.0,    0.0,    0.0),
    FixtureLink(2,  7, "link_1",       8.214,  0.0934, 0.0934, 0.0187, 0.0001, 0.0,    0.0),
    FixtureLink(3,  7, "link_2",       None,   None,   None,   None,   None,   None,   None),  # NULL — no CAD
    FixtureLink(4,  7, "link_3",       6.891,  0.0712, 0.0712, 0.0143, 0.0,    0.0002, 0.0),
    FixtureLink(5,  7, "link_4",       4.123,  0.0318, 0.0318, 0.0064, 0.0,    0.0,    0.0),
    FixtureLink(6,  7, "link_5",       2.067,  0.0089, 0.0089, 0.0018, 0.0,    0.0,    0.0),
    FixtureLink(7,  7, "flange_link",  0.412,  0.0012, 0.0012, 0.0002, 0.0,    0.0,    0.0),
]

# Robot 3 — used in intent mismatch tests
FIXTURE_JOINTS_R3: list[FixtureJoint] = [
    FixtureJoint(20, 3, "j1_base",      "revolute", 63.7,  1.12, -3.14,  3.14,  None,  None, 112.4, 11.2),
    FixtureJoint(21, 3, "j2_shoulder",  "revolute", 63.7,  1.12, -2.18,  2.18,  None,  None, 112.4, 11.2),
    FixtureJoint(22, 3, "j3_upper_arm", "revolute", 41.3,  1.87, -2.53,  2.53,  None,  None, 112.4, 11.2),
    FixtureJoint(23, 3, "j4_elbow",     "revolute", 41.3,  1.87, -3.14,  3.14,  None,  None, 167.3, 16.7),
    FixtureJoint(24, 3, "j5_forearm",   "revolute", 19.6,  2.91, -2.01,  2.01,  None,  None, 167.3, 16.7),
    FixtureJoint(25, 3, "j6_wrist",     "revolute", 11.2,  4.87, -6.28,  6.28,  None,  None, 312.1, 31.2),
]


class FixtureDB:
    """
    In-memory DB for tests and evals.
    Mirrors the interface of the real DB Agent without requiring a database.
    """

    def get_joints(self, robot_id: int) -> list[FixtureJoint]:
        if robot_id == 7:
            return FIXTURE_JOINTS_R7
        if robot_id == 3:
            return FIXTURE_JOINTS_R3
        return []

    def get_links(self, robot_id: int) -> list[FixtureLink]:
        if robot_id == 7:
            return FIXTURE_LINKS_R7
        return []

    def get_field_value(
        self, robot_id: int, table: str, element_name: str, column: str
    ) -> Any:
        """Return field value or None if NULL/not found."""
        if table == "joints":
            joints = self.get_joints(robot_id)
            joint = next((j for j in joints if j.name == element_name), None)
            if joint is None:
                return None
            return getattr(joint, column, None)

        if table == "links":
            links = self.get_links(robot_id)
            link = next((l for l in links if l.name == element_name), None)
            if link is None:
                return None
            return getattr(link, column, None)

        return None

    def get_joint_names(self, robot_id: int) -> list[str]:
        return [j.name for j in self.get_joints(robot_id)]

    def get_schema_version(self) -> str:
        return "3.1.0"

    def robot_exists(self, robot_id: int) -> bool:
        return robot_id in {3, 7}


# Singleton for tests
fixture_db = FixtureDB()
