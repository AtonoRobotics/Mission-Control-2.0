# Physical AI Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Workflows page with a visual Physical AI Pipeline editor using a bipartite DAG (asset + operation nodes) on a React Flow canvas, with OSMO-compatible schema and MCP agent execution.

**Architecture:** Reuse existing `workflow_graphs` and `workflow_runs` DB tables with structured `graph_json` and `node_results` JSONB columns. React Flow v11 canvas with custom node components, Zustand store for pipeline state, FastAPI backend for CRUD + run management. Pipeline execution dispatches to MCP agents (simulate, groot, cosmos, develop, sysadmin).

**Tech Stack:** React 18 + TypeScript + Vite 5 + React Flow 11 + Zustand 5 + Monaco Editor + FastAPI + SQLAlchemy 2.0 + PostgreSQL

**Design doc:** `docs/plans/2026-03-02-physical-ai-pipeline-design.md`

---

## Task 1: Backend — Pipeline CRUD Endpoints

**Files:**
- Create: `backend/api/pipelines.py`
- Modify: `backend/main.py:100-108` (add router include)

**Step 1: Create the pipeline router with schemas**

Create `backend/api/pipelines.py`:

```python
"""
Mission Control API — Pipeline Routes
CRUD for pipeline definitions (stored as workflow_graphs)
and pipeline runs (stored as workflow_runs).
"""

import hashlib
from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import WorkflowGraph, WorkflowRun
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class PipelineNodeConfig(BaseModel):
    """Config blob for a pipeline node — varies by node type."""
    model_config = {"extra": "allow"}


class PipelineNode(BaseModel):
    id: str
    category: str  # "asset" | "operation"
    type: str      # e.g. "robot_usd", "usd_compose"
    label: str
    config: dict = Field(default_factory=dict)
    position: dict = Field(default_factory=lambda: {"x": 0, "y": 0})


class PipelineEdge(BaseModel):
    id: str
    source: str
    target: str
    data_type: str = ""


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
    pass  # No body needed — just POST to start


class PipelineRunOut(BaseModel):
    run_id: UUID
    graph_id: UUID
    graph_name: str
    status: str
    node_results: dict
    started_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PipelineRunUpdate(BaseModel):
    status: str  # "paused" | "cancelled"


# =============================================================================
# Pipeline Definition Endpoints
# =============================================================================


@router.get("", response_model=list[PipelineOut])
async def list_pipelines(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    """List all pipeline definitions."""
    stmt = (
        select(WorkflowGraph)
        .order_by(WorkflowGraph.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PipelineOut, status_code=201)
async def create_pipeline(
    body: PipelineCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new pipeline definition."""
    graph = WorkflowGraph(
        name=body.name,
        description=body.description,
        graph_json=body.graph_json.model_dump(),
        created_by=body.created_by,
    )
    session.add(graph)
    await session.flush()
    await session.refresh(graph)
    logger.info("pipeline_created", graph_id=str(graph.graph_id), name=body.name)
    return graph


@router.get("/{graph_id}", response_model=PipelineOut)
async def get_pipeline(
    graph_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a pipeline definition."""
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
    """Update a pipeline definition (name, description, or DAG)."""
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
    """Delete a pipeline definition."""
    result = await session.execute(
        select(WorkflowGraph).where(WorkflowGraph.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Pipeline not found")
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
    """Start a new pipeline run."""
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
        node_results={},
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)
    logger.info("pipeline_run_created", run_id=str(run.run_id), graph_id=str(graph_id))
    return run


@router.get("/{graph_id}/runs", response_model=list[PipelineRunOut])
async def list_pipeline_runs(
    graph_id: UUID,
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_registry_session),
):
    """List runs for a pipeline."""
    stmt = (
        select(WorkflowRun)
        .where(WorkflowRun.graph_id == graph_id)
        .order_by(WorkflowRun.started_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=PipelineRunOut)
async def get_pipeline_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get pipeline run status and per-node results."""
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return run


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

    if body.status not in ("paused", "cancelled"):
        raise HTTPException(status_code=400, detail="Can only pause or cancel a run")

    run.status = body.status
    if body.status == "cancelled":
        run.completed_at = func.now()
    await session.flush()
    await session.refresh(run)
    logger.info("pipeline_run_updated", run_id=str(run_id), status=body.status)
    return run
```

**Step 2: Register the router in main.py**

In `backend/main.py`, add after the existing router imports (~line 22):
```python
from api import pipelines
```

Add after the existing `include_router` calls (~line 108):
```python
app.include_router(pipelines.router, prefix="/api/pipelines", tags=["Pipelines"])
```

**Step 3: Verify syntax**

Run: `cd backend && python -c "import ast; ast.parse(open('api/pipelines.py').read()); print('OK')"`
Expected: `OK`

**Step 4: Restart backend and test**

Run: `kill $(pgrep -f 'uvicorn main:app.*8000') && cd backend && nohup uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/mc-backend.log 2>&1 &`

Run: `curl -s http://127.0.0.1:8000/api/pipelines | python -m json.tool`
Expected: `[]`

**Step 5: Commit**

```bash
git add backend/api/pipelines.py backend/main.py
git commit -m "feat: add pipeline CRUD and run management API endpoints"
```

---

## Task 2: Backend — Pipeline Templates

**Files:**
- Create: `backend/services/pipeline_templates.py`
- Modify: `backend/api/pipelines.py` (add template endpoints)

**Step 1: Create template definitions**

Create `backend/services/pipeline_templates.py`:

```python
"""
Pre-built pipeline templates for common NVIDIA Physical AI workflows.
Each template is a graph_json dict ready to be cloned into a new pipeline.
"""

TEMPLATES: dict[str, dict] = {
    "groot_manipulation": {
        "schema_version": "1.0.0",
        "template": "groot_manipulation",
        "osmo_compatible": True,
        "nodes": [
            {"id": "a1", "category": "asset", "type": "robot_usd", "label": "Robot USD", "config": {}, "position": {"x": 50, "y": 200}},
            {"id": "a2", "category": "asset", "type": "environment_usd", "label": "Environment USD", "config": {}, "position": {"x": 50, "y": 350}},
            {"id": "o1", "category": "operation", "type": "usd_compose", "label": "Compose Scene", "config": {}, "position": {"x": 300, "y": 275}},
            {"id": "a3", "category": "asset", "type": "scene_usd", "label": "Scene USD", "config": {}, "position": {"x": 550, "y": 275}},
            {"id": "o2", "category": "operation", "type": "demo_record", "label": "Record Demos", "config": {"format": "lerobot", "target_count": 100}, "position": {"x": 800, "y": 200}},
            {"id": "a4", "category": "asset", "type": "demo_dataset", "label": "Demo Dataset", "config": {}, "position": {"x": 1050, "y": 200}},
            {"id": "o3", "category": "operation", "type": "groot_mimic", "label": "GR00T-Mimic", "config": {"augmentation_factor": 100}, "position": {"x": 1300, "y": 200}},
            {"id": "a5", "category": "asset", "type": "synth_dataset", "label": "Augmented Data", "config": {}, "position": {"x": 1550, "y": 200}},
            {"id": "o4", "category": "operation", "type": "cosmos_transfer", "label": "Cosmos Transfer", "config": {"model_size": "2B"}, "position": {"x": 1550, "y": 400}},
            {"id": "a6", "category": "asset", "type": "synth_dataset", "label": "Photorealistic Data", "config": {}, "position": {"x": 1800, "y": 400}},
            {"id": "a7", "category": "asset", "type": "pretrained_model", "label": "GR00T N1.6 Base", "config": {"source": "nvidia/GR00T-N1.6-3B"}, "position": {"x": 1550, "y": 550}},
            {"id": "o5", "category": "operation", "type": "groot_finetune", "label": "GR00T Fine-tune", "config": {"epochs": 50, "batch_size": 32}, "position": {"x": 2050, "y": 350}},
            {"id": "a8", "category": "asset", "type": "checkpoint", "label": "Trained Checkpoint", "config": {}, "position": {"x": 2300, "y": 350}},
            {"id": "o6", "category": "operation", "type": "arena_eval", "label": "Arena Eval", "config": {"success_threshold": 0.85}, "position": {"x": 2550, "y": 350}},
            {"id": "a9", "category": "asset", "type": "eval_report", "label": "Eval Report", "config": {}, "position": {"x": 2800, "y": 350}},
            {"id": "o7", "category": "operation", "type": "deploy", "label": "Deploy", "config": {}, "position": {"x": 3050, "y": 350}},
            {"id": "a10", "category": "asset", "type": "deployment_pkg", "label": "Deployment", "config": {}, "position": {"x": 3300, "y": 350}},
        ],
        "edges": [
            {"id": "e1", "source": "a1", "target": "o1", "data_type": "usd"},
            {"id": "e2", "source": "a2", "target": "o1", "data_type": "usd"},
            {"id": "e3", "source": "o1", "target": "a3", "data_type": "usd"},
            {"id": "e4", "source": "a3", "target": "o2", "data_type": "usd"},
            {"id": "e5", "source": "o2", "target": "a4", "data_type": "dataset"},
            {"id": "e6", "source": "a4", "target": "o3", "data_type": "dataset"},
            {"id": "e7", "source": "o3", "target": "a5", "data_type": "dataset"},
            {"id": "e8", "source": "a5", "target": "o4", "data_type": "dataset"},
            {"id": "e9", "source": "o4", "target": "a6", "data_type": "dataset"},
            {"id": "e10", "source": "a6", "target": "o5", "data_type": "dataset"},
            {"id": "e11", "source": "a7", "target": "o5", "data_type": "model"},
            {"id": "e12", "source": "o5", "target": "a8", "data_type": "checkpoint"},
            {"id": "e13", "source": "a8", "target": "o6", "data_type": "checkpoint"},
            {"id": "e14", "source": "o6", "target": "a9", "data_type": "report"},
            {"id": "e15", "source": "a8", "target": "o7", "data_type": "checkpoint"},
            {"id": "e16", "source": "o7", "target": "a10", "data_type": "deployment"},
        ],
    },
    "rl_locomotion": {
        "schema_version": "1.0.0",
        "template": "rl_locomotion",
        "osmo_compatible": True,
        "nodes": [
            {"id": "a1", "category": "asset", "type": "robot_usd", "label": "Robot USD", "config": {}, "position": {"x": 50, "y": 250}},
            {"id": "a2", "category": "asset", "type": "environment_usd", "label": "Terrain USD", "config": {}, "position": {"x": 50, "y": 400}},
            {"id": "o1", "category": "operation", "type": "usd_compose", "label": "Compose Scene", "config": {}, "position": {"x": 300, "y": 325}},
            {"id": "a3", "category": "asset", "type": "scene_usd", "label": "Scene USD", "config": {}, "position": {"x": 550, "y": 325}},
            {"id": "o2", "category": "operation", "type": "isaac_lab_rl", "label": "Isaac Lab RL", "config": {"algorithm": "rsl_rl", "num_envs": 4096, "max_iterations": 5000}, "position": {"x": 800, "y": 325}},
            {"id": "a4", "category": "asset", "type": "checkpoint", "label": "RL Checkpoint", "config": {}, "position": {"x": 1050, "y": 325}},
            {"id": "o3", "category": "operation", "type": "arena_eval", "label": "Evaluate", "config": {"success_threshold": 0.90}, "position": {"x": 1300, "y": 325}},
            {"id": "a5", "category": "asset", "type": "eval_report", "label": "Report", "config": {}, "position": {"x": 1550, "y": 250}},
            {"id": "o4", "category": "operation", "type": "deploy", "label": "Deploy", "config": {}, "position": {"x": 1550, "y": 400}},
            {"id": "a6", "category": "asset", "type": "deployment_pkg", "label": "Deployment", "config": {}, "position": {"x": 1800, "y": 400}},
        ],
        "edges": [
            {"id": "e1", "source": "a1", "target": "o1", "data_type": "usd"},
            {"id": "e2", "source": "a2", "target": "o1", "data_type": "usd"},
            {"id": "e3", "source": "o1", "target": "a3", "data_type": "usd"},
            {"id": "e4", "source": "a3", "target": "o2", "data_type": "usd"},
            {"id": "e5", "source": "o2", "target": "a4", "data_type": "checkpoint"},
            {"id": "e6", "source": "a4", "target": "o3", "data_type": "checkpoint"},
            {"id": "e7", "source": "o3", "target": "a5", "data_type": "report"},
            {"id": "e8", "source": "a4", "target": "o4", "data_type": "checkpoint"},
            {"id": "e9", "source": "o4", "target": "a6", "data_type": "deployment"},
        ],
    },
    "sim2real_transfer": {
        "schema_version": "1.0.0",
        "template": "sim2real_transfer",
        "osmo_compatible": True,
        "nodes": [
            {"id": "a1", "category": "asset", "type": "robot_usd", "label": "Robot USD", "config": {}, "position": {"x": 50, "y": 250}},
            {"id": "a2", "category": "asset", "type": "environment_usd", "label": "Environment USD", "config": {}, "position": {"x": 50, "y": 400}},
            {"id": "o1", "category": "operation", "type": "usd_compose", "label": "Compose Scene", "config": {}, "position": {"x": 300, "y": 325}},
            {"id": "a3", "category": "asset", "type": "scene_usd", "label": "Scene USD", "config": {}, "position": {"x": 550, "y": 325}},
            {"id": "o2", "category": "operation", "type": "demo_record", "label": "Collect Sim Data", "config": {"format": "lerobot"}, "position": {"x": 800, "y": 325}},
            {"id": "a4", "category": "asset", "type": "demo_dataset", "label": "Sim Dataset", "config": {}, "position": {"x": 1050, "y": 325}},
            {"id": "o3", "category": "operation", "type": "cosmos_transfer", "label": "Cosmos Transfer", "config": {"model_size": "14B"}, "position": {"x": 1300, "y": 325}},
            {"id": "a5", "category": "asset", "type": "synth_dataset", "label": "Real-Style Data", "config": {}, "position": {"x": 1550, "y": 325}},
            {"id": "a6", "category": "asset", "type": "pretrained_model", "label": "Base Model", "config": {}, "position": {"x": 1550, "y": 500}},
            {"id": "o4", "category": "operation", "type": "groot_finetune", "label": "Fine-tune", "config": {}, "position": {"x": 1800, "y": 400}},
            {"id": "a7", "category": "asset", "type": "checkpoint", "label": "Checkpoint", "config": {}, "position": {"x": 2050, "y": 400}},
            {"id": "o5", "category": "operation", "type": "arena_eval", "label": "Evaluate", "config": {}, "position": {"x": 2300, "y": 400}},
            {"id": "a8", "category": "asset", "type": "eval_report", "label": "Report", "config": {}, "position": {"x": 2550, "y": 400}},
        ],
        "edges": [
            {"id": "e1", "source": "a1", "target": "o1", "data_type": "usd"},
            {"id": "e2", "source": "a2", "target": "o1", "data_type": "usd"},
            {"id": "e3", "source": "o1", "target": "a3", "data_type": "usd"},
            {"id": "e4", "source": "a3", "target": "o2", "data_type": "usd"},
            {"id": "e5", "source": "o2", "target": "a4", "data_type": "dataset"},
            {"id": "e6", "source": "a4", "target": "o3", "data_type": "dataset"},
            {"id": "e7", "source": "o3", "target": "a5", "data_type": "dataset"},
            {"id": "e8", "source": "a5", "target": "o4", "data_type": "dataset"},
            {"id": "e9", "source": "a6", "target": "o4", "data_type": "model"},
            {"id": "e10", "source": "o4", "target": "a7", "data_type": "checkpoint"},
            {"id": "e11", "source": "a7", "target": "o5", "data_type": "checkpoint"},
            {"id": "e12", "source": "o5", "target": "a8", "data_type": "report"},
        ],
    },
    "cinema_motion": {
        "schema_version": "1.0.0",
        "template": "cinema_motion",
        "osmo_compatible": True,
        "nodes": [
            {"id": "a1", "category": "asset", "type": "robot_urdf", "label": "CR10 URDF", "config": {}, "position": {"x": 50, "y": 200}},
            {"id": "a2", "category": "asset", "type": "curobo_config", "label": "cuRobo Config", "config": {}, "position": {"x": 50, "y": 350}},
            {"id": "a3", "category": "asset", "type": "demo_dataset", "label": "Camera Trajectory", "config": {}, "position": {"x": 50, "y": 500}},
            {"id": "o1", "category": "operation", "type": "curobo_validate", "label": "cuRobo Validate", "config": {"check_singularity": True, "check_jerk": True}, "position": {"x": 400, "y": 350}},
            {"id": "a4", "category": "asset", "type": "eval_report", "label": "Validation Report", "config": {}, "position": {"x": 700, "y": 350}},
            {"id": "o2", "category": "operation", "type": "deploy", "label": "Deploy to CR10", "config": {"target": "192.168.5.1"}, "position": {"x": 950, "y": 350}},
            {"id": "a5", "category": "asset", "type": "deployment_pkg", "label": "Motion Package", "config": {}, "position": {"x": 1200, "y": 350}},
        ],
        "edges": [
            {"id": "e1", "source": "a1", "target": "o1", "data_type": "urdf"},
            {"id": "e2", "source": "a2", "target": "o1", "data_type": "config"},
            {"id": "e3", "source": "a3", "target": "o1", "data_type": "trajectory"},
            {"id": "e4", "source": "o1", "target": "a4", "data_type": "report"},
            {"id": "e5", "source": "a4", "target": "o2", "data_type": "report"},
            {"id": "e6", "source": "o2", "target": "a5", "data_type": "deployment"},
        ],
    },
}


TEMPLATE_META: dict[str, dict] = {
    "groot_manipulation": {
        "name": "GR00T Manipulation",
        "description": "Full VLA pipeline: demos → GR00T-Mimic → Cosmos Transfer → GR00T N1.6 fine-tune → Arena eval → deploy",
        "tags": ["gr00t", "cosmos", "manipulation"],
    },
    "rl_locomotion": {
        "name": "RL Locomotion",
        "description": "Massively parallel RL training in Isaac Lab for legged robot locomotion",
        "tags": ["isaac-lab", "rl", "locomotion"],
    },
    "sim2real_transfer": {
        "name": "Sim2Real Transfer",
        "description": "Bridge sim-to-real gap with Cosmos Transfer photorealistic augmentation",
        "tags": ["cosmos", "sim2real"],
    },
    "cinema_motion": {
        "name": "Cinema Motion",
        "description": "Validate camera trajectories through cuRobo for joint limits, singularity, and jerk",
        "tags": ["curobo", "cinema", "cr10"],
    },
}


def get_template(template_id: str) -> dict | None:
    return TEMPLATES.get(template_id)


def list_templates() -> list[dict]:
    result = []
    for tid, meta in TEMPLATE_META.items():
        result.append({
            "id": tid,
            "name": meta["name"],
            "description": meta["description"],
            "tags": meta["tags"],
            "node_count": len(TEMPLATES[tid]["nodes"]),
            "edge_count": len(TEMPLATES[tid]["edges"]),
        })
    return result
```

**Step 2: Add template endpoints to pipelines.py**

Append to `backend/api/pipelines.py`:

```python
from services.pipeline_templates import get_template, list_templates

# =============================================================================
# Template Endpoints
# =============================================================================


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    tags: list[str]
    node_count: int
    edge_count: int


@router.get("/templates", response_model=list[TemplateOut])
async def list_pipeline_templates():
    """List available pipeline templates."""
    return list_templates()


@router.post("/templates/{template_id}/instantiate", response_model=PipelineOut, status_code=201)
async def instantiate_template(
    template_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new pipeline from a template."""
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    from services.pipeline_templates import TEMPLATE_META
    meta = TEMPLATE_META[template_id]

    graph = WorkflowGraph(
        name=meta["name"],
        description=meta["description"],
        graph_json=template,
    )
    session.add(graph)
    await session.flush()
    await session.refresh(graph)
    logger.info("pipeline_from_template", graph_id=str(graph.graph_id), template=template_id)
    return graph
```

**Step 3: Verify and commit**

Run: `cd backend && python -c "import ast; ast.parse(open('services/pipeline_templates.py').read()); print('OK')"`

```bash
git add backend/services/pipeline_templates.py backend/api/pipelines.py
git commit -m "feat: add pipeline templates (GR00T, RL, Sim2Real, Cinema)"
```

---

## Task 3: Frontend — Navigation Updates (Workflows → Pipelines)

**Files:**
- Modify: `frontend/src/stores/navStore.ts` (PageId type)
- Modify: `frontend/src/components/Sidebar.tsx` (menu entry)
- Modify: `frontend/src/App.tsx` (route mapping)

**Step 1: Update PageId type in navStore**

In `frontend/src/stores/navStore.ts`, replace `'workflows'` with `'pipelines'` in the `PageId` union type.

**Step 2: Update sidebar entry**

In `frontend/src/components/Sidebar.tsx`, in the `NAV_SECTIONS` array under the "Management" section, replace:
```tsx
{ id: 'workflows', label: 'Workflows', icon: '⟐' },
```
with:
```tsx
{ id: 'pipelines', label: 'Pipelines', icon: '⟐' },
```

**Step 3: Update App.tsx routing**

In `frontend/src/App.tsx`:
- Replace the WorkflowsPage import with PipelinesPage
- In `PAGE_COMPONENTS`, replace `workflows: WorkflowsPage` with `pipelines: PipelinesPage`

Note: PipelinesPage.tsx will be created in Task 5. For now, create a placeholder:

```tsx
// frontend/src/pages/PipelinesPage.tsx
export default function PipelinesPage() {
  return (
    <div style={{ padding: '20px 24px', color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Pipelines</h1>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        Physical AI pipeline editor — coming soon
      </p>
    </div>
  );
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/stores/navStore.ts frontend/src/components/Sidebar.tsx \
        frontend/src/App.tsx frontend/src/pages/PipelinesPage.tsx
git commit -m "feat: replace Workflows with Pipelines in navigation"
```

---

## Task 4: Frontend — Pipeline Zustand Store

**Files:**
- Create: `frontend/src/stores/pipelineStore.ts`

**Step 1: Create the store**

```typescript
import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface PipelineNode {
  id: string;
  category: 'asset' | 'operation';
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  data_type: string;
}

export interface PipelineGraphJson {
  schema_version: string;
  template: string;
  osmo_compatible: boolean;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface Pipeline {
  graph_id: string;
  name: string;
  version: string;
  description: string | null;
  graph_json: PipelineGraphJson;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface PipelineRun {
  run_id: string;
  graph_id: string;
  graph_name: string;
  status: string;
  node_results: Record<string, NodeResult>;
  started_at: string;
  completed_at: string | null;
}

export interface NodeResult {
  status: 'pending' | 'running' | 'complete' | 'failed';
  started_at?: string;
  completed_at?: string;
  progress?: number;
  output_artifact_id?: string;
  agent_log_id?: string;
  logs?: string[];
  metrics?: Record<string, number>;
  error?: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  node_count: number;
  edge_count: number;
}

// =============================================================================
// Store
// =============================================================================

interface PipelineState {
  // Pipeline list
  pipelines: Pipeline[];
  pipelinesLoading: boolean;

  // Active pipeline (editor)
  activePipeline: Pipeline | null;
  activePipelineLoading: boolean;

  // Runs for active pipeline
  runs: PipelineRun[];
  runsLoading: boolean;
  activeRun: PipelineRun | null;

  // Templates
  templates: PipelineTemplate[];
  templatesLoading: boolean;

  // Detail drawer
  selectedNodeId: string | null;

  // Actions
  fetchPipelines: () => Promise<void>;
  fetchPipeline: (graphId: string) => Promise<void>;
  createPipeline: (name: string, description?: string) => Promise<Pipeline | null>;
  updatePipeline: (graphId: string, data: { name?: string; description?: string; graph_json?: PipelineGraphJson }) => Promise<void>;
  deletePipeline: (graphId: string) => Promise<void>;

  fetchTemplates: () => Promise<void>;
  instantiateTemplate: (templateId: string) => Promise<Pipeline | null>;

  fetchRuns: (graphId: string) => Promise<void>;
  startRun: (graphId: string) => Promise<PipelineRun | null>;
  fetchRun: (runId: string) => Promise<void>;

  selectNode: (nodeId: string | null) => void;
  clearActive: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelines: [],
  pipelinesLoading: false,
  activePipeline: null,
  activePipelineLoading: false,
  runs: [],
  runsLoading: false,
  activeRun: null,
  templates: [],
  templatesLoading: false,
  selectedNodeId: null,

  fetchPipelines: async () => {
    set({ pipelinesLoading: true });
    try {
      const res = await fetch('/mc/api/pipelines');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ pipelines: Array.isArray(data) ? data : [], pipelinesLoading: false });
    } catch {
      set({ pipelines: [], pipelinesLoading: false });
    }
  },

  fetchPipeline: async (graphId) => {
    set({ activePipelineLoading: true });
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ activePipeline: data, activePipelineLoading: false });
    } catch {
      set({ activePipeline: null, activePipelineLoading: false });
    }
  },

  createPipeline: async (name, description) => {
    try {
      const res = await fetch('/mc/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          graph_json: {
            schema_version: '1.0.0',
            template: 'custom',
            osmo_compatible: true,
            nodes: [],
            edges: [],
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pipeline = await res.json();
      await get().fetchPipelines();
      return pipeline;
    } catch {
      return null;
    }
  },

  updatePipeline: async (graphId, data) => {
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      set({ activePipeline: updated });
    } catch {
      // silent
    }
  },

  deletePipeline: async (graphId) => {
    try {
      await fetch(`/mc/api/pipelines/${graphId}`, { method: 'DELETE' });
      set((s) => ({
        pipelines: s.pipelines.filter((p) => p.graph_id !== graphId),
        activePipeline: s.activePipeline?.graph_id === graphId ? null : s.activePipeline,
      }));
    } catch {
      // silent
    }
  },

  fetchTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const res = await fetch('/mc/api/pipelines/templates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ templates: Array.isArray(data) ? data : [], templatesLoading: false });
    } catch {
      set({ templates: [], templatesLoading: false });
    }
  },

  instantiateTemplate: async (templateId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/templates/${templateId}/instantiate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pipeline = await res.json();
      await get().fetchPipelines();
      return pipeline;
    } catch {
      return null;
    }
  },

  fetchRuns: async (graphId) => {
    set({ runsLoading: true });
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}/runs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ runs: Array.isArray(data) ? data : [], runsLoading: false });
    } catch {
      set({ runs: [], runsLoading: false });
    }
  },

  startRun: async (graphId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const run = await res.json();
      set((s) => ({ runs: [run, ...s.runs], activeRun: run }));
      return run;
    } catch {
      return null;
    }
  },

  fetchRun: async (runId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/runs/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const run = await res.json();
      set({ activeRun: run });
    } catch {
      // silent
    }
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  clearActive: () => set({ activePipeline: null, runs: [], activeRun: null, selectedNodeId: null }),
}));
```

**Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/stores/pipelineStore.ts
git commit -m "feat: add pipeline Zustand store with CRUD and run management"
```

---

## Task 5: Frontend — Pipeline List View

**Files:**
- Modify: `frontend/src/pages/PipelinesPage.tsx` (replace placeholder)

**Step 1: Implement the pipeline list page**

Replace the placeholder PipelinesPage with the list view showing pipeline cards, "New Pipeline" button, and template gallery. This is the default view before opening a pipeline editor.

The component should:
- Fetch pipelines on mount via `usePipelineStore`
- Show a grid of pipeline cards (name, template, node count, last updated)
- "New Pipeline" button opens a template gallery modal
- Clicking a card sets `activePipeline` and switches to editor view (Task 6)
- Follow existing card pattern from WorkflowsPage (280px min-width grid)

**Step 2: Verify and commit**

```bash
git add frontend/src/pages/PipelinesPage.tsx
git commit -m "feat: implement pipeline list view with template gallery"
```

---

## Task 6: Frontend — Custom React Flow Nodes

**Files:**
- Create: `frontend/src/components/pipeline/AssetNode.tsx`
- Create: `frontend/src/components/pipeline/OperationNode.tsx`

**Step 1: Create asset node component**

Custom React Flow node with:
- Rounded rectangle shape, amber left border
- Label, type badge, version indicator
- Source and target handles (bottom/top)
- Status glow when part of a running pipeline

Register as custom `nodeTypes` in React Flow.

**Step 2: Create operation node component**

Custom React Flow node with:
- Hexagonal or chamfered rectangle shape, white border
- Label, operation type badge, status dot (pending/running/complete/failed)
- Multiple source and target handles for multi-input/output
- Progress bar overlay when running

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/AssetNode.tsx \
        frontend/src/components/pipeline/OperationNode.tsx
git commit -m "feat: add custom React Flow nodes for assets and operations"
```

---

## Task 7: Frontend — Pipeline Canvas (React Flow Editor)

**Files:**
- Create: `frontend/src/components/pipeline/PipelineCanvas.tsx`
- Create: `frontend/src/components/pipeline/NodePalette.tsx`

**Step 1: Create the node palette**

Left sidebar component with:
- Two sections: Assets and Operations
- Each entry is draggable (uses `onDragStart` with `dataTransfer`)
- Search/filter input at top
- Follow ActionGraphPanel's drag pattern (lines 179-214)

**Step 2: Create the pipeline canvas**

Main React Flow canvas component:
- Receives `graph_json` from the active pipeline
- Converts `PipelineNode[]` → React Flow `Node[]` with custom types
- Converts `PipelineEdge[]` → React Flow `Edge[]`
- Handles: `onNodesChange`, `onEdgesChange`, `onConnect`, `onDrop` (from palette)
- Connection validation: only allow Asset → Operation or Operation → Asset edges
- Includes `<Background>`, `<Controls>`, `<MiniMap>`
- Auto-saves graph changes back to the store/backend on debounced timer
- Custom edge styling (amber animated for active, grey default)

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/PipelineCanvas.tsx \
        frontend/src/components/pipeline/NodePalette.tsx
git commit -m "feat: add pipeline canvas with drag-and-drop node palette"
```

---

## Task 8: Frontend — Detail Drawer

**Files:**
- Create: `frontend/src/components/pipeline/DetailDrawer.tsx`

**Step 1: Create the detail drawer**

Right-side collapsible panel:
- Opens when `selectedNodeId` is set in the store
- **Asset nodes:** Shows type, linked file info, version selector (reuse file version history from Task 1), file content preview (read-only Monaco)
- **Operation nodes:** Typed config form (different fields per `op_type`), live log viewer (scrolling pre), metrics display (key-value pairs), "Run This Stage" button
- Close button in header

Config forms per operation type (start simple — text inputs with labels, can enhance later):
- `usd_compose`: physics_dt, render_dt
- `groot_finetune`: epochs, batch_size, learning_rate
- `isaac_lab_rl`: algorithm dropdown, num_envs, max_iterations
- `cosmos_transfer`: model_size dropdown (2B/14B)
- `arena_eval`: success_threshold
- `deploy`: target device

**Step 2: Commit**

```bash
git add frontend/src/components/pipeline/DetailDrawer.tsx
git commit -m "feat: add pipeline detail drawer with config forms and log viewer"
```

---

## Task 9: Frontend — Run Bar & YAML Editor

**Files:**
- Create: `frontend/src/components/pipeline/RunBar.tsx`
- Create: `frontend/src/components/pipeline/YamlEditor.tsx`

**Step 1: Create run bar**

Bottom fixed bar:
- Progress indicator (X/Y nodes complete)
- Elapsed time counter
- Status text (idle / running / complete / failed)
- Expandable section showing per-node status list

**Step 2: Create YAML editor**

Toggle component:
- Monaco editor in YAML language mode
- Reads from `graph_json`, serializes to YAML on display
- Parses YAML back to `graph_json` on edit
- Uses `js-yaml` for serialization (add to dependencies)
- Bidirectional: changes in YAML update the canvas nodes

**Step 3: Install js-yaml**

Run: `cd frontend && pnpm add js-yaml && pnpm add -D @types/js-yaml`

**Step 4: Commit**

```bash
git add frontend/src/components/pipeline/RunBar.tsx \
        frontend/src/components/pipeline/YamlEditor.tsx \
        frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: add pipeline run bar and bidirectional YAML editor"
```

---

## Task 10: Frontend — Assemble Pipeline Editor Page

**Files:**
- Modify: `frontend/src/pages/PipelinesPage.tsx`

**Step 1: Wire all components together**

Update PipelinesPage to have two modes:
1. **List mode** (default): Pipeline cards + template gallery (from Task 5)
2. **Editor mode** (when `activePipeline` is set): Full 3-panel layout:
   - NodePalette (left)
   - PipelineCanvas (center)
   - DetailDrawer (right)
   - RunBar (bottom)
   - Top bar with: back button, pipeline name, YAML toggle, Run button

Add top bar with:
- "← Pipelines" back button (clears active, returns to list)
- Pipeline name (editable inline)
- Template badge
- YAML/Visual toggle button
- Run button (calls `startRun`)

**Step 2: Verify full page renders**

Run: `cd frontend && npx tsc --noEmit`
Open browser, navigate to Pipelines, create from template, verify canvas renders.

**Step 3: Commit**

```bash
git add frontend/src/pages/PipelinesPage.tsx
git commit -m "feat: assemble pipeline editor page with all panels"
```

---

## Task 11: Integration — End-to-End Verification

**Step 1: Restart backend**

```bash
kill $(pgrep -f 'uvicorn main:app.*8000')
cd backend && nohup uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/mc-backend.log 2>&1 &
```

**Step 2: Verify backend endpoints**

```bash
# List templates
curl -s http://127.0.0.1:8000/api/pipelines/templates | python -m json.tool

# Create from template
curl -s -X POST http://127.0.0.1:8000/api/pipelines/templates/groot_manipulation/instantiate | python -m json.tool

# List pipelines
curl -s http://127.0.0.1:8000/api/pipelines | python -m json.tool
```

**Step 3: Verify frontend**

1. Open browser to Mission Control
2. Click "Pipelines" in sidebar
3. Click "New Pipeline" → select "GR00T Manipulation"
4. Verify DAG renders with 17 nodes and 16 edges
5. Click an asset node → detail drawer opens with file info
6. Click an operation node → config form appears
7. Toggle YAML view → see YAML representation
8. Drag a new node from palette → verify it connects

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Physical AI Pipeline editor — DAG canvas, templates, YAML sync"
```

---

## File Manifest Summary

| File | Action | Task |
|------|--------|------|
| `backend/api/pipelines.py` | Create | 1, 2 |
| `backend/main.py` | Modify | 1 |
| `backend/services/pipeline_templates.py` | Create | 2 |
| `frontend/src/stores/navStore.ts` | Modify | 3 |
| `frontend/src/components/Sidebar.tsx` | Modify | 3 |
| `frontend/src/App.tsx` | Modify | 3 |
| `frontend/src/stores/pipelineStore.ts` | Create | 4 |
| `frontend/src/pages/PipelinesPage.tsx` | Create | 5, 10 |
| `frontend/src/components/pipeline/AssetNode.tsx` | Create | 6 |
| `frontend/src/components/pipeline/OperationNode.tsx` | Create | 6 |
| `frontend/src/components/pipeline/PipelineCanvas.tsx` | Create | 7 |
| `frontend/src/components/pipeline/NodePalette.tsx` | Create | 7 |
| `frontend/src/components/pipeline/DetailDrawer.tsx` | Create | 8 |
| `frontend/src/components/pipeline/RunBar.tsx` | Create | 9 |
| `frontend/src/components/pipeline/YamlEditor.tsx` | Create | 9 |

---

## Dependency Order

```
Task 1 (Backend CRUD) ──→ Task 2 (Templates) ──┐
                                                 ├──→ Task 11 (Integration)
Task 3 (Nav updates) ──→ Task 4 (Store) ──→ Task 5 (List) ──→ Task 6 (Nodes) ──→ Task 7 (Canvas) ──→ Task 8 (Drawer) ──→ Task 9 (RunBar/YAML) ──→ Task 10 (Assemble) ──┘
```

Tasks 1-2 (backend) and Tasks 3-4 (frontend foundation) can run **in parallel**.
