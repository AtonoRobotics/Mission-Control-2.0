"""
Mission Control — Intent Verifier
Detects prompt misinterpretation: output that is adjacent to the task but wrong.
Implements L2-R3 from GUARDRAILS.md.

The orchestrator declares machine-readable intent with every task.
This verifier checks the output fulfills that exact intent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TaskIntent:
    """
    Machine-readable declaration of what a task is supposed to produce.
    Orchestrator populates this before dispatching to any generating agent.
    """
    task_id: str
    task_description: str                    # Human-readable, for logs
    expected_output_type: str                # Must match scope registry
    expected_agent: str                      # Which agent should handle this
    robot_id: int | None = None              # Required for robot-specific tasks
    expected_joint_count_min: int | None = None
    expected_joint_count_max: int | None = None
    expected_link_count_min: int | None = None
    expected_link_count_max: int | None = None
    expected_fields_present: list[str] | None = None   # Fields that must appear in output
    expected_fields_absent: list[str] | None = None    # Fields that must NOT appear
    expected_target_container: str | None = None       # For script generation tasks
    base_locked: bool | None = None                    # For URDF builds


@dataclass
class IntentViolation:
    task_id: str
    violation_type: str
    expected: Any
    found: Any
    severity: str = "CRITICAL"
    rule: str = "L2-R3"
    message: str = ""


class IntentVerifier:
    """
    Verifies agent output against the declared task intent.
    Runs after scope guard, before DB cross-check.
    """

    def verify(self, intent: TaskIntent, output: dict) -> list[IntentViolation]:
        violations: list[IntentViolation] = []

        violations.extend(self._check_output_type(intent, output))
        violations.extend(self._check_task_id(intent, output))
        violations.extend(self._check_robot_id(intent, output))
        violations.extend(self._check_joint_count(intent, output))
        violations.extend(self._check_link_count(intent, output))
        violations.extend(self._check_required_fields(intent, output))
        violations.extend(self._check_forbidden_fields(intent, output))
        violations.extend(self._check_target_container(intent, output))
        violations.extend(self._check_base_joint(intent, output))

        return violations

    def _check_output_type(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        actual = output.get("output_type") or output.get("validated_output_type")
        if actual != intent.expected_output_type:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="wrong_output_type",
                expected=intent.expected_output_type,
                found=actual,
                message=(
                    f"Task intended output type '{intent.expected_output_type}' "
                    f"but agent produced '{actual}'. "
                    f"Agent may have misinterpreted the task or been dispatched incorrectly."
                ),
            )]
        return []

    def _check_task_id(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if output.get("task_id") != intent.task_id:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="task_id_mismatch",
                expected=intent.task_id,
                found=output.get("task_id"),
                message=(
                    f"Output task_id '{output.get('task_id')}' does not match "
                    f"dispatched task_id '{intent.task_id}'. "
                    f"Output may be from a different task."
                ),
            )]
        return []

    def _check_robot_id(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if intent.robot_id is None:
            return []
        actual = output.get("robot_id")
        if actual != intent.robot_id:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="wrong_robot_id",
                expected=intent.robot_id,
                found=actual,
                message=(
                    f"Task was for robot_id={intent.robot_id} "
                    f"but output declares robot_id={actual}. "
                    f"Agent may have processed the wrong robot."
                ),
            )]
        return []

    def _check_joint_count(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if intent.expected_joint_count_min is None:
            return []
        actual = output.get("joint_count")
        if actual is None:
            return []  # Joint count may not be in all output types
        lo = intent.expected_joint_count_min
        hi = intent.expected_joint_count_max or lo
        if not (lo <= actual <= hi):
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="joint_count_out_of_range",
                expected=f"{lo}–{hi}",
                found=actual,
                message=(
                    f"Output has {actual} joints but task expected {lo}–{hi}. "
                    f"Robot may have been built against wrong joint set, "
                    f"or joints were silently dropped."
                ),
            )]
        return []

    def _check_link_count(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if intent.expected_link_count_min is None:
            return []
        actual = output.get("link_count")
        if actual is None:
            return []
        lo = intent.expected_link_count_min
        hi = intent.expected_link_count_max or lo
        if not (lo <= actual <= hi):
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="link_count_out_of_range",
                expected=f"{lo}–{hi}",
                found=actual,
                message=(
                    f"Output has {actual} links but task expected {lo}–{hi}."
                ),
            )]
        return []

    def _check_required_fields(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if not intent.expected_fields_present:
            return []
        violations = []
        for field in intent.expected_fields_present:
            if field not in output:
                violations.append(IntentViolation(
                    task_id=intent.task_id,
                    violation_type="required_field_missing",
                    expected=field,
                    found=None,
                    message=f"Required field '{field}' absent from output.",
                ))
        return violations

    def _check_forbidden_fields(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if not intent.expected_fields_absent:
            return []
        violations = []
        for field in intent.expected_fields_absent:
            if field in output:
                violations.append(IntentViolation(
                    task_id=intent.task_id,
                    violation_type="forbidden_field_present",
                    expected=f"absent: {field}",
                    found=output[field],
                    message=(
                        f"Field '{field}' present in output but task declared it must be absent. "
                        f"Agent may have exceeded task scope."
                    ),
                ))
        return violations

    def _check_target_container(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if intent.expected_target_container is None:
            return []
        actual = output.get("target_container")
        if actual != intent.expected_target_container:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="wrong_target_container",
                expected=intent.expected_target_container,
                found=actual,
                message=(
                    f"Script targets container '{actual}' but task required "
                    f"'{intent.expected_target_container}'. "
                    f"Script will execute in wrong environment."
                ),
            )]
        return []

    def _check_base_joint(
        self, intent: TaskIntent, output: dict
    ) -> list[IntentViolation]:
        if intent.base_locked is None:
            return []
        # Check URDF XML content for base joint type
        urdf_xml = output.get("urdf_xml", "")
        if not urdf_xml:
            return []
        has_fixed_base = 'name="base_joint" type="fixed"' in urdf_xml or \
                         "base" in urdf_xml and 'type="fixed"' in urdf_xml
        if intent.base_locked and not has_fixed_base:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="base_joint_wrong_type",
                expected="fixed (base_locked=True)",
                found="not fixed",
                message="Task specified base_locked=True but URDF base joint is not fixed.",
            )]
        if not intent.base_locked and has_fixed_base:
            return [IntentViolation(
                task_id=intent.task_id,
                violation_type="base_joint_wrong_type",
                expected="revolute (base_locked=False)",
                found="fixed",
                message="Task specified base_locked=False but URDF base joint is fixed.",
            )]
        return []
