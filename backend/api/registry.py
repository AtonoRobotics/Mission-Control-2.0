"""
Mission Control API — Registry Routes
File registry CRUD, robot registration, scene listing.
Status lifecycle enforced via FileRegistry.STATUS_TRANSITIONS.
"""

import hashlib
from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import FileRegistry, LaunchTemplate, Robot, SceneRegistry, SensorConfig
from db.session import get_registry_session
from services.robot_file_generator import generate_curobo_yaml, generate_urdf, generate_usd

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class FileCreate(BaseModel):
    file_type: str
    robot_id: Optional[str] = None
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
    robot_id: Optional[str]
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


class SceneCreate(BaseModel):
    name: str
    description: Optional[str] = None
    robot_ids: list = Field(default_factory=list)


class SceneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    robot_ids: Optional[list] = None
    usd_stage_file_id: Optional[UUID] = None
    world_config_file_id: Optional[UUID] = None


# =============================================================================
# File Registry Endpoints
# =============================================================================


@router.get("/files", response_model=list[FileOut])
async def list_files(
    robot_id: Optional[str] = Query(None),
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


@router.post("/files/upload", response_model=FileOut, status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    file_type: str = Query("usd"),
    robot_id: Optional[str] = Query(None),
    scene_id: Optional[UUID] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    """Upload a file (USD, OBJ, STL, URDF) and register it."""
    content_bytes = await file.read()
    content_str = content_bytes.decode("utf-8", errors="replace")
    file_hash = hashlib.sha256(content_bytes).hexdigest()
    safe_name = file.filename or "uploaded_file"
    file_path = f"uploads/{safe_name}"

    entry = FileRegistry(
        file_type=file_type,
        robot_id=robot_id,
        scene_id=scene_id,
        version="0.1.0",
        file_hash=file_hash,
        file_path=file_path,
        content=content_str,
        status="draft",
        notes=f"Uploaded: {safe_name}",
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("file_uploaded", file_id=str(entry.file_id), filename=safe_name)
    return entry


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


class ValidationReport(BaseModel):
    passed: bool
    errors: list[str]
    warnings: list[str]


class StatusUpdateResponse(FileOut):
    validation: Optional[ValidationReport] = None


@router.patch("/files/{file_id}/status", response_model=StatusUpdateResponse)
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

    # Run validation chain for guarded transitions
    validation_report = None
    if body.status in ("validated", "promoted"):
        from services.file_validator import validate_for_status_change

        content = getattr(entry, "content", None)
        result = await validate_for_status_change(entry, body.status, content)

        validation_report = ValidationReport(
            passed=result.passed,
            errors=result.errors,
            warnings=result.warnings,
        )

        if not result.passed:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": f"Validation failed for '{entry.status}' → '{body.status}'",
                    "errors": result.errors,
                    "warnings": result.warnings,
                },
            )

        # Populate null_fields from validation findings
        if result.null_fields:
            entry.null_fields = result.null_fields

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

    # Auto-generate config file scaffolds
    gen_args = dict(
        robot_id=body.robot_id,
        name=body.name,
        dof=body.dof,
        manufacturer=body.manufacturer,
        model=body.model,
    )
    file_specs = [
        ("urdf", f"robots/{body.robot_id}/{body.robot_id}.urdf", generate_urdf(**gen_args)),
        ("curobo_yaml", f"robots/{body.robot_id}/{body.robot_id}_curobo.yaml", generate_curobo_yaml(**gen_args)),
        ("usd", f"robots/{body.robot_id}/{body.robot_id}.usda", generate_usd(**gen_args)),
    ]
    for file_type, file_path, content in file_specs:
        entry = FileRegistry(
            file_type=file_type,
            robot_id=body.robot_id,
            version="0.1.0",
            file_hash=hashlib.sha256(content.encode()).hexdigest(),
            file_path=file_path,
            content=content,
            status="draft",
        )
        session.add(entry)
    await session.flush()
    logger.info("robot_files_generated", robot_id=body.robot_id, count=len(file_specs))

    return robot


# =============================================================================
# Robot Files & Content Endpoints
# =============================================================================


class RobotFileOut(BaseModel):
    file_id: UUID
    file_type: str
    file_path: str
    status: str
    version: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FileContentOut(BaseModel):
    file_id: UUID
    file_type: str
    file_path: str
    content: Optional[str]
    file_hash: str

    model_config = {"from_attributes": True}


class FileContentUpdate(BaseModel):
    content: str


@router.get("/robots/{robot_id}/files", response_model=list[RobotFileOut])
async def list_robot_files(
    robot_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    """List the latest version of each config file for a robot."""
    # Subquery: max created_at per file_type for this robot
    latest = (
        select(
            FileRegistry.file_type,
            func.max(FileRegistry.created_at).label("max_created"),
        )
        .where(FileRegistry.robot_id == robot_id)
        .group_by(FileRegistry.file_type)
        .subquery()
    )
    stmt = (
        select(FileRegistry)
        .join(
            latest,
            (FileRegistry.file_type == latest.c.file_type)
            & (FileRegistry.created_at == latest.c.max_created),
        )
        .where(FileRegistry.robot_id == robot_id)
        .order_by(FileRegistry.created_at.asc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/files/{file_id}/content", response_model=FileContentOut)
async def get_file_content(
    file_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Return file content for the Monaco editor."""
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")
    return entry


def _bump_patch(version: str) -> str:
    """Increment the patch segment of a semver string: '0.1.0' -> '0.1.1'."""
    parts = version.split(".")
    if len(parts) == 3 and parts[2].isdigit():
        parts[2] = str(int(parts[2]) + 1)
        return ".".join(parts)
    return version + ".1"


@router.put("/files/{file_id}/content", response_model=RobotFileOut)
async def update_file_content(
    file_id: UUID,
    body: FileContentUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Save edited file content as a new version (previous versions preserved)."""
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="File not found")

    new_hash = hashlib.sha256(body.content.encode()).hexdigest()
    if new_hash == source.file_hash:
        # Content unchanged — no new version needed
        return source

    new_entry = FileRegistry(
        file_type=source.file_type,
        robot_id=source.robot_id,
        scene_id=source.scene_id,
        version=_bump_patch(source.version),
        file_hash=new_hash,
        file_path=source.file_path,
        build_id=source.build_id,
        content=body.content,
        status="draft",
    )
    session.add(new_entry)
    await session.flush()
    await session.refresh(new_entry)
    logger.info(
        "file_version_created",
        file_id=str(new_entry.file_id),
        prev_id=str(file_id),
        version=new_entry.version,
    )
    return new_entry


@router.get("/files/{file_id}/history", response_model=list[RobotFileOut])
async def get_file_history(
    file_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Return all versions of a file (matched by robot_id + file_type), newest first."""
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="File not found")

    result = await session.execute(
        select(FileRegistry)
        .where(
            FileRegistry.robot_id == source.robot_id,
            FileRegistry.file_type == source.file_type,
        )
        .order_by(FileRegistry.created_at.desc())
    )
    return result.scalars().all()


@router.post("/files/{file_id}/restore", response_model=RobotFileOut)
async def restore_file_version(
    file_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Restore an old version by creating a new version with its content."""
    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="File not found")

    # Find the current latest version to bump from
    latest_result = await session.execute(
        select(FileRegistry)
        .where(
            FileRegistry.robot_id == source.robot_id,
            FileRegistry.file_type == source.file_type,
        )
        .order_by(FileRegistry.created_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one()

    new_entry = FileRegistry(
        file_type=source.file_type,
        robot_id=source.robot_id,
        scene_id=source.scene_id,
        version=_bump_patch(latest.version),
        file_hash=source.file_hash,
        file_path=source.file_path,
        build_id=source.build_id,
        content=source.content,
        status="draft",
        notes=f"Restored from v{source.version} ({source.file_id})",
    )
    session.add(new_entry)
    await session.flush()
    await session.refresh(new_entry)
    logger.info(
        "file_version_restored",
        file_id=str(new_entry.file_id),
        restored_from=str(file_id),
        version=new_entry.version,
    )
    return new_entry


@router.post("/robots/{robot_id}/generate-files", response_model=list[RobotFileOut])
async def generate_robot_files(
    robot_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    """Generate config files for an existing robot that doesn't have them yet."""
    # Verify robot exists
    result = await session.execute(select(Robot).where(Robot.robot_id == robot_id))
    robot = result.scalar_one_or_none()
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")

    # Check if files already exist
    existing = await session.execute(
        select(FileRegistry).where(FileRegistry.robot_id == robot_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Files already exist for this robot")

    gen_args = dict(
        robot_id=robot_id,
        name=robot.name,
        dof=robot.dof,
        manufacturer=robot.manufacturer,
        model=robot.model,
    )
    file_specs = [
        ("urdf", f"robots/{robot_id}/{robot_id}.urdf", generate_urdf(**gen_args)),
        ("curobo_yaml", f"robots/{robot_id}/{robot_id}_curobo.yaml", generate_curobo_yaml(**gen_args)),
        ("usd", f"robots/{robot_id}/{robot_id}.usda", generate_usd(**gen_args)),
    ]
    entries = []
    for file_type, file_path, content in file_specs:
        entry = FileRegistry(
            file_type=file_type,
            robot_id=robot_id,
            version="0.1.0",
            file_hash=hashlib.sha256(content.encode()).hexdigest(),
            file_path=file_path,
            content=content,
            status="draft",
        )
        session.add(entry)
        entries.append(entry)
    await session.flush()
    for entry in entries:
        await session.refresh(entry)
    logger.info("robot_files_generated_on_demand", robot_id=robot_id, count=len(entries))
    return entries


# =============================================================================
# Scene Endpoints
# =============================================================================


@router.get("/scenes", response_model=list[SceneOut])
async def list_scenes(
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(select(SceneRegistry).order_by(SceneRegistry.created_at.desc()))
    return result.scalars().all()


@router.get("/scenes/{scene_id}", response_model=SceneOut)
async def get_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene


@router.post("/scenes", response_model=SceneOut, status_code=201)
async def create_scene(
    body: SceneCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    scene = SceneRegistry(
        name=body.name,
        description=body.description,
        robot_ids=body.robot_ids,
    )
    session.add(scene)
    await session.flush()
    await session.refresh(scene)
    logger.info("scene_created", scene_id=str(scene.scene_id), name=body.name)
    return scene


@router.put("/scenes/{scene_id}", response_model=SceneOut)
async def update_scene(
    scene_id: UUID,
    body: SceneUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(scene, field, value)

    await session.flush()
    await session.refresh(scene)
    logger.info("scene_updated", scene_id=str(scene_id))
    return scene


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    await session.delete(scene)
    await session.flush()
    logger.info("scene_deleted", scene_id=str(scene_id))


# =============================================================================
# Sensor Config Endpoints
# =============================================================================


class SensorConfigCreate(BaseModel):
    sensor_id: str
    sensor_type: str
    robot_id: Optional[str] = None
    setup_id: Optional[str] = None
    file_id: Optional[UUID] = None
    calibration_status: str = "uncalibrated"
    null_fields: Optional[dict] = None
    topic_names: Optional[list] = None
    notes: Optional[str] = None


class SensorConfigUpdate(BaseModel):
    sensor_id: Optional[str] = None
    sensor_type: Optional[str] = None
    robot_id: Optional[str] = None
    setup_id: Optional[str] = None
    file_id: Optional[UUID] = None
    calibration_status: Optional[str] = None
    null_fields: Optional[dict] = None
    topic_names: Optional[list] = None
    notes: Optional[str] = None


class SensorConfigOut(BaseModel):
    config_id: UUID
    sensor_id: str
    sensor_type: str
    robot_id: Optional[str]
    setup_id: Optional[str]
    file_id: Optional[UUID]
    calibration_status: str
    null_fields: Optional[dict]
    topic_names: Optional[list]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/sensors", response_model=SensorConfigOut, status_code=201)
async def create_sensor_config(
    body: SensorConfigCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    entry = SensorConfig(
        sensor_id=body.sensor_id,
        sensor_type=body.sensor_type,
        robot_id=body.robot_id,
        setup_id=body.setup_id,
        file_id=body.file_id,
        calibration_status=body.calibration_status,
        null_fields=body.null_fields,
        topic_names=body.topic_names,
        notes=body.notes,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("sensor_config_created", config_id=str(entry.config_id), sensor_id=body.sensor_id)
    return entry


@router.get("/sensors", response_model=list[SensorConfigOut])
async def list_sensor_configs(
    robot_id: Optional[str] = Query(None),
    sensor_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(SensorConfig).order_by(SensorConfig.created_at.desc())
    if robot_id is not None:
        stmt = stmt.where(SensorConfig.robot_id == robot_id)
    if sensor_type is not None:
        stmt = stmt.where(SensorConfig.sensor_type == sensor_type)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/sensors/{config_id}", response_model=SensorConfigOut)
async def get_sensor_config(
    config_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SensorConfig).where(SensorConfig.config_id == config_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Sensor config not found")
    return entry


@router.patch("/sensors/{config_id}", response_model=SensorConfigOut)
async def update_sensor_config(
    config_id: UUID,
    body: SensorConfigUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SensorConfig).where(SensorConfig.config_id == config_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Sensor config not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(entry, field, value)

    await session.flush()
    await session.refresh(entry)
    logger.info("sensor_config_updated", config_id=str(config_id))
    return entry


@router.delete("/sensors/{config_id}", status_code=204)
async def delete_sensor_config(
    config_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SensorConfig).where(SensorConfig.config_id == config_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Sensor config not found")

    await session.delete(entry)
    await session.flush()
    logger.info("sensor_config_deleted", config_id=str(config_id))


# =============================================================================
# Launch Template Endpoints
# =============================================================================


class LaunchTemplateCreate(BaseModel):
    name: str
    pipeline_type: str
    robot_id: Optional[str] = None
    file_id: Optional[UUID] = None
    node_list: list = Field(default_factory=list)
    topic_connectivity: Optional[dict] = None
    null_fields: Optional[dict] = None
    status: str = "draft"
    notes: Optional[str] = None


class LaunchTemplateUpdate(BaseModel):
    name: Optional[str] = None
    pipeline_type: Optional[str] = None
    robot_id: Optional[str] = None
    file_id: Optional[UUID] = None
    node_list: Optional[list] = None
    topic_connectivity: Optional[dict] = None
    null_fields: Optional[dict] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class LaunchTemplateOut(BaseModel):
    template_id: UUID
    name: str
    pipeline_type: str
    robot_id: Optional[str]
    file_id: Optional[UUID]
    node_list: list
    topic_connectivity: Optional[dict]
    null_fields: Optional[dict]
    status: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/launch-templates", response_model=LaunchTemplateOut, status_code=201)
async def create_launch_template(
    body: LaunchTemplateCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    entry = LaunchTemplate(
        name=body.name,
        pipeline_type=body.pipeline_type,
        robot_id=body.robot_id,
        file_id=body.file_id,
        node_list=body.node_list,
        topic_connectivity=body.topic_connectivity,
        null_fields=body.null_fields,
        status=body.status,
        notes=body.notes,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("launch_template_created", template_id=str(entry.template_id), name=body.name)
    return entry


@router.get("/launch-templates", response_model=list[LaunchTemplateOut])
async def list_launch_templates(
    robot_id: Optional[str] = Query(None),
    pipeline_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(LaunchTemplate).order_by(LaunchTemplate.created_at.desc())
    if robot_id is not None:
        stmt = stmt.where(LaunchTemplate.robot_id == robot_id)
    if pipeline_type is not None:
        stmt = stmt.where(LaunchTemplate.pipeline_type == pipeline_type)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/launch-templates/{template_id}", response_model=LaunchTemplateOut)
async def get_launch_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(LaunchTemplate).where(LaunchTemplate.template_id == template_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Launch template not found")
    return entry


@router.patch("/launch-templates/{template_id}", response_model=LaunchTemplateOut)
async def update_launch_template(
    template_id: UUID,
    body: LaunchTemplateUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(LaunchTemplate).where(LaunchTemplate.template_id == template_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Launch template not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(entry, field, value)

    await session.flush()
    await session.refresh(entry)
    logger.info("launch_template_updated", template_id=str(template_id))
    return entry


@router.delete("/launch-templates/{template_id}", status_code=204)
async def delete_launch_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(LaunchTemplate).where(LaunchTemplate.template_id == template_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Launch template not found")

    await session.delete(entry)
    await session.flush()
    logger.info("launch_template_deleted", template_id=str(template_id))


# =============================================================================
# Config Sharing via S3
# =============================================================================


class ShareOut(BaseModel):
    file_id: UUID
    s3_key: str
    download_url: str


class SharedConfigOut(BaseModel):
    key: str
    size: int
    last_modified: str


@router.post("/files/{file_id}/share", response_model=ShareOut)
async def share_config(
    file_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Upload a promoted config to S3 for sharing."""
    from services.cloud_storage import get_cloud_storage
    import asyncio

    result = await session.execute(
        select(FileRegistry).where(FileRegistry.file_id == file_id)
    )
    file_entry = result.scalar_one_or_none()
    if not file_entry:
        raise HTTPException(status_code=404, detail="File not found")
    if file_entry.status != "promoted":
        raise HTTPException(status_code=409, detail="Only promoted files can be shared")

    storage = get_cloud_storage()
    s3_key = f"shared/configs/{file_entry.file_type}/{file_entry.file_hash}"

    ok = await asyncio.to_thread(
        storage.upload_file, file_entry.file_path, s3_key, "application/octet-stream"
    )
    if not ok:
        raise HTTPException(status_code=502, detail="S3 upload failed")

    url = storage.presign_download(s3_key)
    logger.info("config_shared", file_id=str(file_id), s3_key=s3_key)
    return ShareOut(file_id=file_id, s3_key=s3_key, download_url=url)


@router.get("/shared", response_model=list[SharedConfigOut])
async def list_shared_configs():
    """List shared configs from S3."""
    from services.cloud_storage import get_cloud_storage

    storage = get_cloud_storage()
    return storage.list_objects(prefix="shared/configs/")


@router.post("/import/{key:path}", status_code=501)
async def import_shared_config(key: str):
    """Import a shared config from S3 to local registry. (Not yet implemented.)"""
    raise HTTPException(status_code=501, detail="Import not yet implemented")
