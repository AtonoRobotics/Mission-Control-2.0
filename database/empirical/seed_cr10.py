#!/usr/bin/env python3
"""
Seed the empirical DB with CR10 data from URDF and collision spheres YAML.
Idempotent — checks before inserting.

Usage:
  python database/empirical/seed_cr10.py
"""

import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# Setup paths
project_root = Path(__file__).resolve().parents[2]
load_dotenv(project_root / ".env.machines")
sys.path.insert(0, str(project_root / "backend"))

from db.empirical.models import (  # noqa: E402
    EmpiricalBase,
    Robot,
    JointSpec,
    LinkSpec,
    CollisionSphere,
)

ROBOT_ID = "dobot_cr10"
URDF_PATH = Path.home() / "dobot_cr10" / "cr10_robot.urdf"
SPHERES_PATH = Path.home() / "dobot_cr10" / "config" / "cr10_collision_spheres.yaml"


def get_sync_url() -> str:
    url = os.environ.get("MC_EMPIRICAL_DB_URL", "")
    if not url:
        raise RuntimeError("MC_EMPIRICAL_DB_URL not set")
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def parse_urdf(urdf_path: Path) -> tuple[list[dict], list[dict]]:
    """Parse URDF XML, return (joints, links) as dicts."""
    tree = ET.parse(urdf_path)
    root = tree.getroot()

    joints = []
    for joint_el in root.findall("joint"):
        name = joint_el.get("name")
        jtype = joint_el.get("type")

        parent = joint_el.find("parent")
        child = joint_el.find("child")
        origin = joint_el.find("origin")
        axis = joint_el.find("axis")
        limit = joint_el.find("limit")
        dynamics = joint_el.find("dynamics")

        joints.append({
            "robot_id": ROBOT_ID,
            "joint_name": name,
            "joint_type": jtype,
            "parent_link": parent.get("link") if parent is not None else None,
            "child_link": child.get("link") if child is not None else None,
            "origin_xyz": origin.get("xyz") if origin is not None else None,
            "origin_rpy": origin.get("rpy") if origin is not None else None,
            "axis": axis.get("xyz") if axis is not None else None,
            "lower_limit": float(limit.get("lower")) if limit is not None and limit.get("lower") else None,
            "upper_limit": float(limit.get("upper")) if limit is not None and limit.get("upper") else None,
            "effort_limit": float(limit.get("effort")) if limit is not None and limit.get("effort") else None,
            "velocity_limit": float(limit.get("velocity")) if limit is not None and limit.get("velocity") else None,
            "damping": float(dynamics.get("damping")) if dynamics is not None and dynamics.get("damping") else None,
            "friction": float(dynamics.get("friction")) if dynamics is not None and dynamics.get("friction") else None,
        })

    links = []
    for link_el in root.findall("link"):
        name = link_el.get("name")
        inertial = link_el.find("inertial")
        visual = link_el.find("visual")
        collision = link_el.find("collision")

        mass = None
        ixx = ixy = ixz = iyy = iyz = izz = None
        origin_xyz = origin_rpy = None

        if inertial is not None:
            mass_el = inertial.find("mass")
            if mass_el is not None:
                mass = float(mass_el.get("value"))
            inertia_el = inertial.find("inertia")
            if inertia_el is not None:
                ixx = float(inertia_el.get("ixx", 0))
                ixy = float(inertia_el.get("ixy", 0))
                ixz = float(inertia_el.get("ixz", 0))
                iyy = float(inertia_el.get("iyy", 0))
                iyz = float(inertia_el.get("iyz", 0))
                izz = float(inertia_el.get("izz", 0))
            origin_el = inertial.find("origin")
            if origin_el is not None:
                origin_xyz = origin_el.get("xyz")
                origin_rpy = origin_el.get("rpy")

        visual_mesh = None
        if visual is not None:
            geom = visual.find("geometry")
            if geom is not None:
                mesh = geom.find("mesh")
                if mesh is not None:
                    visual_mesh = mesh.get("filename")

        collision_mesh = None
        if collision is not None:
            geom = collision.find("geometry")
            if geom is not None:
                mesh = geom.find("mesh")
                if mesh is not None:
                    collision_mesh = mesh.get("filename")

        links.append({
            "robot_id": ROBOT_ID,
            "link_name": name,
            "mass": mass,
            "inertia_ixx": ixx,
            "inertia_ixy": ixy,
            "inertia_ixz": ixz,
            "inertia_iyy": iyy,
            "inertia_iyz": iyz,
            "inertia_izz": izz,
            "origin_xyz": origin_xyz,
            "origin_rpy": origin_rpy,
            "visual_mesh": visual_mesh,
            "collision_mesh": collision_mesh,
        })

    return joints, links


def parse_spheres(spheres_path: Path) -> list[dict]:
    """Parse collision spheres YAML, return list of dicts."""
    with open(spheres_path) as f:
        data = yaml.safe_load(f)

    spheres = []
    for link_name, sphere_list in data.get("collision_spheres", {}).items():
        for idx, sphere in enumerate(sphere_list):
            center = sphere.get("center", [0, 0, 0])
            spheres.append({
                "robot_id": ROBOT_ID,
                "link_name": link_name,
                "sphere_index": idx,
                "center_x": float(center[0]),
                "center_y": float(center[1]),
                "center_z": float(center[2]),
                "radius": float(sphere.get("radius", 0)),
            })

    return spheres


def seed(engine) -> None:
    with Session(engine) as session:
        # Check if robot already exists
        result = session.execute(
            text("SELECT robot_id FROM robots WHERE robot_id = :rid"),
            {"rid": ROBOT_ID},
        )
        if result.scalar_one_or_none():
            print(f"Robot '{ROBOT_ID}' already exists — skipping seed.")
            return

        # Robot
        robot = Robot(
            robot_id=ROBOT_ID,
            name="Dobot CR10",
            manufacturer="Dobot",
            model="CR10",
            dof=6,
            payload_kg=10.0,
            reach_mm=1525.0,
            weight_kg=None,  # NULL — not verified
            repeatability_mm=None,  # NULL — not verified
            description="6-DOF cinema camera robot (ARRI Alexa Mini mount)",
        )
        session.add(robot)
        print(f"  + Robot: {ROBOT_ID}")

        # Joints
        joints_data, links_data = parse_urdf(URDF_PATH)
        for jd in joints_data:
            session.add(JointSpec(**jd))
        print(f"  + Joints: {len(joints_data)}")

        # Links
        for ld in links_data:
            session.add(LinkSpec(**ld))
        print(f"  + Links: {len(links_data)}")

        # Collision spheres
        spheres_data = parse_spheres(SPHERES_PATH)
        for sd in spheres_data:
            session.add(CollisionSphere(**sd))
        print(f"  + Collision spheres: {len(spheres_data)}")

        # calibration_data and sensor_specs left empty — correct NULL per L1-R3
        print("  - Calibration data: empty (no verified data)")
        print("  - Sensor specs: empty (no ZED X data)")

        session.commit()
        print(f"\nCR10 seed complete.")


if __name__ == "__main__":
    url = get_sync_url()
    engine = create_engine(url)
    print(f"Seeding empirical DB: {ROBOT_ID}")
    seed(engine)
