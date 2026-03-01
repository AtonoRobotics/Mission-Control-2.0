"""
Mission Control — Workflow Graph Parser
Parses JSON/YAML workflow graph definitions into an executable model.
"""

from __future__ import annotations
import yaml
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConditionBranch:
    source_node_id: str
    branch_id: str  # "true" | "false" | enum value


@dataclass
class WorkflowNode:
    node_id: str
    node_type: str          # e.g. "bag.start", "condition.if", "lab.trigger_run"
    params: dict[str, Any]
    next_node_ids: list[str] = field(default_factory=list)
    condition_branch: ConditionBranch | None = None


@dataclass
class WorkflowGraph:
    name: str
    version: str
    description: str
    nodes: dict[str, WorkflowNode]  # node_id → WorkflowNode
    entry_node_id: str

    def topological_order(self) -> list[WorkflowNode]:
        """
        Returns nodes in execution order using topological sort (Kahn's algorithm).
        Raises ValueError if the graph contains a cycle.
        """
        in_degree: dict[str, int] = {nid: 0 for nid in self.nodes}
        for node in self.nodes.values():
            for next_id in node.next_node_ids:
                in_degree[next_id] = in_degree.get(next_id, 0) + 1

        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        ordered: list[WorkflowNode] = []

        while queue:
            nid = queue.pop(0)
            ordered.append(self.nodes[nid])
            for next_id in self.nodes[nid].next_node_ids:
                in_degree[next_id] -= 1
                if in_degree[next_id] == 0:
                    queue.append(next_id)

        if len(ordered) != len(self.nodes):
            raise ValueError("Workflow graph contains a cycle — cannot execute.")

        return ordered


class WorkflowGraphParser:
    """Parses workflow graph definitions from JSON dict or YAML string."""

    @staticmethod
    def from_dict(data: dict) -> WorkflowGraph:
        raw_nodes = data.get("nodes", [])
        if not raw_nodes:
            raise ValueError("Workflow graph must define at least one node.")

        nodes: dict[str, WorkflowNode] = {}
        entry_node_id: str | None = None

        for raw in raw_nodes:
            node_id = raw["id"]
            condition_branch = None
            if "condition_branch" in raw:
                cb = raw["condition_branch"]
                condition_branch = ConditionBranch(
                    source_node_id=cb["source_node_id"],
                    branch_id=cb["branch_id"],
                )

            node = WorkflowNode(
                node_id=node_id,
                node_type=raw["type"],
                params=raw.get("params", {}),
                next_node_ids=raw.get("next", []),
                condition_branch=condition_branch,
            )
            nodes[node_id] = node

            if entry_node_id is None:
                entry_node_id = node_id

        if entry_node_id is None:
            raise ValueError("Could not determine workflow entry node.")

        return WorkflowGraph(
            name=data["name"],
            version=data.get("version", "1.0.0"),
            description=data.get("description", ""),
            nodes=nodes,
            entry_node_id=entry_node_id,
        )

    @staticmethod
    def from_yaml(yaml_str: str) -> WorkflowGraph:
        data = yaml.safe_load(yaml_str)
        return WorkflowGraphParser.from_dict(data)
