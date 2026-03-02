"""
Mission Control — Empirical Database ORM Models
Read-only source of truth for robot physical properties.
Separate Base from registry — these are independent databases.
All physical fields nullable (NULL = unverified per GUARDRAILS L1-R3).
"""

from datetime import datetime

from sqlalchemy import (
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class EmpiricalBase(DeclarativeBase):
    pass


class Robot(EmpiricalBase):
    __tablename__ = "robots"

    robot_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(256), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    dof: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    reach_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    repeatability_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class JointSpec(EmpiricalBase):
    __tablename__ = "joint_specs"
    __table_args__ = (
        UniqueConstraint("robot_id", "joint_name", name="uq_joint_robot_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    joint_name: Mapped[str] = mapped_column(String(128), nullable=False)
    joint_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    parent_link: Mapped[str | None] = mapped_column(String(128), nullable=True)
    child_link: Mapped[str | None] = mapped_column(String(128), nullable=True)
    origin_xyz: Mapped[str | None] = mapped_column(String(128), nullable=True)
    origin_rpy: Mapped[str | None] = mapped_column(String(128), nullable=True)
    axis: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lower_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    upper_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    effort_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    velocity_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    damping: Mapped[float | None] = mapped_column(Float, nullable=True)
    friction: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class LinkSpec(EmpiricalBase):
    __tablename__ = "link_specs"
    __table_args__ = (
        UniqueConstraint("robot_id", "link_name", name="uq_link_robot_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    link_name: Mapped[str] = mapped_column(String(128), nullable=False)
    mass: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_ixx: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_ixy: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_ixz: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_iyy: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_iyz: Mapped[float | None] = mapped_column(Float, nullable=True)
    inertia_izz: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin_xyz: Mapped[str | None] = mapped_column(String(128), nullable=True)
    origin_rpy: Mapped[str | None] = mapped_column(String(128), nullable=True)
    visual_mesh: Mapped[str | None] = mapped_column(String(512), nullable=True)
    collision_mesh: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class CollisionSphere(EmpiricalBase):
    __tablename__ = "collision_spheres"
    __table_args__ = (
        UniqueConstraint(
            "robot_id", "link_name", "sphere_index",
            name="uq_sphere_robot_link_idx",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    link_name: Mapped[str] = mapped_column(String(128), nullable=False)
    sphere_index: Mapped[int] = mapped_column(Integer, nullable=False)
    center_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class CalibrationData(EmpiricalBase):
    __tablename__ = "calibration_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    calibration_type: Mapped[str] = mapped_column(String(64), nullable=False)
    sensor_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    calibrated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SensorSpec(EmpiricalBase):
    __tablename__ = "sensor_specs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sensor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    sensor_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    mount_link: Mapped[str | None] = mapped_column(String(128), nullable=True)
    mount_offset_xyz: Mapped[str | None] = mapped_column(String(128), nullable=True)
    mount_offset_rpy: Mapped[str | None] = mapped_column(String(128), nullable=True)
    intrinsics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extrinsics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
