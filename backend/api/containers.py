"""
Mission Control API — Container Management Routes
Lists, starts, stops, and restarts Docker containers. Graceful fallback when daemon unavailable.
"""

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = structlog.get_logger(__name__)
router = APIRouter()


class ContainerOut(BaseModel):
    name: str
    configured_name: str
    status: str
    error: str | None = None


class ContainerActionOut(BaseModel):
    name: str
    configured_name: str
    action: str
    status: str
    error: str | None = None


def _get_container_map() -> dict[str, str]:
    from core.settings import get_settings
    return get_settings().container_map


def _get_docker_client():
    import docker
    try:
        return docker.from_env()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Docker daemon unavailable: {e}")


@router.get("", response_model=list[ContainerOut])
async def list_containers():
    container_map = _get_container_map()
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
        logger.warning("docker_unavailable", error=str(e))
        for label, container_name in container_map.items():
            results.append(ContainerOut(
                name=label,
                configured_name=container_name,
                status="unknown",
                error="Docker daemon unavailable",
            ))

    return results


@router.post("/{container_label}/start", response_model=ContainerActionOut)
async def start_container(container_label: str):
    """Start a stopped container."""
    container_map = _get_container_map()
    if container_label not in container_map:
        raise HTTPException(status_code=404, detail=f"Unknown container: {container_label}")

    import docker
    container_name = container_map[container_label]
    client = _get_docker_client()
    try:
        container = client.containers.get(container_name)
        container.start()
        container.reload()
        logger.info("container_started", name=container_label, docker_name=container_name)
        return ContainerActionOut(
            name=container_label,
            configured_name=container_name,
            action="start",
            status=container.status,
        )
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container not found: {container_name}")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=f"Docker error: {e}")
    finally:
        client.close()


@router.post("/{container_label}/stop", response_model=ContainerActionOut)
async def stop_container(container_label: str):
    """Stop a running container (10s timeout)."""
    container_map = _get_container_map()
    if container_label not in container_map:
        raise HTTPException(status_code=404, detail=f"Unknown container: {container_label}")

    import docker
    container_name = container_map[container_label]
    client = _get_docker_client()
    try:
        container = client.containers.get(container_name)
        container.stop(timeout=10)
        container.reload()
        logger.info("container_stopped", name=container_label, docker_name=container_name)
        return ContainerActionOut(
            name=container_label,
            configured_name=container_name,
            action="stop",
            status=container.status,
        )
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container not found: {container_name}")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=f"Docker error: {e}")
    finally:
        client.close()


@router.post("/{container_label}/restart", response_model=ContainerActionOut)
async def restart_container(container_label: str):
    """Restart a container (10s stop timeout)."""
    container_map = _get_container_map()
    if container_label not in container_map:
        raise HTTPException(status_code=404, detail=f"Unknown container: {container_label}")

    import docker
    container_name = container_map[container_label]
    client = _get_docker_client()
    try:
        container = client.containers.get(container_name)
        container.restart(timeout=10)
        container.reload()
        logger.info("container_restarted", name=container_label, docker_name=container_name)
        return ContainerActionOut(
            name=container_label,
            configured_name=container_name,
            action="restart",
            status=container.status,
        )
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container not found: {container_name}")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=f"Docker error: {e}")
    finally:
        client.close()


@router.get("/{container_label}/logs")
async def container_logs(container_label: str, tail: int = 100):
    """Get recent container logs."""
    container_map = _get_container_map()
    if container_label not in container_map:
        raise HTTPException(status_code=404, detail=f"Unknown container: {container_label}")

    import docker
    container_name = container_map[container_label]
    client = _get_docker_client()
    try:
        container = client.containers.get(container_name)
        logs = container.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
        return {
            "name": container_label,
            "configured_name": container_name,
            "tail": tail,
            "logs": logs,
        }
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container not found: {container_name}")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=f"Docker error: {e}")
    finally:
        client.close()
