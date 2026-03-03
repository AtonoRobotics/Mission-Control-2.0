"""
Mission Control API — Component Registry Routes
Component CRUD, HIT approval, AI research trigger.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import ComponentRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()

VALID_CATEGORIES = [
    "camera", "lens", "camera_plate", "fiz", "rail",
    "base", "sensor", "accessory",
]


# =============================================================================
# Pydantic Schemas
# =============================================================================


class ComponentCreate(BaseModel):
    name: str
    category: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    physics: dict = Field(default_factory=dict)
    attachment_interfaces: list = Field(default_factory=list)
    data_sources: list = Field(default_factory=list)
    notes: Optional[str] = None


class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    physics: Optional[dict] = None
    attachment_interfaces: Optional[list] = None
    data_sources: Optional[list] = None
    notes: Optional[str] = None


class ComponentOut(BaseModel):
    component_id: uuid.UUID
    name: str
    category: str
    manufacturer: Optional[str]
    model: Optional[str]
    physics: dict
    attachment_interfaces: list
    data_sources: list
    approval_status: str
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    visual_mesh_file_id: Optional[uuid.UUID]
    collision_mesh_file_id: Optional[uuid.UUID]
    source_mesh_file_id: Optional[uuid.UUID]
    thumbnail_path: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResearchRequest(BaseModel):
    name: str
    category: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None


class ApprovalAction(BaseModel):
    approved_by: str
    notes: Optional[str] = None


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.get("", response_model=list[ComponentOut])
async def list_components(
    category: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    """List components, optionally filtered by category and approval status."""
    stmt = select(ComponentRegistry).order_by(ComponentRegistry.created_at.desc())
    if category:
        stmt = stmt.where(ComponentRegistry.category == category)
    if approval_status:
        stmt = stmt.where(ComponentRegistry.approval_status == approval_status)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=ComponentOut, status_code=201)
async def create_component(
    body: ComponentCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new component in the registry."""
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{body.category}'. Must be one of: {VALID_CATEGORIES}",
        )
    entry = ComponentRegistry(
        name=body.name,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        physics=body.physics,
        attachment_interfaces=body.attachment_interfaces,
        data_sources=body.data_sources,
        notes=body.notes,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("component_created", component_id=str(entry.component_id), name=entry.name)
    return entry


@router.get("/{component_id}", response_model=ComponentOut)
async def get_component(
    component_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a single component by ID."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.put("/{component_id}", response_model=ComponentOut)
async def update_component(
    component_id: uuid.UUID,
    body: ComponentUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Update a component's fields."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    if body.category and body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{body.category}'. Must be one of: {VALID_CATEGORIES}",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(component, field, value)
    component.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(component)
    logger.info("component_updated", component_id=str(component_id))
    return component


@router.delete("/{component_id}", status_code=204)
async def delete_component(
    component_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete a component."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    await session.delete(component)
    logger.info("component_deleted", component_id=str(component_id))


# =============================================================================
# HIT Approval Endpoints
# =============================================================================


@router.post("/{component_id}/approve", response_model=ComponentOut)
async def approve_component(
    component_id: uuid.UUID,
    body: ApprovalAction,
    session: AsyncSession = Depends(get_registry_session),
):
    """HIT approve a component's physics data."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    if component.approval_status == "approved":
        raise HTTPException(status_code=409, detail="Component already approved")
    component.approval_status = "approved"
    component.approved_by = body.approved_by
    component.approved_at = datetime.utcnow()
    component.updated_at = datetime.utcnow()
    if body.notes:
        component.notes = body.notes
    await session.flush()
    await session.refresh(component)
    logger.info("component_approved", component_id=str(component_id), by=body.approved_by)
    return component


@router.post("/{component_id}/reject", response_model=ComponentOut)
async def reject_component(
    component_id: uuid.UUID,
    body: ApprovalAction,
    session: AsyncSession = Depends(get_registry_session),
):
    """HIT reject a component's physics data."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    component.approval_status = "rejected"
    component.updated_at = datetime.utcnow()
    if body.notes:
        component.notes = body.notes
    await session.flush()
    await session.refresh(component)
    logger.info("component_rejected", component_id=str(component_id), by=body.approved_by)
    return component


# =============================================================================
# AI Research Trigger
# =============================================================================


@router.post("/research", response_model=ComponentOut, status_code=201)
async def research_component(
    body: ResearchRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """
    Trigger AI research for a component.
    Creates the component entry with pending_hit status, then dispatches
    the research agent to populate physics data.
    """
    entry = ComponentRegistry(
        name=body.name,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        approval_status="pending_hit",
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)

    # Dispatch research agent (fire-and-forget — agent updates DB directly)
    from services.component_researcher import research_component_physics
    try:
        await research_component_physics(
            component_id=str(entry.component_id),
            name=body.name,
            category=body.category,
            manufacturer=body.manufacturer,
            model=body.model,
        )
    except Exception as e:
        logger.warning(
            "research_dispatch_failed",
            component_id=str(entry.component_id),
            error=str(e),
        )

    logger.info(
        "component_research_requested",
        component_id=str(entry.component_id),
        name=body.name,
    )
    return entry
