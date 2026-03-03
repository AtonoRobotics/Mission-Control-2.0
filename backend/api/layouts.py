"""
Mission Control API — Layout Routes
Create, list, retrieve, update, delete, and promote layouts.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import Layout
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class LayoutCreate(BaseModel):
    name: str
    layout_json: dict
    team_id: Optional[str] = None


class LayoutUpdate(BaseModel):
    name: Optional[str] = None
    layout_json: Optional[dict] = None


class LayoutPromote(BaseModel):
    team_id: str


class LayoutOut(BaseModel):
    layout_id: UUID
    name: str
    owner_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    layout_json: dict
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LayoutListOut(BaseModel):
    layout_id: UUID
    name: str
    owner_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# =============================================================================
# Endpoints
# =============================================================================


@router.post("", response_model=LayoutOut, status_code=201)
async def create_layout(
    body: LayoutCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    layout = Layout(
        name=body.name,
        layout_json=body.layout_json,
        team_id=body.team_id,
    )
    session.add(layout)
    await session.flush()
    await session.refresh(layout)
    logger.info("layout_created", layout_id=str(layout.layout_id), name=body.name)
    return layout


@router.get("", response_model=list[LayoutListOut])
async def list_layouts(
    owner_id: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(Layout).order_by(Layout.created_at.desc())
    if owner_id is not None:
        stmt = stmt.where(Layout.owner_id == owner_id)
    if team_id is not None:
        stmt = stmt.where(Layout.team_id == team_id)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/{layout_id}", response_model=LayoutOut)
async def get_layout(
    layout_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Layout).where(Layout.layout_id == layout_id)
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    return layout


@router.patch("/{layout_id}", response_model=LayoutOut)
async def update_layout(
    layout_id: UUID,
    body: LayoutUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Layout).where(Layout.layout_id == layout_id)
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(layout, key, value)

    await session.flush()
    await session.refresh(layout)
    logger.info("layout_updated", layout_id=str(layout_id))
    return layout


@router.delete("/{layout_id}", status_code=204)
async def delete_layout(
    layout_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Layout).where(Layout.layout_id == layout_id)
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")

    await session.delete(layout)
    await session.flush()
    logger.info("layout_deleted", layout_id=str(layout_id))


@router.post("/{layout_id}/promote", response_model=LayoutOut)
async def promote_layout(
    layout_id: UUID,
    body: LayoutPromote,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Layout).where(Layout.layout_id == layout_id)
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")

    layout.team_id = body.team_id
    await session.flush()
    await session.refresh(layout)
    logger.info("layout_promoted", layout_id=str(layout_id), team_id=body.team_id)
    return layout
