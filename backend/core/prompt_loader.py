"""
Mission Control — Prompt Module Loader
Assembles agent prompts from small, focused modules at runtime.
No monolithic prompts. Each module < 50 lines with a single responsibility.

Context budget is checked at assembly time.
Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents
"""

from __future__ import annotations

import structlog
from pathlib import Path
from functools import lru_cache

from backend.core.context_budget import check_module_list_fits_budget

logger = structlog.get_logger(__name__)

PROMPTS_ROOT = Path(__file__).parent.parent.parent / "prompts"

# Module manifest: which modules each agent loads, in order.
# Order matters — earlier modules take precedence in case of conflict.
AGENT_MODULE_MANIFEST: dict[str, list[str]] = {
    "urdf_build": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/cinema_robot",
        "agents/urdf_build/role",
        "agents/urdf_build/joint_rules",
        "agents/urdf_build/link_rules",
    ],
    "usd_conversion": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/cinema_robot",
        "modules/domain/isaac_containers",
    ],
    "scene_build": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/cinema_robot",
    ],
    "sensor_config": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/ros2_constraints",
    ],
    "launch_file": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/ros2_constraints",
        "modules/domain/isaac_containers",
    ],
    "curob_config": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/curob_role",
        "modules/domain/cinema_robot",
    ],
    "script_generation": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/domain/cinema_robot",
        "modules/domain/isaac_containers",
        "modules/domain/curob_role",
    ],
    "audit": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/db_verify",
    ],
    "validator": [
        "modules/core/null_policy",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/validation/db_verify",
        "modules/validation/hallucination_flags",
        "modules/domain/curob_role",
        "modules/domain/isaac_containers",
        "agents/validator/role",
        "agents/validator/checklist",
        "agents/validator/output_schema",
    ],
    "orchestrator": [
        "modules/core/null_policy",
        "modules/core/never_do",
        "agents/orchestrator/validation_chain",
    ],
    "db_agent": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/db_verify",
    ],
    "file_agent": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/validation/confidence_score",
    ],
    "container_agent": [
        "modules/core/null_policy",
        "modules/core/output_schema",
        "modules/core/never_do",
        "modules/domain/isaac_containers",
    ],
}


@lru_cache(maxsize=64)
def _load_module(module_path: str) -> str:
    """Load a single prompt module from disk. Cached after first read."""
    full_path = PROMPTS_ROOT / f"{module_path}.md"
    if not full_path.exists():
        raise FileNotFoundError(
            f"Prompt module not found: {full_path}\n"
            f"Ensure the module exists before dispatching to this agent."
        )
    return full_path.read_text(encoding="utf-8")


def assemble_prompt(agent_name: str, extra_context: dict | None = None) -> str:
    """
    Assemble the full system prompt for an agent by loading and concatenating
    its declared modules in order.

    Args:
        agent_name: Key into AGENT_MODULE_MANIFEST
        extra_context: Optional runtime context injected at the end
                       (robot_id, task_id, specific params)

    Returns:
        Complete assembled prompt string
    """
    if agent_name not in AGENT_MODULE_MANIFEST:
        raise ValueError(
            f"Unknown agent: '{agent_name}'. "
            f"Valid agents: {sorted(AGENT_MODULE_MANIFEST.keys())}"
        )

    modules = AGENT_MODULE_MANIFEST[agent_name]
    sections: list[str] = []

    for module_path in modules:
        try:
            content = _load_module(module_path)
            sections.append(content)
            logger.debug("prompt_module_loaded", agent=agent_name, module=module_path)
        except FileNotFoundError as e:
            logger.error("prompt_module_missing", agent=agent_name, module=module_path)
            raise RuntimeError(
                f"Cannot assemble prompt for agent '{agent_name}': {e}"
            ) from e

    prompt = "\n\n---\n\n".join(sections)

    if extra_context:
        context_block = "\n\n---\n\n## Runtime Context\n\n"
        for key, value in extra_context.items():
            context_block += f"- **{key}:** {value}\n"
        prompt += context_block

    # Context budget enforcement
    # Anthropic: "Find the smallest possible set of high-signal tokens."
    # Log a warning when over budget — does not raise, to avoid cascading failures.
    module_contents = {m: s for m, s in zip(modules, sections)}
    fits, estimated_tokens, budget = check_module_list_fits_budget(agent_name, module_contents)

    logger.info(
        "prompt_assembled",
        agent=agent_name,
        module_count=len(modules),
        estimated_tokens=estimated_tokens,
        token_budget=budget,
        within_budget=fits,
        total_chars=len(prompt),
    )

    return prompt


def list_modules_for_agent(agent_name: str) -> list[str]:
    """Return the list of modules that will be loaded for an agent."""
    if agent_name not in AGENT_MODULE_MANIFEST:
        raise ValueError(f"Unknown agent: '{agent_name}'")
    return AGENT_MODULE_MANIFEST[agent_name]


def validate_all_modules_exist() -> dict[str, list[str]]:
    """
    Validate that every module referenced in the manifest exists on disk.
    Run at startup. Returns dict of missing modules per agent.
    Call this before serving any requests.
    """
    missing: dict[str, list[str]] = {}

    for agent_name, modules in AGENT_MODULE_MANIFEST.items():
        for module_path in modules:
            full_path = PROMPTS_ROOT / f"{module_path}.md"
            if not full_path.exists():
                if agent_name not in missing:
                    missing[agent_name] = []
                missing[agent_name].append(str(full_path))

    if missing:
        for agent, paths in missing.items():
            logger.error("missing_prompt_modules", agent=agent, paths=paths)

    return missing


# ── Update manifest to include tool interfaces and complexity scaling ──────────
# Add to existing AGENT_MODULE_MANIFEST entries:

AGENT_MODULE_MANIFEST_V2_ADDITIONS = {
    "orchestrator": [
        "modules/core/null_policy",
        "modules/core/never_do",
        "modules/core/context_budget",        # Context awareness
        "modules/core/thinking_triggers",     # think/think hard/ultrathink
        "agents/orchestrator/validation_chain",
        "agents/orchestrator/task_complexity",
        "agents/orchestrator/parallel_dispatch",
        "tools/db_agent",
        "tools/file_agent",
        "tools/container_agent",
    ],
    "validator": [
        "modules/core/null_policy",
        "modules/core/never_do",
        "modules/validation/confidence_score",
        "modules/validation/db_verify",
        "modules/validation/hallucination_flags",
        "modules/domain/curob_role",
        "modules/domain/isaac_containers",
        "agents/validator/role",
        "agents/validator/checklist",
        "agents/validator/output_schema",
    ],
}

# Merge additions into primary manifest
for agent_name, modules in AGENT_MODULE_MANIFEST_V2_ADDITIONS.items():
    AGENT_MODULE_MANIFEST[agent_name] = modules
