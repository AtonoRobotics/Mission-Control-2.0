"""
Mission Control API — ROS2 Status Routes
Topics and nodes via rosbridge, with graceful fallback when disconnected.
"""

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel

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
