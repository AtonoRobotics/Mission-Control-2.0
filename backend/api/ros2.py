"""
Mission Control API — ROS2 Status Routes
Topics and nodes via rosbridge, with graceful fallback when disconnected.
Param snapshots stored in registry DB.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import Ros2ParamSnapshot
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


class RosBridgeStatus(BaseModel):
    connected: bool
    url: str
    detail: str | None = None


@router.get("/status", response_model=RosBridgeStatus)
async def rosbridge_status(request: Request):
    rosbridge = getattr(request.app.state, "rosbridge", None)
    status_str = getattr(request.app.state, "rosbridge_status", "unknown")
    connected = status_str == "connected"
    url = rosbridge._url if rosbridge else "unknown"
    return RosBridgeStatus(
        connected=connected,
        url=url,
        detail=None if connected else status_str,
    )


@router.get("/topics")
async def list_topics(request: Request):
    rosbridge = getattr(request.app.state, "rosbridge", None)
    if not rosbridge or not rosbridge._connection:
        return {"topics": [], "error": "rosbridge not connected"}
    try:
        result = await rosbridge.get_topics()
        topics = result.get("values", result.get("topics", []))
        types = result.get("types", [])
        return {"topics": topics, "types": types}
    except Exception as e:
        logger.warning("ros2_topics_failed", error=str(e))
        return {"topics": [], "error": str(e)}


@router.get("/nodes")
async def list_nodes(request: Request):
    rosbridge = getattr(request.app.state, "rosbridge", None)
    if not rosbridge or not rosbridge._connection:
        return {"nodes": [], "error": "rosbridge not connected"}
    try:
        result = await rosbridge.get_nodes()
        nodes = result.get("values", result.get("nodes", []))
        return {"nodes": nodes}
    except Exception as e:
        logger.warning("ros2_nodes_failed", error=str(e))
        return {"nodes": [], "error": str(e)}


# =============================================================================
# Param Snapshot Endpoints
# =============================================================================


class ParamSnapshotCreate(BaseModel):
    node_name: str
    params: dict
    captured_by: Optional[str] = None


class ParamSnapshotOut(BaseModel):
    snapshot_id: UUID
    node_name: str
    params: dict
    captured_at: datetime
    captured_by: Optional[str]

    model_config = {"from_attributes": True}


@router.post("/params/snapshot", response_model=ParamSnapshotOut, status_code=201)
async def capture_param_snapshot(
    body: ParamSnapshotCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Capture a ROS2 param snapshot. Accepts params in body (rosbridge not required)."""
    snapshot = Ros2ParamSnapshot(
        node_name=body.node_name,
        params=body.params,
        captured_by=body.captured_by,
    )
    session.add(snapshot)
    await session.flush()
    await session.refresh(snapshot)
    logger.info(
        "param_snapshot_captured",
        snapshot_id=str(snapshot.snapshot_id),
        node_name=body.node_name,
    )
    return snapshot


@router.get("/params/snapshots", response_model=list[ParamSnapshotOut])
async def list_param_snapshots(
    node_name: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    """List param snapshots, optionally filtered by node_name."""
    stmt = select(Ros2ParamSnapshot).order_by(Ros2ParamSnapshot.captured_at.desc())
    if node_name is not None:
        stmt = stmt.where(Ros2ParamSnapshot.node_name == node_name)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()
