"""
Mission Control — Dataset Workflow Nodes
Versioning, inspecting, filtering, labeling, and splitting datasets.
"""

from __future__ import annotations

import math
from typing import Any, TYPE_CHECKING

import structlog

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


class DatasetVersionNode(NodeHandler):
    """
    Create a new dataset version entry.
    params:
      name: str — dataset name
      version: str — semantic version string
      source_bag_paths: list[str] — paths to source MCAP bags
      robot_id: str | None — optional robot identifier
      labels: list[str] | None — optional initial labels
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        name = params.get("name")
        version = params.get("version")
        source_bag_paths = params.get("source_bag_paths", [])
        robot_id = params.get("robot_id")
        labels = params.get("labels", [])

        if not name or not version:
            return {"status": "failed", "error": "name and version are required"}

        if not source_bag_paths:
            return {"status": "failed", "error": "source_bag_paths must not be empty"}

        dataset = {
            "name": name,
            "version": version,
            "source_bag_paths": source_bag_paths,
            "robot_id": robot_id,
            "labels": labels or [],
        }

        logger.info(
            "dataset_version_created",
            name=name,
            version=version,
            bag_count=len(source_bag_paths),
            run_id=run.run_id,
        )
        return {"status": "ok", "dataset": dataset}


class DatasetInspectNode(NodeHandler):
    """
    Inspect dataset metadata from a previous node's output.
    params:
      source_node: str — node_id whose output contains dataset info
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node")
        if not source_node:
            return {"status": "failed", "error": "source_node is required"}

        source_output = context.get(source_node)
        if not source_output:
            return {
                "status": "failed",
                "error": f"No output found for node: {source_node}",
            }

        dataset = source_output.get("dataset", source_output)
        name = dataset.get("name", "unknown")
        version = dataset.get("version", "unknown")
        bag_count = len(dataset.get("source_bag_paths", []))
        label_count = len(dataset.get("labels", []))

        logger.info(
            "dataset_inspected",
            name=name,
            version=version,
            bag_count=bag_count,
            label_count=label_count,
            run_id=run.run_id,
        )
        return {
            "status": "ok",
            "name": name,
            "version": version,
            "bag_count": bag_count,
            "label_count": label_count,
        }


class DatasetFilterNode(NodeHandler):
    """
    Filter dataset entries by label criteria.
    params:
      source_node: str — node_id whose output contains dataset info
      filter_labels: list[str] — keep only entries matching these labels
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node")
        filter_labels = params.get("filter_labels", [])

        if not source_node:
            return {"status": "failed", "error": "source_node is required"}

        source_output = context.get(source_node)
        if not source_output:
            return {
                "status": "failed",
                "error": f"No output found for node: {source_node}",
            }

        dataset = source_output.get("dataset", source_output)
        original_labels = dataset.get("labels", [])
        original_count = len(original_labels)

        filtered_labels = [l for l in original_labels if l in filter_labels]
        filtered_count = len(filtered_labels)

        logger.info(
            "dataset_filtered",
            source_node=source_node,
            original_count=original_count,
            filtered_count=filtered_count,
            run_id=run.run_id,
        )
        return {
            "status": "ok",
            "original_count": original_count,
            "filtered_count": filtered_count,
            "labels": filtered_labels,
        }


class DatasetLabelNode(NodeHandler):
    """
    Add labels to a dataset.
    params:
      source_node: str — node_id whose output contains dataset info
      labels: list[str] — labels to add
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node")
        new_labels = params.get("labels", [])

        if not source_node:
            return {"status": "failed", "error": "source_node is required"}

        source_output = context.get(source_node)
        if not source_output:
            return {
                "status": "failed",
                "error": f"No output found for node: {source_node}",
            }

        dataset = source_output.get("dataset", source_output)
        existing_labels = dataset.get("labels", [])

        # Merge labels, preserving order, no duplicates
        merged = list(existing_labels)
        for label in new_labels:
            if label not in merged:
                merged.append(label)

        logger.info(
            "dataset_labels_added",
            source_node=source_node,
            added=len(merged) - len(existing_labels),
            total=len(merged),
            run_id=run.run_id,
        )
        return {"status": "ok", "labels": merged}


class DatasetSplitNode(NodeHandler):
    """
    Define train/val/test split ratios for a dataset.
    params:
      source_node: str — node_id whose output contains dataset info
      train: float — training split ratio (e.g. 0.8)
      val: float — validation split ratio (e.g. 0.1)
      test: float — test split ratio (e.g. 0.1)
    Ratios must sum to 1.0 (within 0.01 tolerance).
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node")
        train = params.get("train", 0.0)
        val = params.get("val", 0.0)
        test = params.get("test", 0.0)

        if not source_node:
            return {"status": "failed", "error": "source_node is required"}

        source_output = context.get(source_node)
        if not source_output:
            return {
                "status": "failed",
                "error": f"No output found for node: {source_node}",
            }

        total = train + val + test
        if not math.isclose(total, 1.0, abs_tol=0.01):
            return {
                "status": "failed",
                "error": f"Split ratios must sum to 1.0, got {total:.4f}",
            }

        split = {"train": train, "val": val, "test": test}

        logger.info(
            "dataset_split_defined",
            source_node=source_node,
            split=split,
            run_id=run.run_id,
        )
        return {"status": "ok", "split": split}
