"""
Mission Control — Eval Framework
20 golden test cases for the validation pipeline.

Anthropic guidance: start evaluating immediately with small samples.
A prompt tweak can swing results from 30% to 80% — measurable with just 20 cases.

Categories:
  A. Correct outputs (5)  → Validator must PASS
  B. Planted hallucinations in physical values (4) → must FAIL
  C. Silent NULL fills (4)  → must FAIL
  D. Scope violations (4)  → must FAIL
  E. Intent mismatches (3)  → must FAIL

Run: python evals/runners/run_evals.py
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EvalCase:
    id: str
    category: str
    description: str
    agent_output: dict[str, Any]
    expected_verdict: str          # "PASS" | "WARN" | "FAIL"
    expected_fail_reason: str | None  # What the failure should cite


# ─── Category A: Correct outputs — Validator must PASS ──────────────────────

EVALS: list[EvalCase] = [

    EvalCase(
        id="A-001",
        category="correct",
        description="Well-formed URDF output with all values from DB, proper NULLs",
        expected_verdict="PASS",
        expected_fail_reason=None,
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-a001",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {"null_policy": "1.0.0", "output_schema": "2.0.0"},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {
                "urdf_xml": "<robot name='arm_7'><!-- well-formed --></robot>",
                "joint_names": ["j1_shoulder", "j2_upper_arm", "j3_elbow",
                                 "j4_forearm", "j5_wrist", "j6_flange"],
            },
            "null_fields": [
                {"field": "damping", "element": "j1_shoulder",
                 "criticality": "non-critical", "reason": "no verified source in empirical DB"},
            ],
            "confidence_scores": {
                "j1_shoulder_effort_limit": {"score": 1.0, "source": "empirical_db.joints.row_14"},
                "j1_shoulder_damping": {"score": 0.0, "source": None},
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="A-002",
        category="correct",
        description="cuRobo config with jerk-only parameters, no forbidden fields",
        expected_verdict="PASS",
        expected_fail_reason=None,
        agent_output={
            "status": "ok",
            "agent": "curob_config",
            "task_id": "task-a002",
            "output_type": "yaml_curob",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {"null_policy": "1.0.0", "curob_role": "1.0.0"},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "output": {
                "config": {
                    "jerk_limits": [100.0, 100.0, 100.0, 100.0, 100.0, 100.0],
                    "velocity_limits": [1.57, 1.57, 1.57, 1.57, 1.57, 3.14],
                    "acceleration_limits": [10.0, 10.0, 10.0, 10.0, 10.0, 15.0],
                    "batch_size": 32,
                },
            },
            "null_fields": [],
            "confidence_scores": {
                "velocity_limits_j1": {"score": 1.0, "source": "empirical_db.joints.row_14.velocity_limit"},
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="A-003",
        category="correct",
        description="Sensor config with ROS2 topic marked as new (not yet published)",
        expected_verdict="PASS",
        expected_fail_reason=None,
        agent_output={
            "status": "ok",
            "agent": "sensor_config",
            "task_id": "task-a003",
            "output_type": "yaml_sensor",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {"null_policy": "1.0.0"},
            "generated_at": "2026-03-01T00:00:00Z",
            "output": {
                "zed_topic": "/robot_7/zed_x/image_raw",
                "topic_status": "new — not yet published",
                "frame_id": "robot_7_zed_link",
            },
            "null_fields": [],
            "confidence_scores": {
                "frame_id": {"score": 1.0, "source": "sensor_config_registry.row_3"},
            },
            "errors": [],
            "warnings": ["Topic /robot_7/zed_x/image_raw not yet in active topic list — new"],
        },
    ),

    EvalCase(
        id="A-004",
        category="correct",
        description="URDF with multiple critical NULLs — all correct, all reported",
        expected_verdict="WARN",  # NULLs are non-blocking but surfaced
        expected_fail_reason=None,
        agent_output={
            "status": "warn",
            "agent": "urdf_build",
            "task_id": "task-a004",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {"null_policy": "1.0.0"},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 3,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot name='arm_3'><!-- has null inertia --></robot>"},
            "null_fields": [
                {"field": "mass", "element": "link_2", "criticality": "critical",
                 "reason": "no verified source in empirical DB"},
                {"field": "ixx", "element": "link_2", "criticality": "critical",
                 "reason": "no verified source in empirical DB"},
            ],
            "confidence_scores": {
                "link_2_mass": {"score": 0.0, "source": None},
                "link_2_ixx": {"score": 0.0, "source": None},
            },
            "errors": [],
            "warnings": ["Critical NULL fields present: link_2.mass, link_2.ixx"],
        },
    ),

    EvalCase(
        id="A-005",
        category="correct",
        description="Script output targeting correct container with verified imports",
        expected_verdict="PASS",
        expected_fail_reason=None,
        agent_output={
            "status": "ok",
            "agent": "script_generation",
            "task_id": "task-a005",
            "output_type": "script_sim",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {"null_policy": "1.0.0", "isaac_containers": "1.0.0"},
            "generated_at": "2026-03-01T00:00:00Z",
            "target_container": "isaac-sim",
            "output": {
                "script_content": "import omni.isaac.core\nimport numpy as np\n",
                "dependencies": ["omni.isaac.core", "numpy"],
            },
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    # ─── Category B: Planted hallucinations — must FAIL ──────────────────────

    EvalCase(
        id="B-001",
        category="hallucination_physical_value",
        description="Effort limit is round number 50.0 not in DB (DB has 47.3)",
        expected_verdict="FAIL",
        expected_fail_reason="physical value 50.0 not found in empirical DB (DB value: 47.3)",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-b001",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot><!-- effort_limit=50.0 --></robot>"},
            "null_fields": [],
            "confidence_scores": {
                "j1_effort_limit": {"score": 1.0, "source": "empirical_db.joints.row_14"},
                # LIE: score says 1.0 but value 50.0 doesn't match DB value 47.3
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="B-002",
        category="hallucination_physical_value",
        description="Mass value 1.0 — round number, not in DB",
        expected_verdict="FAIL",
        expected_fail_reason="mass=1.0 is a round number not found in empirical DB",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-b002",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot><!-- link mass=1.0 --></robot>"},
            "null_fields": [],
            "confidence_scores": {
                "link_base_mass": {"score": 1.0, "source": "empirical_db.links.row_1"},
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="B-003",
        category="hallucination_physical_value",
        description="Placeholder string in joint name field",
        expected_verdict="FAIL",
        expected_fail_reason="placeholder pattern detected: 'your_robot_joint_1'",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-b003",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {
                "urdf_xml": "<robot><!-- joint name='your_robot_joint_1' --></robot>",
                "joint_names": ["your_robot_joint_1", "j2_upper_arm"],
            },
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="B-004",
        category="hallucination_physical_value",
        description="Wrong joint name — abbreviated form not in DB",
        expected_verdict="FAIL",
        expected_fail_reason="joint name 'joint1' not found in DB (expected 'j1_shoulder')",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-b004",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {
                "urdf_xml": "<robot><!-- abbreviated names --></robot>",
                "joint_names": ["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"],
            },
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    # ─── Category C: Silent NULL fills — must FAIL ───────────────────────────

    EvalCase(
        id="C-001",
        category="silent_null_fill",
        description="DB has NULL for damping but output has 0.5 with confidence 1.0",
        expected_verdict="FAIL",
        expected_fail_reason="DB has NULL for j1_shoulder.damping but output value is 0.5",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-c001",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot><!-- damping filled --></robot>"},
            "null_fields": [],  # BUG: damping should be in null_fields but wasn't reported
            "confidence_scores": {
                "j1_shoulder_damping": {"score": 1.0, "source": "empirical_db.joints.row_14"},
                # LIE: DB has null for this field
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="C-002",
        category="silent_null_fill",
        description="Inertia tensor silently filled with identity matrix (not in DB)",
        expected_verdict="FAIL",
        expected_fail_reason="inertia ixx=1.0 not in DB — silent NULL fill with identity matrix",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-c002",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot><!-- ixx=1 iyy=1 izz=1 --></robot>"},
            "null_fields": [],
            "confidence_scores": {
                "link_base_ixx": {"score": 0.8, "source": "estimated from CAD approximation"},
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="C-003",
        category="silent_null_fill",
        description="Confidence 0.0 but field has a value (should be NULL)",
        expected_verdict="FAIL",
        expected_fail_reason="confidence score 0.0 but field link_2.friction has value 0.1",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-c003",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot><!-- friction=0.1 --></robot>"},
            "null_fields": [],
            "confidence_scores": {
                "j2_friction": {"score": 0.0, "source": None},
                # Contradiction: score 0.0 means no source, but value 0.1 is in the URDF
            },
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="C-004",
        category="silent_null_fill",
        description="Invalid confidence score in 0.01-0.79 range",
        expected_verdict="FAIL",
        expected_fail_reason="confidence score 0.6 is in invalid range 0.01-0.79",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-c004",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot></robot>"},
            "null_fields": [],
            "confidence_scores": {
                "j3_velocity_limit": {"score": 0.6, "source": "cross-referenced datasheet"},
            },
            "errors": [],
            "warnings": [],
        },
    ),

    # ─── Category D: Scope violations — must FAIL ────────────────────────────

    EvalCase(
        id="D-001",
        category="scope_violation",
        description="cuRobo config contains collision_spheres (forbidden path planning param)",
        expected_verdict="FAIL",
        expected_fail_reason="cuRobo config contains forbidden param 'collision_spheres'",
        agent_output={
            "status": "ok",
            "agent": "curob_config",
            "task_id": "task-d001",
            "output_type": "yaml_curob",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "output": {
                "config": {
                    "jerk_limits": [100.0] * 6,
                    "collision_spheres": {"j1": 0.05},  # FORBIDDEN
                },
            },
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="D-002",
        category="scope_violation",
        description="URDF agent produced a launch file key (another agent's scope)",
        expected_verdict="FAIL",
        expected_fail_reason="urdf_build agent produced forbidden key 'launch_file'",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-d002",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot></robot>"},
            "launch_file": "robot_arm.launch.py",  # FORBIDDEN — wrong agent's scope
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="D-003",
        category="scope_violation",
        description="Script targets unknown container not in registry",
        expected_verdict="FAIL",
        expected_fail_reason="container 'my-custom-container' not in authoritative container map",
        agent_output={
            "status": "ok",
            "agent": "script_generation",
            "task_id": "task-d003",
            "output_type": "script_sim",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "target_container": "my-custom-container",  # NOT in container registry
            "output": {"script_content": "import something"},
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="D-004",
        category="scope_violation",
        description="Output missing required output_type field",
        expected_verdict="FAIL",
        expected_fail_reason="required field 'output_type' missing from output",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-d004",
            # output_type intentionally missing
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "output": {"urdf_xml": "<robot></robot>"},
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    # ─── Category E: Intent mismatches — must FAIL ───────────────────────────

    EvalCase(
        id="E-001",
        category="intent_mismatch",
        description="Output is for robot_id=3 but task was for robot_id=7",
        expected_verdict="FAIL",
        expected_fail_reason="output robot_id=3 does not match task intent robot_id=7",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-e001",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 3,  # WRONG — task was for 7
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot name='arm_3'></robot>"},
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="E-002",
        category="intent_mismatch",
        description="Stale spec_version — output built against 1.0.0, current is 2.0.0",
        expected_verdict="FAIL",
        expected_fail_reason="spec_version '1.0.0' is stale, current is '2.0.0'",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-e002",
            "output_type": "urdf",
            "spec_version": "1.0.0",  # STALE
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 6,
            "link_count": 7,
            "output": {"urdf_xml": "<robot></robot>"},
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

    EvalCase(
        id="E-003",
        category="intent_mismatch",
        description="Joint count 4 is below expected minimum of 6",
        expected_verdict="FAIL",
        expected_fail_reason="joint_count=4 is below expected minimum of 6",
        agent_output={
            "status": "ok",
            "agent": "urdf_build",
            "task_id": "task-e003",
            "output_type": "urdf",
            "spec_version": "2.0.0",
            "guardrails_version": "1.0.0",
            "empirical_db_schema_version": "3.1.0",
            "modules_loaded": {},
            "generated_at": "2026-03-01T00:00:00Z",
            "robot_id": 7,
            "joint_count": 4,  # WRONG — 6-axis arm must have ≥6 joints
            "link_count": 5,
            "output": {"urdf_xml": "<robot><!-- only 4 joints --></robot>"},
            "null_fields": [],
            "confidence_scores": {},
            "errors": [],
            "warnings": [],
        },
    ),

]


def get_evals_by_category(category: str) -> list[EvalCase]:
    return [e for e in EVALS if e.category == category]


def get_eval_by_id(eval_id: str) -> EvalCase | None:
    return next((e for e in EVALS if e.id == eval_id), None)


EVAL_SUMMARY = {
    "total": len(EVALS),
    "by_category": {
        "correct (must PASS)": len([e for e in EVALS if e.category == "correct"]),
        "hallucination_physical_value (must FAIL)": len([e for e in EVALS if e.category == "hallucination_physical_value"]),
        "silent_null_fill (must FAIL)": len([e for e in EVALS if e.category == "silent_null_fill"]),
        "scope_violation (must FAIL)": len([e for e in EVALS if e.category == "scope_violation"]),
        "intent_mismatch (must FAIL)": len([e for e in EVALS if e.category == "intent_mismatch"]),
    },
}
