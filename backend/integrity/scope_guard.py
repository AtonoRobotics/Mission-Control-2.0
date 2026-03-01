"""
Mission Control — Scope Guard
Enforces agent output boundaries. An agent that produces correct output
of the wrong type has still violated its scope.
Implements L2-R1 and L2-R4 from GUARDRAILS.md.
"""

from __future__ import annotations

from dataclasses import dataclass

# ── Scope Registry ────────────────────────────────────────────────────────────
# Defines exactly what output types each agent may produce.
# This is the authoritative boundary definition.
# Adding scope requires a GUARDRAILS.md version bump.

AGENT_SCOPE: dict[str, dict] = {
    "urdf_build": {
        "permitted_output_types": {"urdf"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            # urdf-specific
            "urdf_xml", "robot_id", "joint_count", "link_count",
        },
        "forbidden_output_keys": {
            # These belong to other agents — URDF agent must never produce them
            "usd_stage_path", "world_config", "launch_file", "sensor_yaml",
            "curob_yaml", "script_content", "collision_config", "path_plan",
        },
    },
    "usd_conversion": {
        "permitted_output_types": {"usd"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "source_format", "target_format", "output_path",
            "conversion_warnings", "requires_manual_review",
        },
        "forbidden_output_keys": {"urdf_xml", "script_content", "launch_file"},
    },
    "scene_build": {
        "permitted_output_types": {"usd_stage", "world_config"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "usd_stage_path", "world_config_path", "scene_id", "placed_objects",
        },
        "forbidden_output_keys": {"urdf_xml", "script_content", "launch_file", "curob_yaml"},
    },
    "sensor_config": {
        "permitted_output_types": {"yaml_sensor"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "zed_yaml_path", "ros2_params_path", "sensor_id", "setup_id",
        },
        "forbidden_output_keys": {"urdf_xml", "script_content", "curob_yaml", "usd_stage_path"},
    },
    "launch_file": {
        "permitted_output_types": {"launch"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "launch_file_path", "node_count", "syntax_valid",
        },
        "forbidden_output_keys": {"urdf_xml", "script_content", "curob_yaml", "usd_stage_path"},
    },
    "curob_config": {
        "permitted_output_types": {"yaml_curob"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "config_path", "robot_id", "joint_count", "defaults_applied",
        },
        # cuRobo scope lock — these keys indicate forbidden path/collision features
        "forbidden_output_keys": {
            "collision_config", "world_model", "obstacle_config",
            "path_plan_config", "kinematics_solver", "motion_gen",
            "urdf_xml", "script_content", "launch_file", "usd_stage_path",
        },
    },
    "script_generation": {
        "permitted_output_types": {
            "script_sim", "script_lab", "script_groot",
            "script_cosmos", "script_curob", "script_urdf", "script_calibration",
        },
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "script_type", "generation_mode", "script_content",
            "target_container", "template_used", "dependencies",
            "validation_status",
        },
        "forbidden_output_keys": {
            "urdf_xml", "curob_yaml", "launch_file", "usd_stage_path",
        },
    },
    "audit": {
        "permitted_output_types": {"audit_report"},
        "permitted_top_level_keys": {
            "status", "agent", "version", "task_id", "spec_version",
            "guardrails_version", "modules_loaded", "empirical_db_schema_version",
            "generated_at", "output", "null_fields", "confidence_scores",
            "errors", "warnings",
            "audit_id", "timestamp", "summary", "findings",
        },
        # Audit agent is read-only — must never produce any generative artifact
        "forbidden_output_keys": {
            "urdf_xml", "script_content", "curob_yaml", "launch_file",
            "usd_stage_path", "world_config_path", "zed_yaml_path",
        },
    },
}

# cuRobo forbidden parameter names — presence at any nesting level is a FAIL
CUROB_FORBIDDEN_PARAMS: set[str] = {
    "collision_spheres", "collision_cache", "world_model", "world_coll_checker",
    "obstacle_cuboids", "obstacle_spheres", "motion_gen", "path_planning",
    "kinematics_solver", "collision_activation_distance",
    "use_cuda_graph_lbfgs", "project_pose_to_goal_frame",  # path planning artifacts
}


@dataclass
class ScopeViolation:
    agent: str
    violation_type: str  # "forbidden_key" | "wrong_output_type" | "curob_forbidden_param"
    detail: str
    severity: str = "CRITICAL"
    rule: str = "L2-R1"


class ScopeGuard:
    """
    Checks agent output against its declared scope boundary.
    Deterministic — no LLM involved.
    """

    def check(self, agent_name: str, output: dict) -> list[ScopeViolation]:
        violations: list[ScopeViolation] = []
        scope = AGENT_SCOPE.get(agent_name)

        if scope is None:
            violations.append(ScopeViolation(
                agent=agent_name,
                violation_type="unknown_agent",
                detail=f"Agent '{agent_name}' has no scope definition. Cannot validate.",
                severity="CRITICAL",
                rule="L2-R1",
            ))
            return violations

        # Check output_type if declared
        output_type = output.get("output_type") or output.get("validated_output_type")
        if output_type and output_type not in scope["permitted_output_types"]:
            violations.append(ScopeViolation(
                agent=agent_name,
                violation_type="wrong_output_type",
                detail=(
                    f"Agent '{agent_name}' produced output_type='{output_type}'. "
                    f"Permitted types: {scope['permitted_output_types']}"
                ),
            ))

        # Check for forbidden keys at top level
        for key in output:
            if key in scope["forbidden_output_keys"]:
                violations.append(ScopeViolation(
                    agent=agent_name,
                    violation_type="forbidden_key",
                    detail=(
                        f"Agent '{agent_name}' produced forbidden key '{key}'. "
                        f"This key belongs to a different agent's scope."
                    ),
                ))

        # cuRobo-specific: scan entire output for forbidden param names
        if agent_name == "curob_config":
            curob_violations = self._scan_curob_forbidden(output)
            violations.extend(curob_violations)

        return violations

    def _scan_curob_forbidden(
        self,
        data: dict | list | str | float | int,
        path: str = "",
    ) -> list[ScopeViolation]:
        violations: list[ScopeViolation] = []

        if isinstance(data, dict):
            for key, value in data.items():
                if key in CUROB_FORBIDDEN_PARAMS:
                    violations.append(ScopeViolation(
                        agent="curob_config",
                        violation_type="curob_forbidden_param",
                        detail=(
                            f"cuRobo config contains forbidden parameter '{key}' at path '{path}'. "
                            f"cuRobo is for jerk minimization only — path planning and collision "
                            f"parameters are outside its scope in this system. See L2-R4."
                        ),
                        rule="L2-R4",
                    ))
                violations.extend(self._scan_curob_forbidden(value, f"{path}.{key}"))

        elif isinstance(data, list):
            for i, item in enumerate(data):
                violations.extend(self._scan_curob_forbidden(item, f"{path}[{i}]"))

        return violations
