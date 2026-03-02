"""
Mission Control API — Container Status Routes
Lists Isaac ROS containers with live Docker status. Graceful fallback when daemon unavailable.
"""

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = structlog.get_logger(__name__)
router = APIRouter()


class ContainerOut(BaseModel):
    name: str
    configured_name: str
    status: str
    error: str | None = None


@router.get("", response_model=list[ContainerOut])
async def list_containers(request: Request):
    from core.settings import get_settings
    settings = get_settings()
    container_map = settings.container_map

    results = []
    try:
        import docker
        client = docker.from_env()

        for label, container_name in container_map.items():
            try:
                container = client.containers.get(container_name)
                results.append(ContainerOut(
                    name=label,
                    configured_name=container_name,
                    status=container.status,
                ))
            except docker.errors.NotFound:
                results.append(ContainerOut(
                    name=label,
                    configured_name=container_name,
                    status="not_found",
                ))
            except Exception as e:
                results.append(ContainerOut(
                    name=label,
                    configured_name=container_name,
                    status="error",
                    error=str(e),
                ))

        client.close()
    except Exception as e:
        # Docker daemon not available — return all as unknown
        logger.warning("docker_unavailable", error=str(e))
        for label, container_name in container_map.items():
            results.append(ContainerOut(
                name=label,
                configured_name=container_name,
                status="unknown",
                error="Docker daemon unavailable",
            ))

    return results
