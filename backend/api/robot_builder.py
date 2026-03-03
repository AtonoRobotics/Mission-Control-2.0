"""Robot Builder Phase 2 — ConfigurationPackage + RobotConfiguration CRUD."""

from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import ConfigurationPackage, RobotConfiguration
from db.session import get_registry_session

logger = structlog.get_logger(__name__)

router = APIRouter()


# ── Pydantic schemas — ConfigurationPackage ──────────────────────────────────


class PackageCreate(BaseModel):
    name: str
    package_type: str
    component_ids: list = []
    tree_json: dict = {}
    total_mass_kg: float | None = None
    description: str | None = None


class PackageUpdate(BaseModel):
    name: str | None = None
    package_type: str | None = None
    component_ids: list | None = None
    tree_json: dict | None = None
    total_mass_kg: float | None = None
    description: str | None = None


class PackageOut(BaseModel):
    model_config = {"from_attributes": True}

    package_id: UUID
    name: str
    package_type: str
    component_ids: list
    tree_json: dict
    total_mass_kg: float | None
    description: str | None
    created_at: datetime
    updated_at: datetime


class PackageListOut(BaseModel):
    model_config = {"from_attributes": True}

    package_id: UUID
    name: str
    package_type: str
    total_mass_kg: float | None
    created_at: datetime


# ── Pydantic schemas — RobotConfiguration ────────────────────────────────────


class ConfigCreate(BaseModel):
    robot_id: str
    name: str
    base_type: str = "fixed"
    base_config: dict | None = None
    payload_package_id: UUID | None = None
    sensor_package_id: UUID | None = None
    notes: str | None = None


class ConfigUpdate(BaseModel):
    name: str | None = None
    base_type: str | None = None
    base_config: dict | None = None
    payload_package_id: UUID | None = None
    sensor_package_id: UUID | None = None
    generated_files: dict | None = None
    build_status: str | None = None
    build_log: dict | None = None
    notes: str | None = None


class ConfigOut(BaseModel):
    model_config = {"from_attributes": True}

    config_id: UUID
    robot_id: str
    name: str
    base_type: str
    base_config: dict | None
    payload_package_id: UUID | None
    sensor_package_id: UUID | None
    generated_files: dict | None
    build_status: str
    build_log: dict | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ConfigListOut(BaseModel):
    model_config = {"from_attributes": True}

    config_id: UUID
    robot_id: str
    name: str
    base_type: str
    build_status: str
    created_at: datetime


# ── Package endpoints ────────────────────────────────────────────────────────


@router.post("/packages", response_model=PackageOut, status_code=201)
async def create_package(
    payload: PackageCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    row = ConfigurationPackage(**payload.model_dump(exclude_none=True))
    session.add(row)
    await session.flush()
    await session.refresh(row)
    logger.info("package_created", package_id=str(row.package_id), name=row.name)
    return row


@router.get("/packages", response_model=list[PackageListOut])
async def list_packages(
    package_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    query = select(ConfigurationPackage).order_by(ConfigurationPackage.created_at.desc())
    if package_type:
        query = query.where(ConfigurationPackage.package_type == package_type)
    result = await session.execute(query.offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/packages/{package_id}", response_model=PackageOut)
async def get_package(
    package_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Package not found")
    return row


@router.patch("/packages/{package_id}", response_model=PackageOut)
async def update_package(
    package_id: UUID,
    payload: PackageUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Package not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    await session.refresh(row)
    logger.info("package_updated", package_id=str(package_id))
    return row


@router.delete("/packages/{package_id}", status_code=204)
async def delete_package(
    package_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Package not found")
    await session.delete(row)
    await session.flush()
    logger.info("package_deleted", package_id=str(package_id))


# ── Configuration endpoints ──────────────────────────────────────────────────


@router.post("/configs", response_model=ConfigOut, status_code=201)
async def create_config(
    payload: ConfigCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    row = RobotConfiguration(**payload.model_dump(exclude_none=True))
    session.add(row)
    await session.flush()
    await session.refresh(row)
    logger.info("config_created", config_id=str(row.config_id), robot_id=row.robot_id)
    return row


@router.get("/configs", response_model=list[ConfigListOut])
async def list_configs(
    robot_id: str | None = Query(None),
    build_status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    query = select(RobotConfiguration).order_by(RobotConfiguration.created_at.desc())
    if robot_id:
        query = query.where(RobotConfiguration.robot_id == robot_id)
    if build_status:
        query = query.where(RobotConfiguration.build_status == build_status)
    result = await session.execute(query.offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/configs/{config_id}", response_model=ConfigOut)
async def get_config(
    config_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return row


@router.patch("/configs/{config_id}", response_model=ConfigOut)
async def update_config(
    config_id: UUID,
    payload: ConfigUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.flush()
    await session.refresh(row)
    logger.info("config_updated", config_id=str(config_id))
    return row


@router.delete("/configs/{config_id}", status_code=204)
async def delete_config(
    config_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await session.delete(row)
    await session.flush()
    logger.info("config_deleted", config_id=str(config_id))


@router.post("/configs/{config_id}/build", response_model=ConfigOut)
async def trigger_build(
    config_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration not found")
    if row.build_status == "building":
        raise HTTPException(status_code=409, detail="Build already in progress")
    row.build_status = "building"
    row.build_log = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "steps": [],
    }
    await session.flush()
    await session.refresh(row)
    logger.info("config_build_triggered", config_id=str(config_id))
    # TODO: dispatch actual build pipeline (URDF/USD generation, validation, etc.)
    return row
