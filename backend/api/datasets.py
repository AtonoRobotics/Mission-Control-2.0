"""Dataset Registry CRUD — manage training/evaluation datasets."""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import DatasetRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)

router = APIRouter()


# ── Pydantic schemas ─────────────────────────────────────────────────────────


class DatasetCreate(BaseModel):
    name: str
    version: str
    source_bag_paths: list = []
    robot_id: int | None = None
    scene_id: UUID | None = None
    labels: list = []
    split: dict | None = None
    size_bytes: int | None = None


class DatasetUpdate(BaseModel):
    name: str | None = None
    version: str | None = None
    source_bag_paths: list | None = None
    robot_id: int | None = None
    scene_id: UUID | None = None
    labels: list | None = None
    split: dict | None = None
    size_bytes: int | None = None


class DatasetOut(BaseModel):
    model_config = {"from_attributes": True}

    dataset_id: UUID
    name: str
    version: str
    source_bag_paths: list
    robot_id: int | None
    scene_id: UUID | None
    labels: list
    split: dict | None
    size_bytes: int | None
    created_at: datetime


class DatasetListOut(BaseModel):
    model_config = {"from_attributes": True}

    dataset_id: UUID
    name: str
    version: str
    robot_id: int | None
    size_bytes: int | None
    created_at: datetime


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/", response_model=DatasetOut, status_code=201)
async def create_dataset(
    payload: DatasetCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    row = DatasetRegistry(**payload.model_dump(exclude_none=True))
    session.add(row)
    await session.flush()
    await session.refresh(row)
    logger.info("dataset_created", dataset_id=str(row.dataset_id), name=row.name)
    return row


@router.get("/", response_model=list[DatasetListOut])
async def list_datasets(
    robot_id: int | None = Query(None),
    name: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    query = select(DatasetRegistry).order_by(DatasetRegistry.created_at.desc())
    if robot_id is not None:
        query = query.where(DatasetRegistry.robot_id == robot_id)
    if name:
        query = query.where(DatasetRegistry.name.ilike(f"%{name}%"))
    result = await session.execute(query.offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/{dataset_id}", response_model=DatasetOut)
async def get_dataset(
    dataset_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(DatasetRegistry).where(DatasetRegistry.dataset_id == dataset_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return row


@router.patch("/{dataset_id}", response_model=DatasetOut)
async def update_dataset(
    dataset_id: UUID,
    payload: DatasetUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(DatasetRegistry).where(DatasetRegistry.dataset_id == dataset_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    await session.refresh(row)
    logger.info("dataset_updated", dataset_id=str(dataset_id))
    return row


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(DatasetRegistry).where(DatasetRegistry.dataset_id == dataset_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await session.delete(row)
    await session.flush()
    logger.info("dataset_deleted", dataset_id=str(dataset_id))
