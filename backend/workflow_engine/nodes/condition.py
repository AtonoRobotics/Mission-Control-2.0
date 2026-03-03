"""
Mission Control — Condition Workflow Nodes
Branching logic for workflow graphs: if/else, threshold, null gate, switch.
"""

import operator as op
import re
import structlog
from typing import Any, TYPE_CHECKING

from workflow_engine.node_registry import NodeHandler

if TYPE_CHECKING:
    from workflow_engine.executor import WorkflowRun

logger = structlog.get_logger(__name__)

# Operators supported by ConditionThresholdNode
_THRESHOLD_OPS: dict[str, Any] = {
    "gt": op.gt,
    "lt": op.lt,
    "gte": op.ge,
    "lte": op.le,
    "eq": op.eq,
}

# Pattern for simple comparison expressions: "variable operator value"
# Supports: ==, !=, >, <, >=, <=
_EXPR_PATTERN = re.compile(
    r"^(?P<lhs>[a-zA-Z_][a-zA-Z0-9_.]*)"
    r"\s*(?P<op>==|!=|>=|<=|>|<)\s*"
    r"(?P<rhs>.+)$"
)

_EXPR_OPS: dict[str, Any] = {
    "==": op.eq,
    "!=": op.ne,
    ">": op.gt,
    "<": op.lt,
    ">=": op.ge,
    "<=": op.le,
}


def _flatten_context(context: dict[str, Any]) -> dict[str, Any]:
    """Flatten context into a single namespace for expression evaluation.

    Given {"node_a": {"status": "ok", "count": 5}}, produces
    {"node_a.status": "ok", "node_a.count": 5, "status": "ok", "count": 5}.
    Later node values overwrite earlier ones for short names.
    """
    flat: dict[str, Any] = {}
    for node_id, outputs in context.items():
        if not isinstance(outputs, dict):
            continue
        for key, value in outputs.items():
            flat[f"{node_id}.{key}"] = value
            flat[key] = value  # short name (last writer wins)
    return flat


def _coerce_value(raw: str) -> int | float | bool | str | None:
    """Coerce a string token from an expression into a typed Python value."""
    stripped = raw.strip()

    # Quoted string
    if (stripped.startswith("'") and stripped.endswith("'")) or (
        stripped.startswith('"') and stripped.endswith('"')
    ):
        return stripped[1:-1]

    # Boolean
    if stripped.lower() == "true":
        return True
    if stripped.lower() == "false":
        return False

    # None
    if stripped.lower() in ("none", "null"):
        return None

    # Numeric
    try:
        return int(stripped)
    except ValueError:
        pass
    try:
        return float(stripped)
    except ValueError:
        pass

    # Fallback: plain string
    return stripped


class ConditionIfNode(NodeHandler):
    """
    Evaluate a simple comparison expression against flattened context values.

    params:
        expression: str — e.g. "result == 'ok'" or "count > 5"

    The left-hand side must be a variable name present in the flattened context.
    The right-hand side is auto-coerced to the appropriate type.

    Output: {"status": "ok", "chosen_branch": "true"|"false"}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        expression = params.get("expression", "")
        match = _EXPR_PATTERN.match(expression.strip())
        if not match:
            logger.warning(
                "condition_if_invalid_expression",
                expression=expression,
                run_id=run.run_id,
            )
            return {
                "status": "failed",
                "error": f"Invalid expression: {expression!r}. "
                         f"Expected format: 'variable op value'",
            }

        lhs_name = match.group("lhs")
        cmp_op = _EXPR_OPS[match.group("op")]
        rhs_raw = match.group("rhs")

        flat = _flatten_context(context)
        if lhs_name not in flat:
            logger.warning(
                "condition_if_variable_not_found",
                variable=lhs_name,
                run_id=run.run_id,
            )
            return {
                "status": "failed",
                "error": f"Variable not found in context: {lhs_name!r}",
            }

        lhs_value = flat[lhs_name]
        rhs_value = _coerce_value(rhs_raw)

        try:
            result = cmp_op(lhs_value, rhs_value)
        except TypeError:
            result = False

        branch = "true" if result else "false"
        logger.info(
            "condition_if_evaluated",
            expression=expression,
            result=branch,
            run_id=run.run_id,
        )
        return {"status": "ok", "chosen_branch": branch}


class ConditionThresholdNode(NodeHandler):
    """
    Compare a numeric field from a source node against a threshold.

    params:
        source_node: str — node_id whose output contains the field
        field: str — key in that node's output
        threshold: int | float — value to compare against
        operator: str — one of "gt", "lt", "gte", "lte", "eq"

    Output: {"status": "ok", "chosen_branch": "true"|"false"}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node", "")
        field = params.get("field", "")
        threshold = params.get("threshold")
        operator_name = params.get("operator", "")

        if operator_name not in _THRESHOLD_OPS:
            return {
                "status": "failed",
                "error": f"Unknown operator: {operator_name!r}. "
                         f"Must be one of: {', '.join(_THRESHOLD_OPS)}",
            }

        node_output = context.get(source_node)
        if node_output is None or not isinstance(node_output, dict):
            return {
                "status": "failed",
                "error": f"Source node not found in context: {source_node!r}",
            }

        value = node_output.get(field)
        if value is None:
            return {
                "status": "failed",
                "error": f"Field {field!r} not found in output of {source_node!r}",
            }

        try:
            result = _THRESHOLD_OPS[operator_name](float(value), float(threshold))
        except (TypeError, ValueError) as e:
            return {
                "status": "failed",
                "error": f"Cannot compare {value!r} against threshold {threshold!r}: {e}",
            }

        branch = "true" if result else "false"
        logger.info(
            "condition_threshold_evaluated",
            source_node=source_node,
            field=field,
            value=value,
            operator=operator_name,
            threshold=threshold,
            result=branch,
            run_id=run.run_id,
        )
        return {"status": "ok", "chosen_branch": branch}


class ConditionNullGateNode(NodeHandler):
    """
    Check whether specified fields in context are present (not None).

    params:
        fields: list[dict] — each dict has "node" and "field" keys
        mode: str — "all_present" (default) or "any_present"

    Output: {"status": "ok", "chosen_branch": "true"|"false"}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        fields = params.get("fields", [])
        mode = params.get("mode", "all_present")

        if not fields:
            return {
                "status": "failed",
                "error": "No fields specified for null gate check",
            }

        present_flags: list[bool] = []
        for field_spec in fields:
            node_id = field_spec.get("node", "")
            field_name = field_spec.get("field", "")
            node_output = context.get(node_id)
            if node_output is None or not isinstance(node_output, dict):
                present_flags.append(False)
            else:
                present_flags.append(node_output.get(field_name) is not None)

        if mode == "any_present":
            gate_passed = any(present_flags)
        else:
            gate_passed = all(present_flags)

        branch = "true" if gate_passed else "false"
        logger.info(
            "condition_null_gate_evaluated",
            mode=mode,
            field_count=len(fields),
            present_count=sum(present_flags),
            result=branch,
            run_id=run.run_id,
        )
        return {"status": "ok", "chosen_branch": branch}


class ConditionSwitchNode(NodeHandler):
    """
    Match a field value against a set of named cases.

    params:
        source_node: str — node_id whose output contains the field
        field: str — key in that node's output
        cases: dict[str, str] — maps value -> branch name
        default: str — fallback branch if no case matches

    Output: {"status": "ok", "chosen_branch": "<branch_name>"}
    """

    async def execute(
        self, params: dict[str, Any], context: dict[str, Any], run: "WorkflowRun"
    ) -> dict[str, Any]:
        source_node = params.get("source_node", "")
        field = params.get("field", "")
        cases = params.get("cases", {})
        default_branch = params.get("default", "default")

        node_output = context.get(source_node)
        if node_output is None or not isinstance(node_output, dict):
            return {
                "status": "failed",
                "error": f"Source node not found in context: {source_node!r}",
            }

        value = node_output.get(field)
        if value is None:
            branch = default_branch
        else:
            # Convert value to string for case matching
            branch = cases.get(str(value), default_branch)

        logger.info(
            "condition_switch_evaluated",
            source_node=source_node,
            field=field,
            value=value,
            chosen_branch=branch,
            run_id=run.run_id,
        )
        return {"status": "ok", "chosen_branch": branch}
