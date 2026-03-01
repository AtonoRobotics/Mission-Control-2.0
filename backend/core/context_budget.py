"""
backend/core/context_budget.py
Per-agent token budget enforcement.

Anthropic: "Find the smallest possible set of high-signal tokens that maximize
the likelihood of the desired outcome. Context must be treated as a finite
resource with diminishing marginal returns."

Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents

Budgets are set conservatively. Raise them only with justification and CI approval.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

log = structlog.get_logger()


@dataclass(frozen=True)
class AgentBudget:
    """Token budget for a single agent type."""
    agent_name: str
    max_prompt_tokens: int    # System prompt + modules. Anthropic: keep minimal.
    max_output_tokens: int    # Agent's response. Sub-agents: ≤ 2000 for summaries.
    warn_threshold: float = 0.85   # Warn at this fraction of max_prompt_tokens

    # Source modules that are always loaded (baseline token cost)
    baseline_modules: tuple[str, ...] = (
        "modules/core/never_do",
        "modules/core/null_policy",
        "modules/core/output_schema",
    )


# ── Agent budgets ─────────────────────────────────────────────────────────────
# These are the MAXIMUM token counts. Actual costs depend on modules loaded.
# Anthropic guidance: agents use ~4x more tokens than chat interactions.
# Multi-agent systems use ~15x more. Budget accordingly.

AGENT_BUDGETS: dict[str, AgentBudget] = {

    "orchestrator": AgentBudget(
        agent_name="orchestrator",
        max_prompt_tokens=5_000,   # Needs task complexity + tool interfaces
        max_output_tokens=1_500,   # Returns TaskIntent dispatch plans, not content
    ),

    "urdf_build": AgentBudget(
        agent_name="urdf_build",
        max_prompt_tokens=4_000,   # Role + joint rules + link rules + domain context
        max_output_tokens=8_000,   # Full URDF XML can be substantial
    ),

    "validator": AgentBudget(
        agent_name="validator",
        max_prompt_tokens=3_000,   # Role + checklist + verification modules
        max_output_tokens=2_000,   # Verdict + findings — concise by design
    ),

    "curob_config": AgentBudget(
        agent_name="curob_config",
        max_prompt_tokens=2_500,   # Role + domain + forbidden params
        max_output_tokens=2_000,   # YAML config — compact by nature
    ),

    "script_generation": AgentBudget(
        agent_name="script_generation",
        max_prompt_tokens=3_500,   # Role + container context + import rules
        max_output_tokens=6_000,   # Python scripts can be multi-function
    ),

    "usd_conversion": AgentBudget(
        agent_name="usd_conversion",
        max_prompt_tokens=2_500,   # Role + Isaac pipeline context
        max_output_tokens=3_000,   # USD config / conversion parameters
    ),

    "scene_build": AgentBudget(
        agent_name="scene_build",
        max_prompt_tokens=3_000,   # Role + Isaac Sim scene context
        max_output_tokens=3_000,   # Scene YAML config
    ),

    "sensor_config": AgentBudget(
        agent_name="sensor_config",
        max_prompt_tokens=2_500,   # Role + ZED X context
        max_output_tokens=2_000,   # Sensor YAML — compact
    ),

    "launch_file": AgentBudget(
        agent_name="launch_file",
        max_prompt_tokens=3_000,   # Role + ROS2 topology context
        max_output_tokens=3_000,   # Python launch file
    ),

    "audit": AgentBudget(
        agent_name="audit",
        max_prompt_tokens=4_000,   # Role + drift detection + all validation modules
        max_output_tokens=4_000,   # Comprehensive audit report
    ),

    # Infrastructure agents — these don't call the LLM directly, so
    # budgets represent their MCP tool response payload sizes
    "db_agent": AgentBudget(
        agent_name="db_agent",
        max_prompt_tokens=0,       # No LLM — reads DB and returns data
        max_output_tokens=5_000,   # DB query results can include many rows
    ),

    "file_agent": AgentBudget(
        agent_name="file_agent",
        max_prompt_tokens=0,       # No LLM — registers/retrieves artifacts
        max_output_tokens=1_000,   # Registry IDs and metadata only
    ),

    "container_agent": AgentBudget(
        agent_name="container_agent",
        max_prompt_tokens=0,       # No LLM — docker exec wrapper
        max_output_tokens=10_000,  # Script stdout can be verbose
    ),
}


def get_budget_for_agent(agent_name: str) -> AgentBudget:
    if agent_name not in AGENT_BUDGETS:
        log.warning("context_budget.unknown_agent", agent=agent_name)
        # Return a conservative default
        return AgentBudget(
            agent_name=agent_name,
            max_prompt_tokens=3_000,
            max_output_tokens=2_000,
        )
    return AGENT_BUDGETS[agent_name]


def estimate_token_count(text: str) -> int:
    """Rough token estimate: words * 1.3 (English prose heuristic)."""
    return int(len(text.split()) * 1.3)


def check_module_list_fits_budget(
    agent_name: str,
    module_contents: dict[str, str],
) -> tuple[bool, int, int]:
    """
    Check whether a proposed module set fits within the agent's prompt budget.

    Returns (fits: bool, estimated_tokens: int, budget: int)
    """
    budget = get_budget_for_agent(agent_name)
    total_text = "\n".join(module_contents.values())
    estimated = estimate_token_count(total_text)

    if estimated > budget.max_prompt_tokens:
        log.warning(
            "context_budget.over_limit",
            agent=agent_name,
            estimated_tokens=estimated,
            budget=budget.max_prompt_tokens,
            over_by=estimated - budget.max_prompt_tokens,
        )
        return False, estimated, budget.max_prompt_tokens

    if estimated > budget.max_prompt_tokens * budget.warn_threshold:
        log.warning(
            "context_budget.approaching_limit",
            agent=agent_name,
            estimated_tokens=estimated,
            budget=budget.max_prompt_tokens,
        )

    return True, estimated, budget.max_prompt_tokens


def get_budget_report() -> dict[str, dict]:
    """Return a summary of all agent budgets for monitoring."""
    return {
        name: {
            "max_prompt_tokens": b.max_prompt_tokens,
            "max_output_tokens": b.max_output_tokens,
            "total_context": b.max_prompt_tokens + b.max_output_tokens,
        }
        for name, b in AGENT_BUDGETS.items()
        if b.max_prompt_tokens > 0  # Exclude infrastructure agents
    }
