"""
Mission Control — Notify Workflow Nodes
Operator notifications, structured logging, and email placeholders.
"""

import structlog
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)

_VALID_LOG_LEVELS = {"info", "warning", "error"}


class NotifyOperatorNode(NodeHandler):
    """
    Pause workflow execution for operator review.

    Clears run._pause_event so the executor blocks until resume() is called.
    The operator sees params["message"] in the run status.

    params:
        message: str — message shown to the operator

    Output: {"status": "ok", "paused": True, "message": ...}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        message = params.get("message", "Operator review required")

        logger.info(
            "notify_operator_pause",
            message=message,
            run_id=run.run_id,
        )

        # Mark run as paused and clear the event so executor blocks
        run.status = "paused"
        run._pause_event.clear()

        return {"status": "ok", "paused": True, "message": message}


class NotifyLogNode(NodeHandler):
    """
    Write a structured log entry via structlog.

    params:
        level: str — "info", "warning", or "error" (default "info")
        message: str — log message
        data: dict | None — optional extra fields

    Output: {"status": "ok", "logged": True}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        level = params.get("level", "info")
        message = params.get("message", "")
        data = params.get("data") or {}

        if level not in _VALID_LOG_LEVELS:
            return {
                "status": "failed",
                "error": f"Invalid log level: {level!r}. "
                         f"Must be one of: {', '.join(sorted(_VALID_LOG_LEVELS))}",
            }

        log_fn = getattr(logger, level)
        log_fn(
            "workflow_notify_log",
            message=message,
            run_id=run.run_id,
            **data,
        )

        return {"status": "ok", "logged": True}


class NotifyEmailNode(NodeHandler):
    """
    Log the email notification intent. Actual sending is future scope.

    params:
        to: str — recipient email address
        subject: str — email subject line
        body: str — email body text

    Output: {"status": "ok", "sent": False, "queued": True, "to": ..., "subject": ...}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        to = params.get("to", "")
        subject = params.get("subject", "")
        body = params.get("body", "")

        if not to:
            return {"status": "failed", "error": "Missing required param: 'to'"}
        if not subject:
            return {"status": "failed", "error": "Missing required param: 'subject'"}

        logger.info(
            "notify_email_queued",
            to=to,
            subject=subject,
            run_id=run.run_id,
        )

        return {
            "status": "ok",
            "sent": False,
            "queued": True,
            "to": to,
            "subject": subject,
        }
