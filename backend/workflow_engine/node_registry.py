"""
Mission Control — Workflow Node Registry
Base class for all node handlers and the registry that maps type strings to handlers.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


class NodeHandler(ABC):
    """
    Base class for all workflow node handlers.
    Each node type has exactly one handler registered in NodeRegistry.
    """

    @abstractmethod
    async def execute(
        self,
        params: dict[str, Any],
        context: dict[str, Any],
        run: "WorkflowRun",
    ) -> dict[str, Any]:
        """
        Execute this node.

        Args:
            params:  Node configuration from the workflow graph definition.
            context: Outputs from all previously executed nodes, keyed by node_id.
            run:     The active WorkflowRun — used for pause/resume and metadata.

        Returns:
            Output dict. Written to context[node_id] for downstream nodes.
            Must always include "status": "ok" | "failed".
        """
        ...


class StubNodeHandler(NodeHandler):
    """Placeholder handler for unimplemented node types. Fails with a clear message."""

    def __init__(self, node_type: str) -> None:
        self._node_type = node_type

    async def execute(
        self,
        params: dict[str, Any],
        context: dict[str, Any],
        run: "WorkflowRun",
    ) -> dict[str, Any]:
        raise NotImplementedError(
            f"Node type '{self._node_type}' is not yet implemented. "
            f"Only container.* nodes are currently functional."
        )


class NodeRegistry:
    """Maps node type strings (e.g. 'bag.start') to NodeHandler instances."""

    def __init__(self) -> None:
        self._handlers: dict[str, NodeHandler] = {}

    def register(self, node_type: str, handler: NodeHandler) -> None:
        if node_type in self._handlers:
            raise ValueError(f"Node type already registered: {node_type}")
        self._handlers[node_type] = handler

    def get(self, node_type: str) -> NodeHandler | None:
        return self._handlers.get(node_type)

    def registered_types(self) -> list[str]:
        return sorted(self._handlers.keys())


# Node type definitions — all types the workflow builder can reference
_ALL_NODE_TYPES = {
    "bag": ["start", "stop", "filter", "inspect"],
    "sim": ["load_stage", "set_lighting", "place_robot", "set_physics", "reset", "play", "stop"],
    "lab": ["set_env", "set_training_params", "trigger_run", "monitor_run", "stop_run", "export_checkpoint"],
    "dataset": ["filter", "label", "version", "split", "inspect"],
    "config": ["urdf_build", "sensor_config", "launch_file", "curob_config"],
    "validate": ["audit", "null_check", "db_compare", "hash_check"],
    "notify": ["operator", "log", "email"],
    "condition": ["if", "threshold", "null_gate", "switch"],
    "container": ["start", "stop", "restart", "status", "exec"],
}


def build_node_registry() -> NodeRegistry:
    """
    Instantiate and register all node handlers.
    Implemented modules are loaded; unimplemented ones get StubNodeHandler.
    """
    registry = NodeRegistry()

    # Container nodes — fully implemented
    try:
        from workflow_engine.nodes.container import (
            ContainerStartNode, ContainerStopNode, ContainerRestartNode,
            ContainerStatusNode, ContainerExecNode,
        )
        registry.register("container.start", ContainerStartNode())
        registry.register("container.stop", ContainerStopNode())
        registry.register("container.restart", ContainerRestartNode())
        registry.register("container.status", ContainerStatusNode())
        registry.register("container.exec", ContainerExecNode())
        logger.info("workflow_nodes_loaded", category="container", count=5)
    except ImportError as e:
        logger.warning("workflow_nodes_import_failed", category="container", error=str(e))

    # Register stubs for all unimplemented node types
    stub_count = 0
    for category, actions in _ALL_NODE_TYPES.items():
        if category == "container":
            continue  # Already loaded above
        for action in actions:
            node_type = f"{category}.{action}"
            if registry.get(node_type) is None:
                registry.register(node_type, StubNodeHandler(node_type))
                stub_count += 1

    if stub_count > 0:
        logger.info("workflow_stub_nodes_registered", count=stub_count)

    return registry
