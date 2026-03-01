"""
Mission Control — Validation Chain Executor
Every agent output passes through the Validator Agent before acceptance.
No exceptions. Strict sequential execution.
"""

from __future__ import annotations

import uuid
import structlog
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

logger = structlog.get_logger(__name__)

MAX_RETRIES = 2


class Verdict(str, Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"


class ValidationError(Exception):
    """Raised when validation chain cannot proceed due to a system error."""
    pass


@dataclass
class AgentOutput:
    """Structured output from any generating agent."""
    task_id: str
    agent_name: str
    output_type: str
    status: str
    output: dict[str, Any]
    null_fields: list[dict]
    confidence_scores: dict[str, Any]
    errors: list[str]
    warnings: list[str]


@dataclass
class ValidationFinding:
    check_number: int
    check_name: str
    severity: str  # FAIL | WARN | INFO
    field: str
    element: str
    output_value: Any
    db_value: Any
    verdict: str
    reason: str
    action_required: str


@dataclass
class ValidationReport:
    validator_id: str = "validator-agent-v1"
    task_id: str = ""
    validated_output_type: str = ""
    verdict: Verdict = Verdict.FAIL
    checks_run: int = 0
    checks_passed: int = 0
    checks_warned: int = 0
    checks_failed: int = 0
    db_queries_executed: int = 0
    findings: list[ValidationFinding] = field(default_factory=list)
    hallucination_findings: list[dict] = field(default_factory=list)
    db_query_log: list[dict] = field(default_factory=list)
    retry_count: int = 0
    escalate_to_operator: bool = False
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "validator_id": self.validator_id,
            "task_id": self.task_id,
            "validated_output_type": self.validated_output_type,
            "verdict": self.verdict.value,
            "checks_run": self.checks_run,
            "checks_passed": self.checks_passed,
            "checks_warned": self.checks_warned,
            "checks_failed": self.checks_failed,
            "db_queries_executed": self.db_queries_executed,
            "findings": [vars(f) for f in self.findings],
            "hallucination_findings": self.hallucination_findings,
            "db_query_log": self.db_query_log,
            "retry_count": self.retry_count,
            "escalate_to_operator": self.escalate_to_operator,
            "timestamp": self.timestamp,
        }


@dataclass
class ChainResult:
    """Final result of a complete validation chain execution."""
    task_id: str
    agent_name: str
    accepted: bool
    final_verdict: Verdict
    retry_count: int
    escalated: bool
    accepted_output: AgentOutput | None
    all_validation_reports: list[ValidationReport]
    operator_notification: dict | None = None
    context_budget_summary: dict | None = None  # Token usage across the chain


class ValidationChain:
    """
    Executes the validation chain for any agent output.

    Flow:
        Agent output → Validator (blind) → PASS/WARN/FAIL
        FAIL → retry with failure context → Validator again
        3 FAILs → escalate to operator

    The Validator never receives the generating agent's identity.
    This prevents bias in validation.
    """

    def __init__(
        self,
        validator_agent,  # ValidatorAgent instance
        db_agent,         # DBAgent instance for empirical DB queries
        notification_service,  # NotificationService for operator alerts
    ) -> None:
        self._validator = validator_agent
        self._db = db_agent
        self._notifications = notification_service

    async def execute(
        self,
        generating_agent,
        task: dict[str, Any],
    ) -> ChainResult:
        """
        Execute full validation chain for a single task.

        Args:
            generating_agent: The agent that produces output (identity hidden from validator)
            task: Task specification dict

        Returns:
            ChainResult with accepted output or escalation details
        """
        task_id = task.get("task_id", str(uuid.uuid4()))
        agent_name = getattr(generating_agent, "name", "unknown")
        all_reports: list[ValidationReport] = []
        failure_context: dict | None = None

        # Track token usage across the chain
        # Anthropic: multi-agent systems use ~15x more tokens than single-turn chats
        from backend.core.context_budget import ContextBudget, Tier
        chain_budget = ContextBudget(
            agent=f"chain:{agent_name}",
            tier=task.get("complexity", Tier.STANDARD),
        )

        for attempt in range(MAX_RETRIES + 1):
            logger.info(
                "validation_chain_attempt",
                task_id=task_id,
                attempt=attempt + 1,
                max_attempts=MAX_RETRIES + 1,
                context_pct=f"{chain_budget.pct_used:.0%}",
            )

            # Step 1: Generating agent produces output
            agent_output = await self._run_agent(
                generating_agent,
                task,
                failure_context=failure_context,
                attempt=attempt,
            )

            if agent_output is None:
                logger.error("validation_chain_agent_failed", task_id=task_id, attempt=attempt)
                continue

            # Charge token budget for agent output
            output_text = str(agent_output.output)
            from backend.core.context_budget import estimate_token_count
            chain_budget.charge(
                label=f"agent_output_attempt_{attempt}",
                tokens=estimate_token_count(output_text),
                discardable=True,  # Raw outputs can be discarded after validation
            )

            # Step 2: Validator receives output WITHOUT agent identity
            blind_output = self._strip_agent_identity(agent_output)
            report = await self._validator.validate(
                output=blind_output,
                task_context=task,
                retry_count=attempt,
            )
            report.task_id = task_id
            all_reports.append(report)

            # Charge budget for validation report (kept — needed for escalation)
            chain_budget.charge(
                label=f"validation_report_attempt_{attempt}",
                tokens=estimate_token_count(str(report)),
                discardable=False,
            )

            logger.info(
                "validation_chain_verdict",
                task_id=task_id,
                attempt=attempt + 1,
                verdict=report.verdict.value,
                checks_failed=report.checks_failed,
                context_tokens_used=chain_budget.used,
                context_should_compact=chain_budget.should_compact(),
            )

            # Step 3: Act on verdict
            if report.verdict == Verdict.PASS:
                return ChainResult(
                    task_id=task_id,
                    agent_name=generating_agent.name,
                    accepted=True,
                    final_verdict=Verdict.PASS,
                    retry_count=attempt,
                    escalated=False,
                    accepted_output=agent_output,
                    all_validation_reports=all_reports,
                    context_budget_summary=chain_budget.summary(),
                )

            if report.verdict == Verdict.WARN:
                notification = await self._notify_warn(task_id, report, agent_output)
                return ChainResult(
                    task_id=task_id,
                    agent_name=generating_agent.name,
                    accepted=True,
                    final_verdict=Verdict.WARN,
                    retry_count=attempt,
                    escalated=False,
                    accepted_output=agent_output,
                    all_validation_reports=all_reports,
                    operator_notification=notification,
                    context_budget_summary=chain_budget.summary(),
                )

            # FAIL — build failure context for next retry
            failure_context = self._build_failure_context(report)

        # All retries exhausted — escalate
        logger.warning(
            "validation_chain_escalating",
            task_id=task_id,
            total_attempts=MAX_RETRIES + 1,
            context_tokens_used=chain_budget.used,
        )
        escalation = await self._escalate(task_id, task, all_reports)

        return ChainResult(
            task_id=task_id,
            agent_name=generating_agent.name,
            accepted=False,
            final_verdict=Verdict.FAIL,
            retry_count=MAX_RETRIES,
            escalated=True,
            accepted_output=None,
            all_validation_reports=all_reports,
            operator_notification=escalation,
            context_budget_summary=chain_budget.summary(),
        )

    async def _run_agent(
        self,
        agent,
        task: dict,
        failure_context: dict | None,
        attempt: int,
    ) -> AgentOutput | None:
        try:
            task_with_context = {
                **task,
                "attempt": attempt,
                "failure_context": failure_context,
            }
            return await agent.execute(task_with_context)
        except Exception as e:
            logger.error(
                "agent_execution_error",
                agent=agent.name,
                error=str(e),
                attempt=attempt,
            )
            return None

    def _strip_agent_identity(self, output: AgentOutput) -> dict:
        """Remove agent identity from output before passing to Validator."""
        d = {
            "task_id": output.task_id,
            "output_type": output.output_type,
            "status": output.status,
            "output": output.output,
            "null_fields": output.null_fields,
            "confidence_scores": output.confidence_scores,
            "errors": output.errors,
            "warnings": output.warnings,
            # agent_name intentionally excluded
        }
        return d

    def _build_failure_context(self, report: ValidationReport) -> dict:
        """
        Build structured failure context for the generating agent's retry.
        Includes exact findings but not validator identity.
        """
        return {
            "previous_attempt_failed": True,
            "failed_fields": [
                {
                    "field": f.field,
                    "element": f.element,
                    "reason": f.reason,
                    "action_required": f.action_required,
                    "db_value": f.db_value,
                }
                for f in report.findings
                if f.verdict == "FAIL"
            ],
            "hallucination_findings": report.hallucination_findings,
            "instruction": (
                "Address only the specific failed fields listed above. "
                "Do not modify fields that are not listed. "
                "Apply null_policy module to all failed fields with no DB value."
            ),
        }

    async def _notify_warn(
        self,
        task_id: str,
        report: ValidationReport,
        output: AgentOutput,
    ) -> dict:
        notification = {
            "type": "validation_warn",
            "task_id": task_id,
            "output_type": output.output_type,
            "warnings": [f.reason for f in report.findings if f.severity == "WARN"],
            "action_required": "operator_review",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._notifications.send(notification)
        return notification

    async def _escalate(
        self,
        task_id: str,
        task: dict,
        all_reports: list[ValidationReport],
    ) -> dict:
        escalation = {
            "type": "validation_escalation",
            "task_id": task_id,
            "task": task,
            "total_attempts": MAX_RETRIES + 1,
            "all_validation_reports": [r.to_dict() for r in all_reports],
            "repeatedly_failed_fields": self._summarize_repeated_failures(all_reports),
            "action_required": "operator_decision",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._notifications.send(escalation)
        return escalation

    def _summarize_repeated_failures(
        self, reports: list[ValidationReport]
    ) -> list[dict]:
        """Identify fields that failed across multiple attempts."""
        field_failures: dict[str, list] = {}
        for report in reports:
            for finding in report.findings:
                if finding.verdict == "FAIL":
                    key = f"{finding.element}.{finding.field}"
                    if key not in field_failures:
                        field_failures[key] = []
                    field_failures[key].append({
                        "reason": finding.reason,
                        "db_value": finding.db_value,
                        "output_value": finding.output_value,
                    })
        return [
            {"field_key": k, "failure_count": len(v), "details": v}
            for k, v in field_failures.items()
            if len(v) > 1
        ]
