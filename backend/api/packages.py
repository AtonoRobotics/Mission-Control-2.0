"""
Mission Control API — Configuration Package Routes
Payload and sensor package CRUD.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import ConfigurationPackage, ComponentRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


class PackageCreate(BaseModel):
    name: str
    package_type: str
    component_tree: list = Field(default_factory=list)
    description: Optional[str] = None


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    component_tree: Optional[list] = None
    description: Optional[str] = None


class PackageOut(BaseModel):
    package_id: uuid.UUID
    name: str
    package_type: str
    component_tree: list
    total_mass_kg: Optional[float]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ValidateResult(BaseModel):
    compatible: bool
    warnings: list[str]
    total_mass_kg: float
    robot_capacity_kg: Optional[float]


@router.get("", response_model=list[PackageOut])
async def list_packages(
    package_type: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(ConfigurationPackage).order_by(ConfigurationPackage.created_at.desc())
    if package_type:
        stmt = stmt.where(ConfigurationPackage.package_type == package_type)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PackageOut, status_code=201)
async def create_package(
    body: PackageCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    if body.package_type not in ("payload", "sensor"):
        raise HTTPException(status_code=400, detail="package_type must be 'payload' or 'sensor'")

    # Compute total mass from component tree
    total_mass = 0.0
    for item in body.component_tree:
        cid = item.get("component_id")
        if cid:
            result = await session.execute(
                select(ComponentRegistry).where(ComponentRegistry.component_id == uuid.UUID(cid))
            )
            comp = result.scalar_one_or_none()
            if comp and comp.physics.get("mass_kg"):
                total_mass += comp.physics["mass_kg"]

    entry = ConfigurationPackage(
        name=body.name,
        package_type=body.package_type,
        component_tree=body.component_tree,
        total_mass_kg=total_mass if total_mass > 0 else None,
        description=body.description,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("package_created", package_id=str(entry.package_id), name=entry.name)
    return entry


@router.get("/{package_id}", response_model=PackageOut)
async def get_package(
    package_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


@router.put("/{package_id}", response_model=PackageOut)
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    pkg.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(pkg)
    return pkg


@router.delete("/{package_id}", status_code=204)
async def delete_package(
    package_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    await session.delete(pkg)
    logger.info("package_deleted", package_id=str(package_id))
