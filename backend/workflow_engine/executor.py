"""
Mission Control — Workflow Engine Executor
Executes node-based workflow graphs directly.
Claude Code agents have no role in workflow execution.
"""

import asyncio
import uuid
import structlog
from datetime import datetime, timezone
from typing import Any

from workflow_engine.graph_parser import WorkflowGraph, WorkflowNode
from workflow_engine.node_registry import NodeRegistry

logger = structlog.get_logger(__name__)


class WorkflowExecutionError(Exception):
    """Raised when a workflow node fails and execution cannot continue."""
    pass


class NodeResult:
    def __init__(
        self,
        node_id: str,
        status: str,
        output: dict[str, Any],
        error: str | None = None,
        duration_ms: float = 0.0,
    ) -> None:
        self.node_id = node_id
        self.status = status  # "ok" | "failed" | "skipped"
        self.output = output
        self.error = error
        self.duration_ms = duration_ms
        self.timestamp = datetime.now(timezone.utc).isoformat()


class WorkflowRun:
    def __init__(self, graph: WorkflowGraph, run_id: str) -> None:
        self.graph = graph
        self.run_id = run_id
        self.status = "running"  # "running" | "complete" | "failed" | "paused"
        self.node_results: dict[str, NodeResult] = {}
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: str | None = None
        self._pause_event: asyncio.Event = asyncio.Event()
        self._pause_event.set()  # Not paused by default


class WorkflowExecutor:
    """
    Executes a workflow graph node by node.
    Respects conditional branching, pause/resume for operator nodes,
    and captures per-node results for Mission Control UI.
    """

    def __init__(self, node_registry: NodeRegistry) -> None:
        self._registry = node_registry
        self._active_runs: dict[str, WorkflowRun] = {}

    async def execute(self, graph: WorkflowGraph) -> WorkflowRun:
        run_id = str(uuid.uuid4())
        run = WorkflowRun(graph=graph, run_id=run_id)
        self._active_runs[run_id] = run

        logger.info(
            "workflow_run_started",
            run_id=run_id,
            graph_name=graph.name,
            node_count=len(graph.nodes),
        )

        asyncio.create_task(self._execute_run(run))
        return run

    async def _execute_run(self, run: WorkflowRun) -> None:
        try:
            execution_order = run.graph.topological_order()
            context: dict[str, Any] = {}

            for node in execution_order:
                # Check if this node should be skipped (conditional branch not taken)
                if self._should_skip(node, run):
                    run.node_results[node.node_id] = NodeResult(
                        node_id=node.node_id,
                        status="skipped",
                        output={},
                    )
                    continue

                # Wait if paused (notify.operator pause node)
                await run._pause_event.wait()

                result = await self._execute_node(node, context, run)
                run.node_results[node.node_id] = result

                if result.status == "failed":
                    run.status = "failed"
                    run.completed_at = datetime.now(timezone.utc).isoformat()
                    logger.error(
                        "workflow_node_failed",
                        run_id=run.run_id,
                        node_id=node.node_id,
                        error=result.error,
                    )
                    return

                # Feed output into context for downstream nodes
                context[node.node_id] = result.output

            run.status = "complete"
            run.completed_at = datetime.now(timezone.utc).isoformat()
            logger.info("workflow_run_complete", run_id=run.run_id)

        except asyncio.CancelledError:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc).isoformat()

    async def _execute_node(
        self,
        node: WorkflowNode,
        context: dict[str, Any],
        run: WorkflowRun,
    ) -> NodeResult:
        handler = self._registry.get(node.node_type)
        if handler is None:
            return NodeResult(
                node_id=node.node_id,
                status="failed",
                output={},
                error=f"Unknown node type: {node.node_type}",
            )

        start = asyncio.get_event_loop().time()
        try:
            output = await handler.execute(
                params=node.params,
                context=context,
                run=run,
            )
            duration_ms = (asyncio.get_event_loop().time() - start) * 1000
            logger.info(
                "workflow_node_complete",
                run_id=run.run_id,
                node_id=node.node_id,
                node_type=node.node_type,
                duration_ms=round(duration_ms, 2),
            )
            return NodeResult(
                node_id=node.node_id,
                status="ok",
                output=output,
                duration_ms=duration_ms,
            )
        except Exception as e:
            duration_ms = (asyncio.get_event_loop().time() - start) * 1000
            logger.error(
                "workflow_node_error",
                run_id=run.run_id,
                node_id=node.node_id,
                node_type=node.node_type,
                error=str(e),
            )
            return NodeResult(
                node_id=node.node_id,
                status="failed",
                output={},
                error=str(e),
                duration_ms=duration_ms,
            )

    def _should_skip(self, node: WorkflowNode, run: WorkflowRun) -> bool:
        """
        A node is skipped if it was not selected by an upstream conditional node.
        Conditional nodes write their chosen branch to context.
        """
        if node.condition_branch is None:
            return False
        parent_result = run.node_results.get(node.condition_branch.source_node_id)
        if parent_result is None:
            return False
        chosen = parent_result.output.get("chosen_branch")
        return chosen != node.condition_branch.branch_id

    def get_run(self, run_id: str) -> WorkflowRun | None:
        return self._active_runs.get(run_id)

    def resume(self, run_id: str) -> None:
        run = self._active_runs.get(run_id)
        if run:
            run._pause_event.set()

    def pause(self, run_id: str) -> None:
        run = self._active_runs.get(run_id)
        if run:
            run._pause_event.clear()
