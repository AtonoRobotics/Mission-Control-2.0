"""
Mission Control — Container Workflow Nodes
All Docker container operations in the workflow engine.
"""

import docker
import structlog
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


def _get_docker_client() -> docker.DockerClient:
    return docker.from_env()


class ContainerStartNode(NodeHandler):
    """
    Start a Docker container.
    params:
      container: str — container name (must match docker-compose service name)
    """
    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        container_name = params["container"]
        client = _get_docker_client()
        try:
            container = client.containers.get(container_name)
            container.start()
            logger.info("container_started", container=container_name, run_id=run.run_id)
            return {"status": "ok", "container": container_name, "action": "start"}
        except docker.errors.NotFound:
            return {
                "status": "failed",
                "container": container_name,
                "error": f"Container not found: {container_name}",
            }
        except Exception as e:
            return {"status": "failed", "container": container_name, "error": str(e)}


class ContainerStopNode(NodeHandler):
    """
    Stop a running Docker container.
    params:
      container: str
      timeout: int — seconds to wait before SIGKILL (default 10)
    """
    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        container_name = params["container"]
        timeout = params.get("timeout", 10)
        client = _get_docker_client()
        try:
            container = client.containers.get(container_name)
            container.stop(timeout=timeout)
            logger.info("container_stopped", container=container_name, run_id=run.run_id)
            return {"status": "ok", "container": container_name, "action": "stop"}
        except docker.errors.NotFound:
            return {
                "status": "failed",
                "container": container_name,
                "error": f"Container not found: {container_name}",
            }
        except Exception as e:
            return {"status": "failed", "container": container_name, "error": str(e)}


class ContainerRestartNode(NodeHandler):
    """
    Restart a Docker container.
    params:
      container: str
      timeout: int — seconds to wait before kill (default 10)
    """
    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        container_name = params["container"]
        timeout = params.get("timeout", 10)
        client = _get_docker_client()
        try:
            container = client.containers.get(container_name)
            container.restart(timeout=timeout)
            logger.info("container_restarted", container=container_name, run_id=run.run_id)
            return {"status": "ok", "container": container_name, "action": "restart"}
        except docker.errors.NotFound:
            return {
                "status": "failed",
                "container": container_name,
                "error": f"Container not found: {container_name}",
            }
        except Exception as e:
            return {"status": "failed", "container": container_name, "error": str(e)}


class ContainerStatusNode(NodeHandler):
    """
    Check container running state.
    params:
      container: str
    output:
      running: bool
      status: str — Docker status string
    """
    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        container_name = params["container"]
        client = _get_docker_client()
        try:
            container = client.containers.get(container_name)
            container.reload()
            running = container.status == "running"
            return {
                "status": "ok",
                "container": container_name,
                "running": running,
                "container_status": container.status,
            }
        except docker.errors.NotFound:
            return {
                "status": "ok",
                "container": container_name,
                "running": False,
                "container_status": "not_found",
            }
        except Exception as e:
            return {"status": "failed", "container": container_name, "error": str(e)}


class ContainerExecNode(NodeHandler):
    """
    Execute a command inside a running container.
    params:
      container: str
      command: str — shell command to execute
      workdir: str | None — working directory inside container
    output:
      exit_code: int
      stdout: str
      stderr: str
    """
    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        container_name = params["container"]
        command = params["command"]
        workdir = params.get("workdir")
        client = _get_docker_client()
        try:
            container = client.containers.get(container_name)
            if container.status != "running":
                return {
                    "status": "failed",
                    "container": container_name,
                    "error": f"Container is not running (status: {container.status})",
                }
            exec_result = container.exec_run(
                cmd=command,
                workdir=workdir,
                demux=True,
            )
            stdout = (exec_result.output[0] or b"").decode("utf-8", errors="replace")
            stderr = (exec_result.output[1] or b"").decode("utf-8", errors="replace")
            exit_code = exec_result.exit_code
            logger.info(
                "container_exec",
                container=container_name,
                exit_code=exit_code,
                run_id=run.run_id,
            )
            return {
                "status": "ok" if exit_code == 0 else "failed",
                "container": container_name,
                "exit_code": exit_code,
                "stdout": stdout,
                "stderr": stderr,
            }
        except docker.errors.NotFound:
            return {
                "status": "failed",
                "container": container_name,
                "error": f"Container not found: {container_name}",
            }
        except Exception as e:
            return {"status": "failed", "container": container_name, "error": str(e)}
