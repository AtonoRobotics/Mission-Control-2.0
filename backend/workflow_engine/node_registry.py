"""
Mission Control — Workflow Node Registry
Base class for all node handlers and the registry that maps type strings to handlers.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun


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


def build_node_registry() -> NodeRegistry:
    """
    Instantiate and register all node handlers.
    Import here to avoid circular imports.
    """
    from workflow_engine.nodes.bag import (
        BagStartNode, BagStopNode, BagFilterNode, BagInspectNode,
    )
    from workflow_engine.nodes.sim import (
        SimLoadStageNode, SimSetLightingNode, SimPlaceRobotNode,
        SimSetPhysicsNode, SimResetNode, SimPlayNode, SimStopNode,
    )
    from workflow_engine.nodes.lab import (
        LabSetEnvNode, LabSetTrainingParamsNode, LabTriggerRunNode,
        LabMonitorRunNode, LabStopRunNode, LabExportCheckpointNode,
    )
    from workflow_engine.nodes.dataset import (
        DatasetFilterNode, DatasetLabelNode, DatasetVersionNode,
        DatasetSplitNode, DatasetInspectNode,
    )
    from workflow_engine.nodes.config import (
        ConfigUrdfBuildNode, ConfigSensorConfigNode,
        ConfigLaunchFileNode, ConfigCuroboConfigNode,
    )
    from workflow_engine.nodes.validate import (
        ValidateAuditNode, ValidateNullCheckNode,
        ValidateDbCompareNode, ValidateHashCheckNode,
    )
    from workflow_engine.nodes.notify import (
        NotifyOperatorNode, NotifyLogNode, NotifyEmailNode,
    )
    from workflow_engine.nodes.condition import (
        ConditionIfNode, ConditionThresholdNode,
        ConditionNullGateNode, ConditionSwitchNode,
    )
    from workflow_engine.nodes.container import (
        ContainerStartNode, ContainerStopNode, ContainerRestartNode,
        ContainerStatusNode, ContainerExecNode,
    )

    registry = NodeRegistry()

    # Bag nodes
    registry.register("bag.start", BagStartNode())
    registry.register("bag.stop", BagStopNode())
    registry.register("bag.filter", BagFilterNode())
    registry.register("bag.inspect", BagInspectNode())

    # Isaac Sim nodes
    registry.register("sim.load_stage", SimLoadStageNode())
    registry.register("sim.set_lighting", SimSetLightingNode())
    registry.register("sim.place_robot", SimPlaceRobotNode())
    registry.register("sim.set_physics", SimSetPhysicsNode())
    registry.register("sim.reset", SimResetNode())
    registry.register("sim.play", SimPlayNode())
    registry.register("sim.stop", SimStopNode())

    # Isaac Lab nodes
    registry.register("lab.set_env", LabSetEnvNode())
    registry.register("lab.set_training_params", LabSetTrainingParamsNode())
    registry.register("lab.trigger_run", LabTriggerRunNode())
    registry.register("lab.monitor_run", LabMonitorRunNode())
    registry.register("lab.stop_run", LabStopRunNode())
    registry.register("lab.export_checkpoint", LabExportCheckpointNode())

    # Dataset nodes
    registry.register("dataset.filter", DatasetFilterNode())
    registry.register("dataset.label", DatasetLabelNode())
    registry.register("dataset.version", DatasetVersionNode())
    registry.register("dataset.split", DatasetSplitNode())
    registry.register("dataset.inspect", DatasetInspectNode())

    # Config generation nodes
    registry.register("config.urdf_build", ConfigUrdfBuildNode())
    registry.register("config.sensor_config", ConfigSensorConfigNode())
    registry.register("config.launch_file", ConfigLaunchFileNode())
    registry.register("config.curob_config", ConfigCuroboConfigNode())

    # Validation nodes
    registry.register("validate.audit", ValidateAuditNode())
    registry.register("validate.null_check", ValidateNullCheckNode())
    registry.register("validate.db_compare", ValidateDbCompareNode())
    registry.register("validate.hash_check", ValidateHashCheckNode())

    # Notification nodes
    registry.register("notify.operator", NotifyOperatorNode())
    registry.register("notify.log", NotifyLogNode())
    registry.register("notify.email", NotifyEmailNode())

    # Conditional nodes
    registry.register("condition.if", ConditionIfNode())
    registry.register("condition.threshold", ConditionThresholdNode())
    registry.register("condition.null_gate", ConditionNullGateNode())
    registry.register("condition.switch", ConditionSwitchNode())

    # Container nodes
    registry.register("container.start", ContainerStartNode())
    registry.register("container.stop", ContainerStopNode())
    registry.register("container.restart", ContainerRestartNode())
    registry.register("container.status", ContainerStatusNode())
    registry.register("container.exec", ContainerExecNode())

    return registry
