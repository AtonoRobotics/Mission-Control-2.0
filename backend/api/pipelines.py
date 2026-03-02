"""
Mission Control API — Pipeline Routes
Physical AI Pipeline CRUD, run lifecycle.
Reuses workflow_graphs and workflow_runs DB tables.
"""

import uuid

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

import copy

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import WorkflowGraph, WorkflowRun
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


@router.post("/scenes/generate", response_model=SceneGenerateResponse)
async def generate_scene(
    body: SceneGenerateRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """AI scene generation — dispatches to simulate agent.
    For now, returns a template-based scene layout.
    """
    from db.registry.models import Robot
    result = await session.execute(
        select(Robot).where(Robot.robot_id == body.robot_id)
    )
    robot = result.scalar_one_or_none()
    reach_m = (robot.reach_mm / 1000) if robot and robot.reach_mm else 1.0

    placements = []

    # Always add the robot at origin
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": body.robot_id,
        "asset_source": "registry",
        "asset_type": "robot",
        "label": robot.name if robot else body.robot_id,
        "position": {"x": 0, "y": 0, "z": 0},
        "rotation": {"x": 0, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": True,
        "is_global": False,
        "properties": {},
    })

    if body.task_type == "manipulation":
        placements.append({
            "id": str(uuid.uuid4()),
            "asset_id": "nvidia_table",
            "asset_source": "nvidia",
            "asset_type": "object",
            "label": "Table",
            "position": {"x": reach_m * 0.5, "y": 0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
            "physics_enabled": False,
            "is_global": False,
            "properties": {},
        })
        obj_names = ["Box", "Mug", "Banana"]
        for i, name in enumerate(obj_names):
            placements.append({
                "id": str(uuid.uuid4()),
                "asset_id": f"nvidia_{name.lower()}",
                "asset_source": "nvidia",
                "asset_type": "object",
                "label": name,
                "position": {
                    "x": reach_m * 0.4 + 0.1 * (i - 1),
                    "y": 0.15 * (i - 1),
                    "z": 0.75,
                },
                "rotation": {"x": 0, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "physics_enabled": True,
                "is_global": False,
                "properties": {},
            })
    elif body.task_type == "navigation":
        for i in range(5):
            placements.append({
                "id": str(uuid.uuid4()),
                "asset_id": "nvidia_cardbox_a",
                "asset_source": "nvidia",
                "asset_type": "object",
                "label": f"Obstacle {i+1}",
                "position": {
                    "x": (i % 3 - 1) * 2.0,
                    "y": (i // 3 - 1) * 2.0,
                    "z": 0,
                },
                "rotation": {"x": 0, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "physics_enabled": False,
                "is_global": False,
                "properties": {},
            })

    # Add overhead camera
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": "nvidia_camera",
        "asset_source": "nvidia",
        "asset_type": "sensor",
        "label": "Overhead Camera",
        "position": {"x": 0, "y": 0, "z": 2.0},
        "rotation": {"x": -90, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": False,
        "is_global": True,
        "properties": {"resolution": [640, 480], "fov": 60},
    })

    # Add dome light
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": "nvidia_dome_light",
        "asset_source": "nvidia",
        "asset_type": "light",
        "label": "Dome Light",
        "position": {"x": 0, "y": 0, "z": 3.0},
        "rotation": {"x": 0, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": False,
        "is_global": True,
        "properties": {"intensity": 3000},
    })

    scene_name = f"{body.task_type.replace('_', ' ').title()} Scene"
    return SceneGenerateResponse(
        name=scene_name,
        description=f"Auto-generated {body.task_type} scene for {body.robot_id}. {body.prompt}",
        placements=placements,
        num_envs=32 if body.task_type in ("manipulation", "navigation") else None,
        env_spacing=2.5 if body.task_type in ("manipulation", "navigation") else None,
    )


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


