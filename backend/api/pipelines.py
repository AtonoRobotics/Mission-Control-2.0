"""
Mission Control API — Pipeline Routes
Physical AI Pipeline CRUD, run lifecycle.
Reuses workflow_graphs and workflow_runs DB tables.
"""

import copy
import uuid

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import SceneRegistry, WorkflowGraph, WorkflowRun
from db.session import get_registry_session
from services.pipeline_templates import get_template, list_templates, TEMPLATE_META

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class PipelineNode(BaseModel):
    id: str
    category: str = Field(..., description="asset | operation")
    type: str
    label: str
    config: dict = Field(default_factory=dict)
    position: NodePosition = Field(default_factory=NodePosition)


class PipelineEdge(BaseModel):
    id: str
    source: str
    target: str
    data_type: Optional[str] = None


class PipelineGraphJson(BaseModel):
    schema_version: str = "1.0.0"
    template: str = "custom"
    osmo_compatible: bool = True
    nodes: list[PipelineNode] = Field(default_factory=list)
    edges: list[PipelineEdge] = Field(default_factory=list)


class PipelineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    graph_json: PipelineGraphJson
    created_by: Optional[str] = None


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    graph_json: Optional[PipelineGraphJson] = None


class PipelineOut(BaseModel):
    graph_id: UUID
    name: str
    version: str
    description: Optional[str]
    graph_json: dict
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]

    model_config = {"from_attributes": True}


class PipelineRunCreate(BaseModel):
    """Start a pipeline run. Status defaults to pending."""
    pass


class PipelineRunUpdate(BaseModel):
    status: str = Field(..., description="paused | cancelled")


class PipelineRunOut(BaseModel):
    run_id: UUID
    graph_id: UUID
    graph_name: str
    status: str
    node_results: dict
    started_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# =============================================================================
# Pipeline CRUD Endpoints
# =============================================================================


@router.get("/", response_model=list[PipelineOut])
async def list_pipelines(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    """List all pipelines, ordered by updated_at descending."""
    stmt = (
        select(WorkflowGraph)
        .order_by(WorkflowGraph.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=PipelineOut, status_code=201)
async def create_pipeline(
    body: PipelineCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new pipeline."""
    graph = WorkflowGraph(
        name=body.name,
        version="1.0.0",
        description=body.description,
        graph_json=body.graph_json.model_dump(),
        created_by=body.created_by,
    )
    session.add(graph)
    await session.flush()
    await session.refresh(graph)
    logger.info("pipeline_created", graph_id=str(graph.graph_id), name=body.name)
    return graph


# =============================================================================
# Pipeline Template Endpoints (before {graph_id} to avoid route conflicts)
# =============================================================================


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    tags: list[str]
    node_count: int
    edge_count: int


class TemplateInstantiateBody(BaseModel):
    name: Optional[str] = None
    created_by: Optional[str] = None


@router.get("/templates", response_model=list[TemplateOut])
async def get_templates_endpoint():
    """List all available pipeline templates."""
    return list_templates()


@router.post("/templates/{template_id}/instantiate", response_model=PipelineOut, status_code=201)
async def instantiate_template(
    template_id: str,
    body: TemplateInstantiateBody = TemplateInstantiateBody(),
    session: AsyncSession = Depends(get_registry_session),
):
    """Clone a template into a new WorkflowGraph row."""
    tpl = get_template(template_id)
    if tpl is None:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_id}' not found. "
            f"Available: {list(TEMPLATE_META.keys())}",
        )

    meta = TEMPLATE_META[template_id]
    graph_name = body.name or f"{meta['name']} (from template)"
    graph_json = copy.deepcopy(tpl)

    graph = WorkflowGraph(
        name=graph_name,
        version="1.0.0",
        description=meta["description"],
        graph_json=graph_json,
        created_by=body.created_by,
    )
    session.add(graph)
    await session.flush()
    await session.refresh(graph)
    logger.info(
        "pipeline_instantiated_from_template",
        graph_id=str(graph.graph_id),
        template=template_id,
    )
    return graph


# =============================================================================
# AI Scene Generation (before parameterized {graph_id} routes)
# =============================================================================


class SceneGenerateRequest(BaseModel):
    prompt: str
    task_type: str  # manipulation, navigation, inspection, data_collection
    robot_id: str
    environment_style: Optional[str] = "grid"


class SceneGenerateResponse(BaseModel):
    name: str
    description: Optional[str] = None
    physics_dt: float = 1 / 60
    render_dt: float = 1 / 60
    gravity: list[float] = Field(default_factory=lambda: [0, 0, -9.81])
    num_envs: Optional[int] = None
    env_spacing: Optional[float] = None
    placements: list[dict]


class SceneJobOut(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    result: Optional[dict] = None
    error: Optional[str] = None


# In-memory job store (single-process backend, ephemeral jobs)
import asyncio
_scene_jobs: dict[str, dict] = {}


async def _run_scene_job(job_id: str, body: SceneGenerateRequest, robot_dict: dict):
    """Background task: call LLM and store result in job dict."""
    from core.settings import get_settings
    from services.llm_client import generate_scene_with_llm

    _scene_jobs[job_id]["status"] = "running"
    try:
        settings = get_settings()
        scene = await generate_scene_with_llm(
            prompt=body.prompt,
            task_type=body.task_type,
            environment_style=body.environment_style,
            robot_dict=robot_dict,
            settings=settings,
        )
        _scene_jobs[job_id]["status"] = "completed"
        _scene_jobs[job_id]["result"] = scene
    except HTTPException as exc:
        _scene_jobs[job_id]["status"] = "failed"
        _scene_jobs[job_id]["error"] = exc.detail
    except Exception as exc:
        _scene_jobs[job_id]["status"] = "failed"
        _scene_jobs[job_id]["error"] = str(exc)


@router.post("/scenes/generate", response_model=SceneJobOut, status_code=202)
async def generate_scene(
    body: SceneGenerateRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Start async scene generation — returns job_id immediately."""
    from db.registry.models import Robot

    result = await session.execute(
        select(Robot).where(Robot.robot_id == body.robot_id)
    )
    robot = result.scalar_one_or_none()

    robot_dict = {
        "robot_id": body.robot_id,
        "name": robot.name if robot else body.robot_id,
        "reach_mm": robot.reach_mm if robot else None,
        "dof": robot.dof if robot else None,
        "payload_kg": robot.payload_kg if robot else None,
    }

    job_id = str(uuid.uuid4())
    _scene_jobs[job_id] = {"status": "pending", "result": None, "error": None}
    asyncio.create_task(_run_scene_job(job_id, body, robot_dict))
    logger.info("scene_job_created", job_id=job_id)

    return SceneJobOut(job_id=job_id, status="pending")


@router.get("/scenes/generate/{job_id}", response_model=SceneJobOut)
async def poll_scene_job(job_id: str):
    """Poll for scene generation result."""
    job = _scene_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return SceneJobOut(job_id=job_id, **job)


# =============================================================================
# Scene Persistence CRUD
# =============================================================================


class SceneSaveRequest(BaseModel):
    name: str
    description: Optional[str] = None
    scene_json: dict


class SceneUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scene_json: Optional[dict] = None


class SceneListOut(BaseModel):
    scene_id: UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneDetailOut(BaseModel):
    scene_id: UUID
    name: str
    description: Optional[str]
    scene_json: Optional[dict]
    robot_ids: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.post("/scenes", response_model=SceneDetailOut, status_code=201)
async def save_scene(
    body: SceneSaveRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Save a new scene to the registry."""
    # Extract robot_ids from placements in scene_json
    robot_ids = []
    for p in body.scene_json.get("placements", []):
        if p.get("asset_type") == "robot" and p.get("asset_id"):
            robot_ids.append(p["asset_id"])

    scene = SceneRegistry(
        name=body.name,
        description=body.description,
        scene_json=body.scene_json,
        robot_ids=robot_ids,
    )
    session.add(scene)
    await session.flush()
    await session.refresh(scene)
    logger.info("scene_saved", scene_id=str(scene.scene_id), name=body.name)
    return scene


@router.get("/scenes", response_model=list[SceneListOut])
async def list_scenes(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    """List saved scenes (summaries, no scene_json)."""
    stmt = (
        select(SceneRegistry)
        .order_by(SceneRegistry.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/scenes/{scene_id}", response_model=SceneDetailOut)
async def get_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a saved scene with full scene_json."""
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene


@router.patch("/scenes/{scene_id}", response_model=SceneDetailOut)
async def update_scene(
    scene_id: UUID,
    body: SceneUpdateRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Update a saved scene's name, description, or scene_json."""
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if body.name is not None:
        scene.name = body.name
    if body.description is not None:
        scene.description = body.description
    if body.scene_json is not None:
        scene.scene_json = body.scene_json
        # Re-extract robot_ids from updated placements
        robot_ids = []
        for p in body.scene_json.get("placements", []):
            if p.get("asset_type") == "robot" and p.get("asset_id"):
                robot_ids.append(p["asset_id"])
        scene.robot_ids = robot_ids
    scene.updated_at = func.now()

    await session.flush()
    await session.refresh(scene)
    logger.info("scene_updated", scene_id=str(scene_id))
    return scene


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete a saved scene."""
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
# Pipeline Detail Endpoints (parameterized routes after static ones)
# =============================================================================


@router.get("/{graph_id}", response_model=PipelineOut)
async def get_pipeline(
    graph_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a single pipeline by ID."""
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return graph


@router.put("/{graph_id}", response_model=PipelineOut)
async def update_pipeline(
    graph_id: UUID,
    body: PipelineUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Update pipeline name, description, or graph_json."""
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if body.name is not None:
        graph.name = body.name
    if body.description is not None:
        graph.description = body.description
    if body.graph_json is not None:
        graph.graph_json = body.graph_json.model_dump()
    graph.updated_at = func.now()

    await session.flush()
    await session.refresh(graph)
    logger.info("pipeline_updated", graph_id=str(graph_id))
    return graph


@router.delete("/{graph_id}", status_code=204)
async def delete_pipeline(
    graph_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete a pipeline and its associated runs."""
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Delete associated runs first
    runs_result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.graph_id == graph_id)
    )
    for run in runs_result.scalars().all():
        await session.delete(run)

    await session.delete(graph)
    await session.flush()
    logger.info("pipeline_deleted", graph_id=str(graph_id))


# =============================================================================
# Pipeline Run Endpoints
# =============================================================================


@router.post("/{graph_id}/run", response_model=PipelineRunOut, status_code=201)
async def start_pipeline_run(
    graph_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Start a new pipeline run with status=pending."""
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    run = WorkflowRun(
        graph_id=graph_id,
        graph_name=graph.name,
        status="pending",
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)
    logger.info("pipeline_run_started", run_id=str(run.run_id), graph_id=str(graph_id))
    return run


@router.get("/{graph_id}/runs", response_model=list[PipelineRunOut])
async def list_pipeline_runs(
    graph_id: UUID,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    """List all runs for a pipeline, newest first."""
    # Verify pipeline exists
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pipeline not found")

    stmt = (
        select(WorkflowRun)
        .where(WorkflowRun.graph_id == graph_id)
        .order_by(WorkflowRun.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=PipelineRunOut)
async def get_pipeline_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a single pipeline run by ID."""
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return run


ALLOWED_RUN_TRANSITIONS: dict[str, list[str]] = {
    "pending": ["running", "cancelled"],
    "running": ["paused", "completed", "failed", "cancelled"],
    "paused": ["running", "cancelled"],
    "completed": [],
    "failed": [],
    "cancelled": [],
}


@router.patch("/runs/{run_id}", response_model=PipelineRunOut)
async def update_pipeline_run(
    run_id: UUID,
    body: PipelineRunUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Pause or cancel a pipeline run."""
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")

    allowed = ALLOWED_RUN_TRANSITIONS.get(run.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition from '{run.status}' to '{body.status}'. "
            f"Allowed: {allowed}",
        )

    run.status = body.status
    if body.status in ("completed", "failed", "cancelled"):
        run.completed_at = func.now()

    await session.flush()
    await session.refresh(run)
    logger.info("pipeline_run_updated", run_id=str(run_id), status=run.status)
    return run


