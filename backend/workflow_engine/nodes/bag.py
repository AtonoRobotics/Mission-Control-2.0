"""
Mission Control — Bag (MCAP) Workflow Nodes
Recording, stopping, inspecting, and filtering MCAP bag files.
"""

from __future__ import annotations

import os
from typing import Any, TYPE_CHECKING

import structlog

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)


class BagStartNode(NodeHandler):
    """
    Start MCAP recording.
    params:
      output_dir: str — directory for the output file
      device_name: str — logical device identifier
      topics: list[dict] — [{name: str, type: str}, ...]
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        from services.mcap_writer import McapRecorder

        output_dir = params.get("output_dir")
        device_name = params.get("device_name")
        topics = params.get("topics", [])

        if not output_dir or not device_name:
            return {
                "status": "failed",
                "error": "output_dir and device_name are required",
            }

        if not topics:
            return {"status": "failed", "error": "topics list must not be empty"}

        try:
            recorder = McapRecorder(output_dir=output_dir, device_name=device_name)
            file_path = recorder.start(topics)

            # Store recorder on run object for BagStopNode to retrieve
            if not hasattr(run, "_recorders"):
                run._recorders = {}
            run._recorders[device_name] = recorder

            logger.info(
                "bag_recording_started",
                device_name=device_name,
                file_path=file_path,
                topic_count=len(topics),
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "file_path": file_path,
                "device_name": device_name,
                "topic_count": len(topics),
            }
        except Exception as e:
            logger.error("bag_start_failed", device_name=device_name, error=str(e))
            return {"status": "failed", "device_name": device_name, "error": str(e)}


class BagStopNode(NodeHandler):
    """
    Stop MCAP recording for a device.
    params:
      device_name: str — must match a previously started BagStartNode
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        device_name = params.get("device_name")
        if not device_name:
            return {"status": "failed", "error": "device_name is required"}

        recorders = getattr(run, "_recorders", {})
        recorder = recorders.get(device_name)

        if recorder is None:
            return {
                "status": "failed",
                "device_name": device_name,
                "error": f"No active recorder for device: {device_name}",
            }

        try:
            result = recorder.stop()
            # Clean up the recorder reference
            del run._recorders[device_name]

            logger.info(
                "bag_recording_stopped",
                device_name=device_name,
                file_path=result.get("file_path"),
                duration_sec=result.get("duration_sec"),
                message_count=result.get("message_count"),
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "file_path": result.get("file_path", ""),
                "duration_sec": result.get("duration_sec", 0.0),
                "message_count": result.get("message_count", 0),
                "size_bytes": result.get("size_bytes", 0),
            }
        except Exception as e:
            logger.error("bag_stop_failed", device_name=device_name, error=str(e))
            return {"status": "failed", "device_name": device_name, "error": str(e)}


class BagInspectNode(NodeHandler):
    """
    Inspect an MCAP file's metadata.
    params:
      file_path: str — path to the .mcap file
    """

    MCAP_MAGIC = b"\x89MCAP0\r\n"

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        file_path = params.get("file_path")
        if not file_path:
            return {"status": "failed", "error": "file_path is required"}

        if not os.path.exists(file_path):
            return {
                "status": "ok",
                "file_path": file_path,
                "size_bytes": 0,
                "valid_mcap": False,
            }

        try:
            size_bytes = os.path.getsize(file_path)
            valid_mcap = False

            if size_bytes >= len(self.MCAP_MAGIC):
                with open(file_path, "rb") as f:
                    header = f.read(len(self.MCAP_MAGIC))
                    valid_mcap = header == self.MCAP_MAGIC

            logger.info(
                "bag_inspected",
                file_path=file_path,
                size_bytes=size_bytes,
                valid_mcap=valid_mcap,
                run_id=run.run_id,
            )
            return {
                "status": "ok",
                "file_path": file_path,
                "size_bytes": size_bytes,
                "valid_mcap": valid_mcap,
            }
        except Exception as e:
            logger.error("bag_inspect_failed", file_path=file_path, error=str(e))
            return {"status": "failed", "file_path": file_path, "error": str(e)}


class BagFilterNode(NodeHandler):
    """
    Placeholder for MCAP bag filtering.
    Full implementation requires an MCAP reader library.
    params:
      source_path: str — input MCAP file
      output_path: str — desired output path
      topic_filter: list[str] — topics to keep
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_path = params.get("source_path", "")
        output_path = params.get("output_path", "")
        topic_filter = params.get("topic_filter", [])

        logger.info(
            "bag_filter_placeholder",
            source_path=source_path,
            output_path=output_path,
            topic_filter=topic_filter,
            run_id=run.run_id,
        )
        return {
            "status": "ok",
            "implemented": False,
            "message": "MCAP filtering requires mcap reader library",
        }
