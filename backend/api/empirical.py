"""
Mission Control — Empirical Database Read-Only API
Exposes robot physical specs from the empirical DB (joints, links, sensors, spheres).
All endpoints are read-only. NULL values are returned faithfully per GUARDRAILS L1-R3.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_empirical_session
from db.empirical.models import JointSpec, LinkSpec, SensorSpec, CollisionSphere

router = APIRouter()


@router.get("/robots/{robot_id}/joints")
async def get_joints(
    robot_id: str,
    session: AsyncSession = Depends(get_empirical_session),
):
    stmt = select(JointSpec).where(JointSpec.robot_id == robot_id).order_by(JointSpec.id)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, detail=f"No joints found for robot_id={robot_id}")
    return [
        {
            "joint_name": r.joint_name,
            "joint_type": r.joint_type,
            "parent_link": r.parent_link,
            "child_link": r.child_link,
            "axis": r.axis,
            "lower_limit": r.lower_limit,
            "upper_limit": r.upper_limit,
            "effort_limit": r.effort_limit,
            "velocity_limit": r.velocity_limit,
            "damping": r.damping,
            "friction": r.friction,
        }
        for r in rows
    ]


@router.get("/robots/{robot_id}/links")
async def get_links(
    robot_id: str,
    session: AsyncSession = Depends(get_empirical_session),
):
    stmt = select(LinkSpec).where(LinkSpec.robot_id == robot_id).order_by(LinkSpec.id)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, detail=f"No links found for robot_id={robot_id}")
    return [
        {
            "link_name": r.link_name,
            "mass": r.mass,
            "inertia_ixx": r.inertia_ixx,
            "inertia_iyy": r.inertia_iyy,
            "inertia_izz": r.inertia_izz,
            "visual_mesh": r.visual_mesh,
            "collision_mesh": r.collision_mesh,
        }
        for r in rows
    ]


@router.get("/robots/{robot_id}/sensors")
async def get_sensors(
    robot_id: str,
    session: AsyncSession = Depends(get_empirical_session),
):
    stmt = select(SensorSpec).where(SensorSpec.robot_id == robot_id).order_by(SensorSpec.id)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "sensor_id": r.sensor_id,
            "sensor_type": r.sensor_type,
            "model": r.model,
            "mount_link": r.mount_link,
            "mount_offset_xyz": r.mount_offset_xyz,
            "mount_offset_rpy": r.mount_offset_rpy,
        }
        for r in rows
    ]


@router.get("/robots/{robot_id}/spheres")
async def get_spheres(
    robot_id: str,
    session: AsyncSession = Depends(get_empirical_session),
):
    stmt = (
        select(CollisionSphere)
        .where(CollisionSphere.robot_id == robot_id)
        .order_by(CollisionSphere.link_name, CollisionSphere.sphere_index)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "link_name": r.link_name,
            "sphere_index": r.sphere_index,
            "center_x": r.center_x,
            "center_y": r.center_y,
            "center_z": r.center_z,
            "radius": r.radius,
        }
        for r in rows
    ]
