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

from db.registry.models import FileRegistry, Robot, SceneRegistry
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


@router.patch("/files/{file_id}/status", response_model=FileOut)
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
