"""
Mission Control API — OSMO Integration Routes
Proxies to NVIDIA OSMO v6 for GPU workflow orchestration.

Endpoints:
  GET  /health          → OSMO connectivity + pool status
  GET  /pools           → List compute pools
  POST /workflows       → Submit workflow
  GET  /workflows       → List workflows
  GET  /workflows/{id}  → Query workflow status
  POST /workflows/{id}/cancel → Cancel workflow
  GET  /workflows/{id}/logs   → Workflow logs
"""

import structlog
import yaml
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from typing import Any

from services.osmo import get_osmo_client

logger = structlog.get_logger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class WorkflowSubmit(BaseModel):
    """Submit a workflow — either inline YAML dict or raw spec."""
    workflow: dict  # OSMO workflow spec (the 'workflow:' key content)
    pool: str = "default"


class WorkflowOut(BaseModel):
    workflow_id: str
    status: str
    user: str | None = None
    submit_time: str | None = None
    tasks: list[dict] | None = None


class PoolOut(BaseModel):
    name: str
    status: str
    description: str | None = None
    gpu_total: int = 0
    gpu_used: int = 0


class HealthOut(BaseModel):
    status: str
    version: str | None = None
    pools: dict | None = None
    error: str | None = None


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthOut)
async def osmo_health():
    """Check OSMO cluster connectivity and pool status."""
    try:
        osmo = get_osmo_client()
        return await osmo.health()
    except RuntimeError as e:
        return HealthOut(status="not_configured", error=str(e))
    except Exception as e:
        logger.warning("osmo_health_failed", error=str(e))
        return HealthOut(status="unreachable", error=str(e))


# ─── Pools ────────────────────────────────────────────────────────────────────

@router.get("/pools")
async def list_pools():
    """List OSMO compute pools with GPU availability."""
    osmo = get_osmo_client()
    try:
        data = await osmo.list_pools()
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


# ─── Workflows ────────────────────────────────────────────────────────────────

@router.post("/workflows")
async def submit_workflow(body: WorkflowSubmit):
    """Submit a workflow to OSMO for execution."""
    osmo = get_osmo_client()
    try:
        result = await osmo.submit_workflow(body.workflow, pool=body.pool)
        logger.info("osmo_workflow_submitted", result=result)
        return result
    except Exception as e:
        logger.error("osmo_workflow_submit_failed", error=str(e))
        raise HTTPException(status_code=502, detail=f"OSMO submit failed: {e}")


@router.post("/workflows/yaml")
async def submit_workflow_yaml(
    file: UploadFile = File(...),
    pool: str = Query("default", description="Target compute pool"),
):
    """Submit a workflow from a YAML file upload."""
    osmo = get_osmo_client()
    try:
        content = await file.read()
        # Validate it's parseable YAML before sending
        yaml.safe_load(content)
        result = await osmo.submit_workflow_raw(content.decode(), pool=pool)
        logger.info("osmo_workflow_yaml_submitted", result=result)
        return result
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO submit failed: {e}")


@router.get("/workflows")
async def list_workflows(
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List workflows with optional status filter."""
    osmo = get_osmo_client()
    try:
        return await osmo.list_workflows(status=status, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Get workflow status and task details."""
    osmo = get_osmo_client()
    try:
        return await osmo.query_workflow(workflow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


@router.post("/workflows/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str):
    """Cancel a running workflow."""
    osmo = get_osmo_client()
    try:
        return await osmo.cancel_workflow(workflow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


@router.get("/workflows/{workflow_id}/logs")
async def get_workflow_logs(workflow_id: str):
    """Get workflow execution logs."""
    osmo = get_osmo_client()
    try:
        return await osmo.workflow_logs(workflow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


@router.get("/workflows/{workflow_id}/errors")
async def get_workflow_errors(workflow_id: str):
    """Get workflow error logs."""
    osmo = get_osmo_client()
    try:
        return await osmo.workflow_error_logs(workflow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")


# ─── Config ───────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_osmo_config():
    """Get OSMO workflow and pool configuration."""
    osmo = get_osmo_client()
    try:
        workflow_cfg = await osmo.get_workflow_config()
        pool_cfg = await osmo.get_pool_config()
        return {"workflow": workflow_cfg, "pool": pool_cfg}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSMO error: {e}")
