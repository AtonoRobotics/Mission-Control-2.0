"""
backend/core/enforcement.py
Runtime enforcement of Anthropic best practices.

Every agent call passes through enforce_before_dispatch() and every agent
output passes through enforce_after_output(). Violations are BLOCKING —
they prevent dispatch or registration, not just logged.

Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents
Source: anthropic.com/research/building-effective-agents
Source: docs/GUARDRAILS.md
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

from backend.core.context_budget import ContextBudget, get_budget_for_agent
from backend.integrity.placeholder_scanner import scan_for_placeholders
from backend.integrity.scope_guard import ScopeGuard
from backend.integrity.intent_verifier import IntentVerifier, TaskIntent

log = structlog.get_logger()


class EnforcementLevel(str, Enum):
    BLOCK = "BLOCK"    # Stop execution entirely
    WARN = "WARN"      # Proceed with operator notice
    INFO = "INFO"      # Log only


@dataclass
class EnforcementViolation:
    rule: str
    level: EnforcementLevel
    message: str
    detail: str | None = None
    remediation: str | None = None


@dataclass
class EnforcementResult:
    passed: bool
    violations: list[EnforcementViolation] = field(default_factory=list)
    warnings: list[EnforcementViolation] = field(default_factory=list)

    @property
    def block_count(self) -> int:
        return sum(1 for v in self.violations if v.level == EnforcementLevel.BLOCK)

    def summary(self) -> str:
        if self.passed:
            return f"PASS ({len(self.warnings)} warnings)"
        return f"BLOCK ({self.block_count} violations, {len(self.warnings)} warnings)"


_scope_guard = ScopeGuard()
_intent_verifier = IntentVerifier()


# ── Pre-dispatch enforcement ───────────────────────────────────────────────────

def enforce_before_dispatch(
    agent_name: str,
    task_intent: TaskIntent,
    assembled_prompt_tokens: int,
    modules_loaded: list[str],
) -> EnforcementResult:
    """
    Called by orchestrator before dispatching to any agent.
    Checks: context budget, module validity, intent completeness.

    Anthropic: "Good context engineering means finding the smallest possible
    set of high-signal tokens that maximize the likelihood of desired outcome."
    """
    violations: list[EnforcementViolation] = []
    warnings: list[EnforcementViolation] = []

    budget = get_budget_for_agent(agent_name)

    # Rule: context budget
    if assembled_prompt_tokens > budget.max_prompt_tokens:
        violations.append(EnforcementViolation(
            rule="CONTEXT-001",
            level=EnforcementLevel.BLOCK,
            message=f"Prompt exceeds budget for {agent_name}",
            detail=f"{assembled_prompt_tokens} tokens > {budget.max_prompt_tokens} limit",
            remediation="Remove low-signal modules. Load domain skills only if needed.",
        ))
    elif assembled_prompt_tokens > budget.max_prompt_tokens * 0.85:
        warnings.append(EnforcementViolation(
            rule="CONTEXT-001W",
            level=EnforcementLevel.WARN,
            message=f"Prompt approaching budget limit for {agent_name}",
            detail=f"{assembled_prompt_tokens} / {budget.max_prompt_tokens} tokens",
        ))

    # Rule: task intent completeness
    if not task_intent.task_id:
        violations.append(EnforcementViolation(
            rule="DISPATCH-001",
            level=EnforcementLevel.BLOCK,
            message="TaskIntent missing task_id",
            remediation="Orchestrator must set a unique task_id before dispatch.",
        ))

    if not task_intent.expected_output_type:
        violations.append(EnforcementViolation(
            rule="DISPATCH-002",
            level=EnforcementLevel.BLOCK,
            message="TaskIntent missing expected_output_type",
            remediation="Declare expected output type before dispatch.",
        ))

    if task_intent.robot_id is None:
        warnings.append(EnforcementViolation(
            rule="DISPATCH-003W",
            level=EnforcementLevel.WARN,
            message="TaskIntent has no robot_id — valid only for non-robot-specific tasks",
        ))

    # Rule: module list not empty
    if not modules_loaded:
        violations.append(EnforcementViolation(
            rule="DISPATCH-004",
            level=EnforcementLevel.BLOCK,
            message="No prompt modules loaded for agent",
            remediation="Check AGENT_MODULE_MANIFEST in prompt_loader.py",
        ))

    # Rule: core modules always present
    required_core = {"modules/core/never_do", "modules/core/null_policy", "modules/core/output_schema"}
    loaded_set = set(modules_loaded)
    missing_core = required_core - loaded_set
    if missing_core:
        violations.append(EnforcementViolation(
            rule="DISPATCH-005",
            level=EnforcementLevel.BLOCK,
            message=f"Required core modules missing: {missing_core}",
            remediation="Add missing modules to AGENT_MODULE_MANIFEST",
        ))

    passed = len([v for v in violations if v.level == EnforcementLevel.BLOCK]) == 0

    log.info(
        "enforcement.pre_dispatch",
        agent=agent_name,
        task_id=task_intent.task_id,
        result=("PASS" if passed else "BLOCK"),
        violations=len(violations),
        prompt_tokens=assembled_prompt_tokens,
    )

    return EnforcementResult(passed=passed, violations=violations, warnings=warnings)


# ── Post-output enforcement ────────────────────────────────────────────────────

def enforce_after_output(
    agent_name: str,
    output: dict[str, Any],
    task_intent: TaskIntent,
) -> EnforcementResult:
    """
    Called on every agent output before it enters the validation chain.
    Blocks outputs that violate structural rules before spending validator tokens.

    Anthropic: "Treat context as precious. Fast structural checks before expensive LLM validation."
    """
    violations: list[EnforcementViolation] = []
    warnings: list[EnforcementViolation] = []

    # Rule: placeholder detection (deterministic, no LLM)
    findings = scan_for_placeholders(output)
    for f in findings:
        if f.severity == "CRITICAL":
            violations.append(EnforcementViolation(
                rule=f.rule,
                level=EnforcementLevel.BLOCK,
                message=f.message,
                remediation="Replace placeholder with verified value or NULL.",
            ))
        else:
            warnings.append(EnforcementViolation(
                rule=f.rule,
                level=EnforcementLevel.WARN,
                message=f.message,
            ))

    # Rule: scope boundaries
    scope_violations = _scope_guard.check(agent_name, output)
    for v in scope_violations:
        violations.append(EnforcementViolation(
            rule=v.rule,
            level=EnforcementLevel.BLOCK,
            message=f"Scope violation: {v.detail}",
            remediation=f"Agent {agent_name} produced output outside its declared scope.",
        ))

    # Rule: intent verification
    intent_violations = _intent_verifier.verify(task_intent, output)
    for v in intent_violations:
        violations.append(EnforcementViolation(
            rule=v.rule,
            level=EnforcementLevel.BLOCK,
            message=v.message,
        ))

    # Rule: output summary token limit (Anthropic: sub-agents return ≤ 2000 token summaries)
    summary = output.get("output_summary", "")
    if summary:
        estimated_tokens = len(summary.split()) * 1.3  # rough estimate
        if estimated_tokens > 2000:
            warnings.append(EnforcementViolation(
                rule="CONTEXT-002W",
                level=EnforcementLevel.WARN,
                message="output_summary may exceed 2000 token recommendation",
                detail=f"Estimated ~{int(estimated_tokens)} tokens",
                remediation="Condense summary. Full content goes to registry, not to orchestrator.",
            ))

    # Rule: required output fields present
    required_fields = {
        "status", "agent", "task_id", "output_type",
        "spec_version", "guardrails_version", "empirical_db_schema_version",
        "generated_at", "output", "null_fields", "confidence_scores",
    }
    missing = required_fields - set(output.keys())
    for f in missing:
        violations.append(EnforcementViolation(
            rule="SCHEMA-001",
            level=EnforcementLevel.BLOCK,
            message=f"Required output field missing: '{f}'",
            remediation="Check modules/core/output_schema.md for required fields.",
        ))

    # Rule: confidence score range (0.01-0.79 invalid)
    for field_name, score_obj in output.get("confidence_scores", {}).items():
        score = score_obj.get("score", -1) if isinstance(score_obj, dict) else score_obj
        if isinstance(score, (int, float)) and 0.01 <= score <= 0.79:
            violations.append(EnforcementViolation(
                rule="L1-R4",
                level=EnforcementLevel.BLOCK,
                message=f"Invalid confidence score {score} for '{field_name}'",
                detail="Valid range: 0.0 (→ NULL) or 0.80-1.00 (→ DB-verified)",
                remediation="Score must be 0.0 (value is NULL) or ≥0.80 (value is DB-verified).",
            ))

    passed = len([v for v in violations if v.level == EnforcementLevel.BLOCK]) == 0

    log.info(
        "enforcement.post_output",
        agent=agent_name,
        task_id=output.get("task_id"),
        result=("PASS" if passed else "BLOCK"),
        violations=len(violations),
    )

    return EnforcementResult(passed=passed, violations=violations, warnings=warnings)


# ── Prompt content enforcement (runs on assembled prompt string) ──────────────

def enforce_prompt_content(prompt_text: str, agent_name: str) -> EnforcementResult:
    """
    Checks assembled prompt for anti-patterns before sending to API.

    Anthropic: "The right altitude — not brittle step-by-step, not vague guidance."
    """
    violations: list[EnforcementViolation] = []
    warnings: list[EnforcementViolation] = []
    lines = prompt_text.split("\n")

    # Anti-pattern: numbered procedure lists (> 5 numbered steps in a row)
    consecutive_numbered = 0
    for line in lines:
        stripped = line.strip()
        if stripped and stripped[0].isdigit() and ". " in stripped[:4]:
            consecutive_numbered += 1
            if consecutive_numbered > 5:
                warnings.append(EnforcementViolation(
                    rule="ALTITUDE-001W",
                    level=EnforcementLevel.WARN,
                    message=f"Prompt for {agent_name} contains long numbered procedure list",
                    detail="Anthropic: prompts should declare intent, not step-by-step procedure.",
                    remediation="Move procedural logic to backend/integrity/ code.",
                ))
                break
        else:
            consecutive_numbered = 0

    # Anti-pattern: prompt too long (> 100 lines is usually a sign of over-specification)
    if len(lines) > 100:
        warnings.append(EnforcementViolation(
            rule="ALTITUDE-002W",
            level=EnforcementLevel.WARN,
            message=f"Assembled prompt for {agent_name} is {len(lines)} lines",
            detail="Consider splitting modules or using progressive disclosure via Skills.",
        ))

    passed = len([v for v in violations if v.level == EnforcementLevel.BLOCK]) == 0
    return EnforcementResult(passed=passed, violations=violations, warnings=warnings)
