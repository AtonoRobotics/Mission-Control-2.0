"""
Mission Control — Drift Score Tracker
Quantifies configuration staleness for a robot's configuration bundle.
Implements L6-R2 from GUARDRAILS.md.

Drift score increments when:
- A field is NULL but DB now has a value (missed update)
- A registered file hash doesn't match disk
- A joint/link name in a config no longer matches the DB
- A version tag in a file is stale relative to current spec

Score thresholds:
  0      — clean, no drift
  1–4    — minor drift, warnings surfaced in UI
  5–9    — significant drift, builds blocked pending review
  10+    — critical drift, promotion blocked, operator action required
"""

from __future__ import annotations

import hashlib
import structlog
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = structlog.get_logger(__name__)

# Score weights per drift type
DRIFT_WEIGHTS = {
    "null_field_now_populated":  2,   # DB has value; registered config still NULL
    "file_hash_mismatch":        3,   # File changed outside registry
    "field_name_mismatch":       3,   # Joint/link name drifted
    "version_tag_stale":         1,   # Output generated against old spec version
    "schema_version_mismatch":   2,   # DB schema changed since output generated
    "module_version_stale":      1,   # Prompt module updated since output generated
}

BLOCK_PROMOTION_THRESHOLD = 10
OPERATOR_REVIEW_THRESHOLD = 5
WARN_THRESHOLD = 1


@dataclass
class DriftEvent:
    drift_type: str
    field: str
    detail: str
    score_contribution: int


@dataclass
class DriftReport:
    robot_id: int
    config_bundle_id: str          # UUID of the URDF/config set being scored
    total_score: int = 0
    events: list[DriftEvent] = field(default_factory=list)
    blocks_promotion: bool = False
    requires_operator_review: bool = False

    def add_event(self, drift_type: str, field_name: str, detail: str) -> None:
        weight = DRIFT_WEIGHTS.get(drift_type, 1)
        self.events.append(DriftEvent(
            drift_type=drift_type,
            field=field_name,
            detail=detail,
            score_contribution=weight,
        ))
        self.total_score += weight
        self.blocks_promotion = self.total_score >= BLOCK_PROMOTION_THRESHOLD
        self.requires_operator_review = self.total_score >= OPERATOR_REVIEW_THRESHOLD

    @property
    def severity(self) -> str:
        if self.total_score >= BLOCK_PROMOTION_THRESHOLD:
            return "CRITICAL"
        if self.total_score >= OPERATOR_REVIEW_THRESHOLD:
            return "WARN"
        if self.total_score >= WARN_THRESHOLD:
            return "INFO"
        return "CLEAN"

    def to_dict(self) -> dict:
        return {
            "robot_id": self.robot_id,
            "config_bundle_id": self.config_bundle_id,
            "total_score": self.total_score,
            "severity": self.severity,
            "blocks_promotion": self.blocks_promotion,
            "requires_operator_review": self.requires_operator_review,
            "events": [vars(e) for e in self.events],
            "thresholds": {
                "warn": WARN_THRESHOLD,
                "operator_review": OPERATOR_REVIEW_THRESHOLD,
                "block_promotion": BLOCK_PROMOTION_THRESHOLD,
            },
        }


class DriftScoreCalculator:
    """
    Calculates drift score for a robot's registered configuration bundle
    by comparing it against the current state of the empirical DB and file system.
    """

    def __init__(self, db_agent, file_registry_reader) -> None:
        self._db = db_agent
        self._registry = file_registry_reader

    async def calculate(
        self,
        robot_id: int,
        config_bundle_id: str,
        registered_output: dict[str, Any],
    ) -> DriftReport:
        report = DriftReport(
            robot_id=robot_id,
            config_bundle_id=config_bundle_id,
        )

        await self._check_null_fields_now_populated(report, robot_id, registered_output)
        await self._check_file_hash_drift(report, registered_output)
        await self._check_field_name_drift(report, robot_id, registered_output)
        self._check_version_tags(report, registered_output)

        logger.info(
            "drift_score_calculated",
            robot_id=robot_id,
            config_bundle_id=config_bundle_id,
            score=report.total_score,
            severity=report.severity,
        )

        return report

    async def _check_null_fields_now_populated(
        self,
        report: DriftReport,
        robot_id: int,
        output: dict,
    ) -> None:
        """
        For every field recorded as NULL in the registered output:
        check if the DB now has a value for it.
        """
        null_fields: list[dict] = output.get("null_fields", [])
        for nf in null_fields:
            field_name = nf.get("field")
            element = nf.get("element")
            if not field_name:
                continue

            current_db_value = await self._db.get_field_value(
                robot_id=robot_id,
                element=element,
                field=field_name,
            )
            if current_db_value is not None:
                report.add_event(
                    drift_type="null_field_now_populated",
                    field_name=f"{element}.{field_name}",
                    detail=(
                        f"Field was NULL when config was generated, "
                        f"but DB now has value: {current_db_value}. "
                        f"Regenerate config to incorporate verified value."
                    ),
                )

    async def _check_file_hash_drift(
        self,
        report: DriftReport,
        output: dict,
    ) -> None:
        """Check registered file hashes against current disk state."""
        file_path_fields = ["urdf_path", "config_path", "launch_file_path",
                            "zed_yaml_path", "script_content_path"]

        for field_key in file_path_fields:
            path_str = output.get(field_key)
            if not path_str:
                continue

            registry_entry = await self._registry.get_by_path(path_str)
            if not registry_entry:
                continue

            stored_hash = registry_entry.get("file_hash")
            current_path = Path(path_str)
            if not current_path.exists():
                report.add_event(
                    drift_type="file_hash_mismatch",
                    field_name=field_key,
                    detail=f"Registered file no longer exists on disk: {path_str}",
                )
                continue

            current_hash = hashlib.sha256(current_path.read_bytes()).hexdigest()
            if current_hash != stored_hash:
                report.add_event(
                    drift_type="file_hash_mismatch",
                    field_name=field_key,
                    detail=(
                        f"File modified outside registry system: {path_str}\n"
                        f"  Registered hash: {stored_hash[:16]}…\n"
                        f"  Current hash:    {current_hash[:16]}…"
                    ),
                )

    async def _check_field_name_drift(
        self,
        report: DriftReport,
        robot_id: int,
        output: dict,
    ) -> None:
        """Check joint and link names in output against current DB."""
        joint_names_in_output: list[str] = output.get("joint_names", [])
        current_db_joints = await self._db.get_joint_names(robot_id)

        for name in joint_names_in_output:
            if name not in current_db_joints:
                report.add_event(
                    drift_type="field_name_mismatch",
                    field_name=f"joint:{name}",
                    detail=(
                        f"Joint '{name}' in registered output no longer exists in DB. "
                        f"Current DB joints: {current_db_joints}"
                    ),
                )

    def _check_version_tags(
        self,
        report: DriftReport,
        output: dict,
    ) -> None:
        """Check version tags in output against current system versions."""
        from backend.core.integrity import (
            SPEC_VERSION, GUARDRAILS_VERSION, EMPIRICAL_DB_SCHEMA_VERSION,
        )

        checks = [
            ("spec_version", SPEC_VERSION, "version_tag_stale"),
            ("guardrails_version", GUARDRAILS_VERSION, "version_tag_stale"),
            ("empirical_db_schema_version", EMPIRICAL_DB_SCHEMA_VERSION, "schema_version_mismatch"),
        ]

        for field_name, current_version, drift_type in checks:
            output_version = output.get(field_name)
            if output_version and output_version != current_version:
                report.add_event(
                    drift_type=drift_type,
                    field_name=field_name,
                    detail=(
                        f"Output declares {field_name}='{output_version}' "
                        f"but current is '{current_version}'. "
                        f"Regenerate to align with current system version."
                    ),
                )
