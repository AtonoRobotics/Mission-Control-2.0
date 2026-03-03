"""
Mission Control API — Build Log Routes
Create, list, retrieve, and update build logs.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import BuildLog, FileRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class BuildCreate(BaseModel):
    process: str
    robot_id: Optional[str] = None


class BuildUpdate(BaseModel):
    status: Optional[str] = None
    steps: Optional[list] = None
    null_report: Optional[list] = None


class BuildOut(BaseModel):
    build_id: UUID
    process: str
    robot_id: Optional[str]
    status: str
    steps: list
    null_report: list
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class BuildFileOut(BaseModel):
    file_id: UUID
    file_type: str
    version: str
    file_hash: str
    file_path: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# =============================================================================
# Endpoints
# =============================================================================


@router.post("", response_model=BuildOut, status_code=201)
async def create_build(
    body: BuildCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    build = BuildLog(
        process=body.process,
        robot_id=body.robot_id,
        status="pending",
    )
    session.add(build)
    await session.flush()
    await session.refresh(build)
    logger.info("build_created", build_id=str(build.build_id), process=body.process)
    return build


@router.get("", response_model=list[BuildOut])
async def list_builds(
    robot_id: Optional[str] = Query(None),
    process: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(BuildLog).order_by(BuildLog.created_at.desc())
    if robot_id is not None:
        stmt = stmt.where(BuildLog.robot_id == robot_id)
    if process:
        stmt = stmt.where(BuildLog.process == process)
    if status:
        stmt = stmt.where(BuildLog.status == status)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/{build_id}", response_model=BuildOut)
async def get_build(
    build_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(BuildLog).where(BuildLog.build_id == build_id)
    )
    build = result.scalar_one_or_none()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@router.patch("/{build_id}", response_model=BuildOut)
async def update_build(
    build_id: UUID,
    body: BuildUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(BuildLog).where(BuildLog.build_id == build_id)
    )
    build = result.scalar_one_or_none()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    if body.status is not None:
        build.status = body.status
        if body.status in ("completed", "failed"):
            build.completed_at = func.now()
    if body.steps is not None:
        build.steps = body.steps
    if body.null_report is not None:
        build.null_report = body.null_report

    await session.flush()
    await session.refresh(build)
    logger.info("build_updated", build_id=str(build_id), status=build.status)
    return build


@router.get("/{build_id}/files", response_model=list[BuildFileOut])
async def list_build_files(
    build_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    # Verify build exists
    result = await session.execute(
        select(BuildLog).where(BuildLog.build_id == build_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Build not found")

    result = await session.execute(
        select(FileRegistry)
        .where(FileRegistry.build_id == build_id)
        .order_by(FileRegistry.created_at.asc())
    )
    return result.scalars().all()
