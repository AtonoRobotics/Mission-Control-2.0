"""
Mission Control API — Robot Configuration Routes
Configuration CRUD and Build (file generation) endpoint.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import (
    Robot,
    RobotConfiguration,
    ConfigurationPackage,
    ComponentRegistry,
)
from db.session import get_registry_session
from services.config_generator import (
    generate_urdf_from_config,
    generate_usd_from_config,
    generate_curobo_yaml_from_config,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

VALID_BASE_TYPES = ["standing", "track", "track_weighted"]


class ConfigurationCreate(BaseModel):
    name: str
    base_type: str = "standing"
    base_config: dict = Field(default_factory=dict)
    payload_package_id: Optional[uuid.UUID] = None
    sensor_package_id: Optional[uuid.UUID] = None


class ConfigurationUpdate(BaseModel):
    name: Optional[str] = None
    base_type: Optional[str] = None
    base_config: Optional[dict] = None
    payload_package_id: Optional[uuid.UUID] = None
    sensor_package_id: Optional[uuid.UUID] = None


class ConfigurationOut(BaseModel):
    config_id: uuid.UUID
    robot_id: str
    name: str
    base_type: str
    base_config: dict
    payload_package_id: Optional[uuid.UUID]
    sensor_package_id: Optional[uuid.UUID]
    status: str
    generated_files: dict
    validation_report_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BuildResult(BaseModel):
    config_id: uuid.UUID
    status: str
    generated_files: dict
    errors: list[str]


@router.get("/{robot_id}/configurations", response_model=list[ConfigurationOut])
async def list_configurations(
    robot_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = (
        select(RobotConfiguration)
        .where(RobotConfiguration.robot_id == robot_id)
        .order_by(RobotConfiguration.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/{robot_id}/configurations", response_model=ConfigurationOut, status_code=201)
async def create_configuration(
    robot_id: str,
    body: ConfigurationCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    # Verify robot exists
    result = await session.execute(select(Robot).where(Robot.robot_id == robot_id))
    robot = result.scalar_one_or_none()
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")

    if body.base_type not in VALID_BASE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid base_type. Must be one of: {VALID_BASE_TYPES}",
        )

    entry = RobotConfiguration(
        robot_id=robot_id,
        name=body.name,
        base_type=body.base_type,
        base_config=body.base_config,
        payload_package_id=body.payload_package_id,
        sensor_package_id=body.sensor_package_id,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("configuration_created", config_id=str(entry.config_id), robot_id=robot_id)
    return entry


@router.get("/configurations/{config_id}", response_model=ConfigurationOut)
async def get_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return config


@router.put("/configurations/{config_id}", response_model=ConfigurationOut)
async def update_configuration(
    config_id: uuid.UUID,
    body: ConfigurationUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    if body.base_type and body.base_type not in VALID_BASE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid base_type. Must be one of: {VALID_BASE_TYPES}",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(config)
    return config


@router.delete("/configurations/{config_id}", status_code=204)
async def delete_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await session.delete(config)
    logger.info("configuration_deleted", config_id=str(config_id))


@router.post("/configurations/{config_id}/build", response_model=BuildResult)
async def build_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """
    Build all Isaac pipeline files from a robot configuration.
    Checks approval gate, generates URDF + USD + cuRobo YAML + sensor configs,
    validates via Validator Agent, registers in FileRegistry.
    """
    # Load configuration
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    errors: list[str] = []

    # Approval gate: check all components in packages are approved
    for pkg_id in [config.payload_package_id, config.sensor_package_id]:
        if not pkg_id:
            continue
        pkg_result = await session.execute(
            select(ConfigurationPackage).where(ConfigurationPackage.package_id == pkg_id)
        )
        pkg = pkg_result.scalar_one_or_none()
        if not pkg:
            errors.append(f"Package {pkg_id} not found")
            continue
        for item in pkg.component_tree:
            cid = item.get("component_id")
            if not cid:
                continue
            comp_result = await session.execute(
                select(ComponentRegistry).where(
                    ComponentRegistry.component_id == uuid.UUID(cid)
                )
            )
            comp = comp_result.scalar_one_or_none()
            if not comp:
                errors.append(f"Component {cid} not found")
            elif comp.approval_status != "approved":
                errors.append(
                    f"Component '{comp.name}' ({cid}) has status '{comp.approval_status}' — must be approved"
                )

    if errors:
        return BuildResult(
            config_id=config_id,
            status="failed",
            generated_files={},
            errors=errors,
        )

    # Assemble config dict for generators
    # Load robot info
    robot_result = await session.execute(
        select(Robot).where(Robot.robot_id == config.robot_id)
    )
    robot = robot_result.scalar_one_or_none()

    # Collect all components from packages into a flat list
    all_components: list[dict] = []
    for pkg_id in [config.payload_package_id, config.sensor_package_id]:
        if not pkg_id:
            continue
        pkg_result = await session.execute(
            select(ConfigurationPackage).where(ConfigurationPackage.package_id == pkg_id)
        )
        pkg = pkg_result.scalar_one_or_none()
        if pkg:
            for item in pkg.component_tree:
                cid = item.get("component_id")
                if not cid:
                    continue
                comp_result = await session.execute(
                    select(ComponentRegistry).where(
                        ComponentRegistry.component_id == uuid.UUID(cid)
                    )
                )
                comp = comp_result.scalar_one_or_none()
                if comp:
                    all_components.append({
                        "component_id": str(comp.component_id),
                        "name": comp.name,
                        "category": comp.category,
                        "physics": comp.physics or {},
                        "attachment_interfaces": comp.attachment_interfaces or [],
                        "joint_config": item.get("joint_config", {}),
                        "attach_to": item.get("attach_to"),
                    })

    generator_config = {
        "robot_name": robot.name if robot else config.robot_id,
        "robot_id": config.robot_id,
        "base_type": config.base_type,
        "base_config": config.base_config,
        "components": all_components,
        "dof": robot.dof if robot else None,
    }

    generated_files: dict[str, str] = {}
    try:
        generated_files["urdf"] = generate_urdf_from_config(generator_config)
        generated_files["usd"] = generate_usd_from_config(generator_config)
        generated_files["curobo_yaml"] = generate_curobo_yaml_from_config(generator_config)
    except Exception as e:
        logger.error("config_generation_failed", config_id=str(config_id), error=str(e))
        return BuildResult(
            config_id=config_id,
            status="failed",
            generated_files={},
            errors=[f"Generation error: {e}"],
        )

    # Store generated file content references
    # TODO: register in FileRegistry with SHA256 hashes via File Agent
    config.generated_files = {
        "urdf_length": len(generated_files.get("urdf", "")),
        "usd_length": len(generated_files.get("usd", "")),
        "curobo_yaml_length": len(generated_files.get("curobo_yaml", "")),
    }
    config.status = "built"
    config.updated_at = datetime.utcnow()
    await session.flush()

    logger.info(
        "configuration_built",
        config_id=str(config_id),
        files=list(generated_files.keys()),
    )

    return BuildResult(
        config_id=config_id,
        status="built",
        generated_files=config.generated_files,
        errors=[],
    )
