"""
OSMO Bridge — Converts MC pipeline graphs to OSMO workflow YAML and manages
execution routing between local WorkflowExecutor and OSMO k8s cluster.

Bridges the gap between MC's visual pipeline editor (bipartite DAG of
asset + operation nodes) and OSMO's declarative workflow spec (sequential
tasks with images, resources, and artifact dependencies).
"""

import asyncio
import yaml
import structlog
from typing import Any
from datetime import datetime

from services.osmo import get_osmo_client

logger = structlog.get_logger(__name__)


# =============================================================================
# Node Type → OSMO Task Image Mapping
# =============================================================================

# Maps MC operation node types to their container images and default resources.
# Asset nodes are data-only and do not produce OSMO tasks.
NODE_IMAGE_MAP: dict[str, dict[str, Any]] = {
    # Scene composition
    "usd_compose": {
        "image": "nvcr.io/nvidia/isaac-sim:5.1.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "32Gi"},
        "pool_hint": "workstation",
    },
    # Demo recording (Isaac Sim headless)
    "demo_record": {
        "image": "nvcr.io/nvidia/isaac-sim:5.1.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "32Gi"},
        "pool_hint": "workstation",
    },
    # GR00T-Mimic data augmentation
    "groot_mimic": {
        "image": "nvcr.io/nvidia/gr00t:1.6.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "32Gi"},
        "pool_hint": "spark",
    },
    # Cosmos domain transfer
    "cosmos_transfer": {
        "image": "nvcr.io/nvidia/cosmos:1.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "64Gi"},
        "pool_hint": "spark",
    },
    # GR00T fine-tuning
    "groot_finetune": {
        "image": "nvcr.io/nvidia/gr00t:1.6.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "64Gi"},
        "pool_hint": "spark",
    },
    # Isaac Lab RL training
    "isaac_lab_rl": {
        "image": "nvcr.io/nvidia/isaac-lab:4.5.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "32Gi"},
        "pool_hint": "spark",
    },
    # Arena evaluation
    "arena_eval": {
        "image": "nvcr.io/nvidia/isaac-sim:5.1.0",
        "resources": {"cpu": 4, "gpu": 1, "memory": "32Gi"},
        "pool_hint": "workstation",
    },
    # cuRobo validation
    "curobo_validate": {
        "image": "nvcr.io/nvidia/isaac-lab:4.5.0",
        "resources": {"cpu": 2, "gpu": 1, "memory": "16Gi"},
        "pool_hint": "workstation",
    },
    # Deployment (lightweight, no GPU)
    "deploy": {
        "image": "python:3.12-slim",
        "resources": {"cpu": 1, "gpu": 0, "memory": "2Gi"},
        "pool_hint": "default",
    },
}


# =============================================================================
# Graph → OSMO Converter
# =============================================================================


def pipeline_graph_to_osmo_yaml(
    graph_json: dict,
    name: str = "mc-pipeline",
    pool: str | None = None,
) -> str:
    """Convert an MC pipeline graph JSON to OSMO workflow YAML string.

    Only operation nodes become OSMO tasks. Asset nodes represent data
    flowing between operations and are mapped to task dependencies.

    Args:
        graph_json: MC pipeline graph with nodes[] and edges[]
        name: Workflow name for OSMO
        pool: Override pool for all tasks (otherwise uses node pool_hint)

    Returns:
        OSMO-compatible YAML string with top-level 'workflow:' key.
    """
    nodes = {n["id"]: n for n in graph_json.get("nodes", [])}
    edges = graph_json.get("edges", [])

    # Build adjacency: which operation nodes feed into which
    # Edge pattern: op → asset → op (bipartite), so we need to trace through assets
    asset_ids = {nid for nid, n in nodes.items() if n.get("category") == "asset"}
    op_ids = {nid for nid, n in nodes.items() if n.get("category") == "operation"}

    # Build edge index
    outgoing: dict[str, list[str]] = {}  # node_id → [target_ids]
    for e in edges:
        outgoing.setdefault(e["source"], []).append(e["target"])

    # Trace operation dependencies through asset nodes
    # An operation B depends on operation A if: A → asset → B
    op_deps: dict[str, set[str]] = {oid: set() for oid in op_ids}
    for op_a in op_ids:
        for asset in outgoing.get(op_a, []):
            if asset in asset_ids:
                for op_b in outgoing.get(asset, []):
                    if op_b in op_ids:
                        op_deps[op_b].add(op_a)

    # Topological sort of operation nodes
    sorted_ops = _topo_sort(op_ids, op_deps)

    # Build OSMO tasks
    tasks = []
    for op_id in sorted_ops:
        node = nodes[op_id]
        node_type = node.get("type", "unknown")
        mapping = NODE_IMAGE_MAP.get(node_type, {
            "image": "python:3.12-slim",
            "resources": {"cpu": 1, "gpu": 0, "memory": "4Gi"},
            "pool_hint": "default",
        })

        config = node.get("config", {})
        task_pool = pool or config.get("pool") or mapping.get("pool_hint", "default")

        # Build command from config params
        config_str = " ".join(f"--{k}={v}" for k, v in config.items() if k != "pool")
        command_script = (
            f'echo "=== {node.get("label", op_id)} ==="\n'
            f'echo "Node type: {node_type}"\n'
            f'echo "Config: {config_str}"\n'
            f'echo "=== Task Complete ==="\n'
        )

        task: dict[str, Any] = {
            "name": op_id.replace("_", "-"),
            "image": mapping["image"],
            "command": ["bash"],
            "args": ["-c", command_script],
        }

        # Add resource requests
        resources = mapping.get("resources", {})
        if resources.get("gpu", 0) > 0:
            task["resources"] = {
                "requests": {
                    "cpu": str(resources.get("cpu", 2)),
                    "memory": resources.get("memory", "16Gi"),
                    "nvidia.com/gpu": str(resources.get("gpu", 1)),
                },
            }

        # Add dependencies (OSMO uses 'after' field for task ordering)
        deps = op_deps.get(op_id, set())
        if deps:
            task["after"] = [d.replace("_", "-") for d in deps]

        tasks.append(task)

    # Build OSMO workflow spec
    workflow = {
        "workflow": {
            "name": name,
            "tasks": tasks,
        }
    }

    return yaml.dump(workflow, default_flow_style=False, sort_keys=False)


def _topo_sort(node_ids: set[str], deps: dict[str, set[str]]) -> list[str]:
    """Kahn's algorithm for topological sort."""
    in_degree = {n: len(deps.get(n, set())) for n in node_ids}
    queue = [n for n in node_ids if in_degree[n] == 0]
    result = []

    while queue:
        queue.sort()  # deterministic ordering
        node = queue.pop(0)
        result.append(node)
        for other in node_ids:
            if node in deps.get(other, set()):
                in_degree[other] -= 1
                if in_degree[other] == 0:
                    queue.append(other)

    if len(result) != len(node_ids):
        raise ValueError("Cycle detected in pipeline graph")

    return result


# =============================================================================
# OSMO Execution + Status Sync
# =============================================================================


async def submit_pipeline_to_osmo(
    graph_json: dict,
    name: str,
    pool: str = "default",
) -> dict:
    """Convert an MC pipeline graph to OSMO YAML and submit it.

    Returns the OSMO submission response (contains workflow_id).
    """
    osmo_yaml = pipeline_graph_to_osmo_yaml(graph_json, name=name, pool=pool)
    logger.info(
        "osmo_bridge_submitting",
        name=name,
        pool=pool,
        yaml_length=len(osmo_yaml),
    )

    osmo = get_osmo_client()
    result = await osmo.submit_workflow_raw(osmo_yaml, pool=pool)
    logger.info("osmo_bridge_submitted", name=name, result=result)
    return result


async def poll_osmo_status(
    osmo_workflow_id: str,
    interval: float = 5.0,
    timeout: float = 3600.0,
) -> dict:
    """Poll OSMO for workflow completion. Returns final status dict.

    Args:
        osmo_workflow_id: The OSMO workflow ID to track
        interval: Polling interval in seconds
        timeout: Maximum wait time in seconds
    """
    osmo = get_osmo_client()
    start = asyncio.get_event_loop().time()

    while True:
        elapsed = asyncio.get_event_loop().time() - start
        if elapsed > timeout:
            return {"status": "timeout", "workflow_id": osmo_workflow_id}

        try:
            status = await osmo.query_workflow(osmo_workflow_id)
            wf_status = status.get("status", "unknown")

            if wf_status in ("COMPLETED", "FAILED", "CANCELLED"):
                return status

            logger.debug(
                "osmo_bridge_polling",
                workflow_id=osmo_workflow_id,
                status=wf_status,
                elapsed=f"{elapsed:.0f}s",
            )
        except Exception as e:
            logger.warning(
                "osmo_bridge_poll_error",
                workflow_id=osmo_workflow_id,
                error=str(e),
            )

        await asyncio.sleep(interval)


def osmo_status_to_mc(osmo_status: str) -> str:
    """Map OSMO workflow status to MC run status."""
    mapping = {
        "PENDING": "running",
        "RUNNING": "running",
        "COMPLETED": "completed",
        "FAILED": "failed",
        "CANCELLED": "cancelled",
    }
    return mapping.get(osmo_status, "running")


def osmo_tasks_to_node_results(osmo_response: dict) -> dict:
    """Extract per-task results from OSMO workflow response into MC node_results format."""
    node_results = {}
    tasks = osmo_response.get("tasks", [])
    if isinstance(tasks, list):
        for task in tasks:
            task_name = task.get("name", "unknown")
            node_results[task_name] = {
                "status": task.get("status", "unknown").lower(),
                "output": {
                    "pod": task.get("pod_name"),
                    "node": task.get("node_name"),
                    "image": task.get("image"),
                },
                "error": task.get("error"),
                "duration_ms": task.get("duration_ms"),
            }
    return node_results
