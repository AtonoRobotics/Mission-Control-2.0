"""
Mission Control API — Workflow Routes
Workflow graph CRUD, run lifecycle, execution, and per-node logs.
"""

import asyncio
from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import WorkflowGraph as WorkflowGraphModel, WorkflowRun, WorkflowRunLog
from db.session import get_registry_session, get_registry_session_context
from workflow_engine.executor import WorkflowExecutor
from workflow_engine.graph_parser import WorkflowGraphParser
from workflow_engine.node_registry import build_node_registry
from services.osmo_bridge import (
    pipeline_graph_to_osmo_yaml,
    submit_pipeline_to_osmo,
    poll_osmo_status,
    osmo_status_to_mc,
    osmo_tasks_to_node_results,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

# Module-level executor — initialized once, reused across requests
_executor: WorkflowExecutor | None = None


def _get_executor() -> WorkflowExecutor:
    global _executor
    if _executor is None:
        registry = build_node_registry()
        _executor = WorkflowExecutor(registry)
    return _executor


# =============================================================================
# Pydantic Schemas
# =============================================================================


class GraphCreate(BaseModel):
    name: str
    version: str = "1.0.0"
    description: Optional[str] = None
    graph_json: dict
    created_by: Optional[str] = None


class GraphOut(BaseModel):
    graph_id: UUID
    name: str
    version: str
    description: Optional[str]
    graph_json: dict
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]

    model_config = {"from_attributes": True}


class RunCreate(BaseModel):
    graph_id: UUID
    graph_name: str


class RunUpdate(BaseModel):
    status: Optional[str] = None
    node_results: Optional[dict] = None


class RunOut(BaseModel):
    run_id: UUID
    graph_id: UUID
    graph_name: str
    status: str
    node_results: dict
    started_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RunLogCreate(BaseModel):
    node_name: str
    status: str
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None


class RunLogOut(BaseModel):
    log_id: UUID
    run_id: UUID
    node_name: str
    status: str
    input_data: Optional[dict]
    output_data: Optional[dict]
    error: Optional[str]
    duration_ms: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


# =============================================================================
# Graph Endpoints
# =============================================================================


@router.get("/graphs", response_model=list[GraphOut])
async def list_graphs(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = (
        select(WorkflowGraphModel)
        .order_by(WorkflowGraphModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/graphs", response_model=GraphOut, status_code=201)
async def create_graph(
    body: GraphCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    graph = WorkflowGraphModel(
        name=body.name,
        version=body.version,
        description=body.description,
        graph_json=body.graph_json,
        created_by=body.created_by,
    )
    session.add(graph)
    await session.flush()
    await session.refresh(graph)
    logger.info("workflow_graph_created", graph_id=str(graph.graph_id), name=body.name)
    return graph


@router.get("/graphs/{graph_id}", response_model=GraphOut)
async def get_graph(
    graph_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(WorkflowGraphModel).where(WorkflowGraphModel.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Workflow graph not found")
    return graph


@router.get("/graphs/{graph_id}/osmo-preview")
async def preview_osmo_yaml(
    graph_id: UUID,
    pool: str = Query("default", description="Target OSMO pool"),
    session: AsyncSession = Depends(get_registry_session),
):
    """Preview the OSMO workflow YAML that would be generated from this graph."""
    result = await session.execute(
        select(WorkflowGraphModel).where(WorkflowGraphModel.graph_id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail="Workflow graph not found")

    try:
        osmo_yaml = pipeline_graph_to_osmo_yaml(
            graph.graph_json, name=graph.name, pool=pool
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Conversion failed: {e}")

    return {
        "graph_id": str(graph_id),
        "name": graph.name,
        "pool": pool,
        "osmo_yaml": osmo_yaml,
    }


# =============================================================================
# Run Endpoints
# =============================================================================


@router.post("/runs", response_model=RunOut, status_code=201)
async def create_run(
    body: RunCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    run = WorkflowRun(
        graph_id=body.graph_id,
        graph_name=body.graph_name,
        status="running",
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)
    logger.info("workflow_run_created", run_id=str(run.run_id), graph_name=body.graph_name)
    return run


@router.post("/graphs/{graph_id}/execute", response_model=RunOut, status_code=202)
async def execute_graph(
    graph_id: UUID,
    compute_backend: str = Query("local", description="Execution backend: 'local' or 'osmo'"),
    pool: str = Query("default", description="OSMO pool (only used when backend=osmo)"),
    session: AsyncSession = Depends(get_registry_session),
):
    """Execute a workflow graph. Use compute_backend='osmo' to run on GPU cluster."""
    result = await session.execute(
        select(WorkflowGraphModel).where(WorkflowGraphModel.graph_id == graph_id)
    )
    graph_model = result.scalar_one_or_none()
    if not graph_model:
        raise HTTPException(status_code=404, detail="Workflow graph not found")

    # Create DB run record
    db_run = WorkflowRun(
        graph_id=graph_id,
        graph_name=graph_model.name,
        status="running",
    )
    session.add(db_run)
    await session.flush()
    await session.refresh(db_run)
    run_id = str(db_run.run_id)

    if compute_backend == "osmo":
        # ── OSMO execution path ──────────────────────────────────────
        graph_json = graph_model.graph_json
        osmo_compatible = graph_json.get("osmo_compatible", False)
        if not osmo_compatible:
            logger.warning(
                "osmo_execution_not_compatible",
                graph_id=str(graph_id),
                name=graph_model.name,
            )

        try:
            osmo_result = await submit_pipeline_to_osmo(
                graph_json, name=graph_model.name, pool=pool
            )
        except Exception as e:
            logger.error("osmo_submit_failed", error=str(e))
            raise HTTPException(status_code=502, detail=f"OSMO submission failed: {e}")

        osmo_workflow_id = osmo_result.get("workflow_id") or osmo_result.get("id", "")
        db_run.node_results = {"_osmo": {"workflow_id": osmo_workflow_id, "pool": pool}}
        await session.flush()

        async def _sync_osmo_to_db():
            try:
                final = await poll_osmo_status(osmo_workflow_id)
                async with get_registry_session_context() as s:
                    res = await s.execute(
                        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
                    )
                    r = res.scalar_one_or_none()
                    if r:
                        r.status = osmo_status_to_mc(final.get("status", "FAILED"))
                        r.completed_at = func.now()
                        r.node_results = {
                            "_osmo": {"workflow_id": osmo_workflow_id, "pool": pool},
                            **osmo_tasks_to_node_results(final),
                        }
                        await s.commit()
                        logger.info("osmo_run_synced", run_id=run_id, osmo_id=osmo_workflow_id, status=r.status)
            except Exception as e:
                logger.error("osmo_sync_failed", run_id=run_id, error=str(e))

        asyncio.create_task(_sync_osmo_to_db())
        logger.info("osmo_execution_started", run_id=run_id, osmo_id=osmo_workflow_id, pool=pool)
    else:
        # ── Local execution path ─────────────────────────────────────
        try:
            parsed = WorkflowGraphParser.from_dict(graph_model.graph_json)
        except (ValueError, KeyError) as e:
            raise HTTPException(status_code=422, detail=f"Invalid graph definition: {e}")

        executor = _get_executor()
        engine_run = await executor.execute(parsed)

        async def _sync_run_to_db():
            while engine_run.status == "running":
                await asyncio.sleep(1.0)
            async with get_registry_session_context() as s:
                res = await s.execute(
                    select(WorkflowRun).where(WorkflowRun.run_id == run_id)
                )
                r = res.scalar_one_or_none()
                if r:
                    r.status = "completed" if engine_run.status == "complete" else "failed"
                    r.completed_at = func.now()
                    r.node_results = {
                        nid: {
                            "status": nr.status,
                            "output": nr.output,
                            "error": nr.error,
                            "duration_ms": nr.duration_ms,
                        }
                        for nid, nr in engine_run.node_results.items()
                    }
                    await s.commit()
                    logger.info("workflow_run_synced", run_id=run_id, status=r.status)

        asyncio.create_task(_sync_run_to_db())
        logger.info("workflow_execution_started", run_id=run_id, graph_name=graph_model.name, backend="local")

    return db_run


@router.get("/runs", response_model=list[RunOut])
async def list_runs(
    graph_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(WorkflowRun).order_by(WorkflowRun.started_at.desc())
    if graph_id:
        stmt = stmt.where(WorkflowRun.graph_id == graph_id)
    if status:
        stmt = stmt.where(WorkflowRun.status == status)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return run


@router.patch("/runs/{run_id}", response_model=RunOut)
async def update_run(
    run_id: UUID,
    body: RunUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")

    if body.status is not None:
        run.status = body.status
        if body.status in ("completed", "failed"):
            run.completed_at = func.now()
    if body.node_results is not None:
        run.node_results = body.node_results

    await session.flush()
    await session.refresh(run)
    logger.info("workflow_run_updated", run_id=str(run_id), status=run.status)
    return run


# =============================================================================
# Run Log Endpoints
# =============================================================================


@router.get("/runs/{run_id}/logs", response_model=list[RunLogOut])
async def list_run_logs(
    run_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    # Verify run exists
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow run not found")

    result = await session.execute(
        select(WorkflowRunLog)
        .where(WorkflowRunLog.run_id == run_id)
        .order_by(WorkflowRunLog.created_at.asc())
    )
    return result.scalars().all()


@router.post("/runs/{run_id}/logs", response_model=RunLogOut, status_code=201)
async def create_run_log(
    run_id: UUID,
    body: RunLogCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    # Verify run exists
    result = await session.execute(
        select(WorkflowRun).where(WorkflowRun.run_id == run_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow run not found")

    log = WorkflowRunLog(
        run_id=run_id,
        node_name=body.node_name,
        status=body.status,
        input_data=body.input_data,
        output_data=body.output_data,
        error=body.error,
        duration_ms=body.duration_ms,
    )
    session.add(log)
    await session.flush()
    await session.refresh(log)
    logger.info("workflow_run_log_created", run_id=str(run_id), node=body.node_name)
    return log
