"""
Mission Control API — Registry Routes
File registry CRUD, robot registration, scene listing.
Status lifecycle enforced via FileRegistry.STATUS_TRANSITIONS.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import FileRegistry, Robot, SceneRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class FileCreate(BaseModel):
    file_type: str
    robot_id: Optional[int] = None
    scene_id: Optional[UUID] = None
    version: str
    file_hash: str
    file_path: str
    build_id: Optional[UUID] = None
    null_fields: Optional[dict] = None
    notes: Optional[str] = None


class FileOut(BaseModel):
    file_id: UUID
    file_type: str
    robot_id: Optional[int]
    scene_id: Optional[UUID]
    version: str
    file_hash: str
    file_path: str
    build_id: Optional[UUID]
    null_fields: Optional[dict]
    status: str
    created_at: datetime
    promoted_at: Optional[datetime]
    promoted_by: Optional[str]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class StatusUpdate(BaseModel):
    status: str
    promoted_by: Optional[str] = None


class RobotCreate(BaseModel):
    robot_id: str
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    dof: Optional[int] = None
    payload_kg: Optional[float] = None
    reach_mm: Optional[float] = None
    description: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class RobotOut(BaseModel):
    robot_id: str
    name: str
    manufacturer: Optional[str]
    model: Optional[str]
    dof: Optional[int]
    payload_kg: Optional[float]
    reach_mm: Optional[float]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneOut(BaseModel):
    scene_id: UUID
    name: str
    description: Optional[str]
    usd_stage_file_id: Optional[UUID]
    world_config_file_id: Optional[UUID]
    robot_ids: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# =============================================================================
# File Registry Endpoints
# =============================================================================


@router.get("/files", response_model=list[FileOut])
async def list_files(
    robot_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(FileRegistry).order_by(FileRegistry.created_at.desc())
    if robot_id is not None:
        stmt = stmt.where(FileRegistry.robot_id == robot_id)
    if status:
        stmt = stmt.where(FileRegistry.status == status)
    if file_type:
        stmt = stmt.where(FileRegistry.file_type == file_type)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/files/{file_id}", response_model=FileOut)
async def get_file(
    file_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")
    return entry


@router.post("/files", response_model=FileOut, status_code=201)
async def create_file(
    body: FileCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    entry = FileRegistry(
        file_type=body.file_type,
        robot_id=body.robot_id,
        scene_id=body.scene_id,
        version=body.version,
        file_hash=body.file_hash,
        file_path=body.file_path,
        build_id=body.build_id,
        null_fields=body.null_fields,
        notes=body.notes,
        status="draft",
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("file_registered", file_id=str(entry.file_id), file_type=body.file_type)
    return entry


@router.patch("/files/{file_id}/status", response_model=FileOut)
async def update_file_status(
    file_id: UUID,
    body: StatusUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")

    allowed = FileRegistry.STATUS_TRANSITIONS.get(entry.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition from '{entry.status}' to '{body.status}'. "
            f"Allowed: {allowed}",
        )

    entry.status = body.status
    if body.status == "promoted":
        entry.promoted_at = func.now()
        entry.promoted_by = body.promoted_by
    await session.flush()
    await session.refresh(entry)
    logger.info("file_status_updated", file_id=str(file_id), status=body.status)
    return entry


# =============================================================================
# Robot Endpoints
# =============================================================================


@router.get("/robots", response_model=list[RobotOut])
async def list_robots(
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(Robot).order_by(Robot.created_at.desc()))
    return result.scalars().all()


@router.post("/robots", response_model=RobotOut, status_code=201)
async def create_robot(
    body: RobotCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    existing = await session.execute(
        select(Robot).where(Robot.robot_id == body.robot_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Robot '{body.robot_id}' already exists")

    robot = Robot(
        robot_id=body.robot_id,
        name=body.name,
        manufacturer=body.manufacturer,
        model=body.model,
        dof=body.dof,
        payload_kg=body.payload_kg,
        reach_mm=body.reach_mm,
        description=body.description,
        metadata_=body.metadata,
    )
    session.add(robot)
    await session.flush()
    await session.refresh(robot)
    logger.info("robot_registered", robot_id=body.robot_id)
    return robot


# =============================================================================
# Scene Endpoints
# =============================================================================


@router.get("/scenes", response_model=list[SceneOut])
async def list_scenes(
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(SceneRegistry).order_by(SceneRegistry.created_at.desc()))
    return result.scalars().all()
