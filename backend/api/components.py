"""Component Registry CRUD — Robot Builder components."""

from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_registry_session
from db.registry.models import ComponentRegistry

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class ComponentCreate(BaseModel):
    name: str
    category: str
    manufacturer: str | None = None
    model: str | None = None
    physics: dict | None = None
    attachment_interfaces: list | None = None
    notes: str | None = None


class ComponentUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    physics: dict | None = None
    attachment_interfaces: list | None = None
    mesh_variants: dict | None = None
    data_sources: list | None = None
    notes: str | None = None


class ComponentOut(BaseModel):
    model_config = {"from_attributes": True}

    component_id: UUID
    name: str
    category: str
    manufacturer: str | None
    model: str | None
    physics: dict | None
    attachment_interfaces: list | None
    data_sources: list | None
    mesh_variants: dict | None
    approval_status: str
    approved_by: str | None
    approved_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ComponentListOut(BaseModel):
    model_config = {"from_attributes": True}

    component_id: UUID
    name: str
    category: str
    manufacturer: str | None
    model: str | None
    approval_status: str
    created_at: datetime


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/", response_model=ComponentOut, status_code=201)
async def create_component(
    payload: ComponentCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    row = ComponentRegistry(**payload.model_dump(exclude_none=True))
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


@router.get("/", response_model=list[ComponentListOut])
async def list_components(
    category: str | None = Query(None),
    approval_status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    query = select(ComponentRegistry).order_by(ComponentRegistry.created_at.desc())
    if category:
        query = query.where(ComponentRegistry.category == category)
    if approval_status:
        query = query.where(ComponentRegistry.approval_status == approval_status)
    result = await session.execute(query.offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/{component_id}", response_model=ComponentOut)
async def get_component(
    component_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Component not found")
    return row


@router.patch("/{component_id}", response_model=ComponentOut)
async def update_component(
    component_id: UUID,
    payload: ComponentUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Component not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    await session.refresh(row)
    return row


@router.delete("/{component_id}", status_code=204)
async def delete_component(
    component_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Component not found")
    await session.delete(row)
    await session.flush()


@router.post("/{component_id}/approve", response_model=ComponentOut)
async def approve_component(
    component_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Component not found")
    row.approval_status = "approved"
    row.approved_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(row)
    return row


@router.post("/{component_id}/reject", response_model=ComponentOut)
async def reject_component(
    component_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Component not found")
    row.approval_status = "rejected"
    await session.flush()
    await session.refresh(row)
    return row
