"""
Mission Control API — Compute Snapshot Routes
GPU/CPU/disk metrics pushed by monitor agent, queried by dashboard.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import ComputeSnapshot
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class SnapshotCreate(BaseModel):
    host: str
    gpu_stats: list = []
    cpu_percent: Optional[float] = None
    memory_used_gb: Optional[float] = None
    memory_total_gb: Optional[float] = None
    disk_used_gb: Optional[float] = None
    disk_total_gb: Optional[float] = None


class SnapshotOut(BaseModel):
    snapshot_id: UUID
    host: str
    timestamp: datetime
    gpu_stats: list
    cpu_percent: Optional[float]
    memory_used_gb: Optional[float]
    memory_total_gb: Optional[float]
    disk_used_gb: Optional[float]
    disk_total_gb: Optional[float]

    model_config = {"from_attributes": True}


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/snapshots", response_model=list[SnapshotOut])
async def list_snapshots(
    host: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(ComputeSnapshot).order_by(ComputeSnapshot.timestamp.desc())
    if host:
        stmt = stmt.where(ComputeSnapshot.host == host)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/snapshots/latest/{host}", response_model=SnapshotOut)
async def get_latest_snapshot(
    host: str,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComputeSnapshot)
        .where(ComputeSnapshot.host == host)
        .order_by(ComputeSnapshot.timestamp.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"No snapshots for host '{host}'")
    return snapshot


@router.post("/snapshots", response_model=SnapshotOut, status_code=201)
async def create_snapshot(
    body: SnapshotCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    snapshot = ComputeSnapshot(
        host=body.host,
        gpu_stats=body.gpu_stats,
        cpu_percent=body.cpu_percent,
        memory_used_gb=body.memory_used_gb,
        memory_total_gb=body.memory_total_gb,
        disk_used_gb=body.disk_used_gb,
        disk_total_gb=body.disk_total_gb,
    )
    session.add(snapshot)
    await session.flush()
    await session.refresh(snapshot)
    logger.info("compute_snapshot_created", host=body.host, snapshot_id=str(snapshot.snapshot_id))
    return snapshot
