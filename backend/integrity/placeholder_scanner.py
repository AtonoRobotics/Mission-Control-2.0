"""
Mission Control — Placeholder Scanner
Detects fake data, placeholder syntax, and suspicious round numbers.
Implements L1-R2 and L1-R5 from GUARDRAILS.md.

This scanner operates on raw output dicts before Validator Agent LLM checks.
It is deterministic — no LLM involvement. Pattern matching only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# ── Forbidden Patterns (L1-R2) ────────────────────────────────────────────────

# String values that indicate placeholder content
FORBIDDEN_STRING_PATTERNS: list[re.Pattern] = [
    re.compile(r'\bTODO\b', re.IGNORECASE),
    re.compile(r'\bFIXME\b', re.IGNORECASE),
    re.compile(r'\bPLACEHOLDER\b', re.IGNORECASE),
    re.compile(r'\bEXAMPLE\b', re.IGNORECASE),
    re.compile(r'\bDUMMY\b', re.IGNORECASE),
    re.compile(r'\bFAKE\b', re.IGNORECASE),
    re.compile(r'\bTEMP\b', re.IGNORECASE),
    re.compile(r'\bTEST_VALUE\b', re.IGNORECASE),
    re.compile(r'<[a-z_]+>'),        # <value>, <name>, <joint>
    re.compile(r'\{[a-z_]+\}'),      # {value}, {name}
    re.compile(r'\[[A-Z_]+\]'),      # [VALUE], [NAME]
    re.compile(r'your[-_]'),         # your-robot, your_value
    re.compile(r'my[-_]robot'),
    re.compile(r'robot[-_]name'),
]

# Fields where 0.0 is a physically suspicious value for a robot joint/link
# (0.0 mass, 0.0 effort limit, 0.0 velocity limit are almost never correct)
SUSPICIOUS_ZERO_FIELDS: set[str] = {
    "mass", "effort", "effort_limit", "velocity", "velocity_limit",
    "ixx", "iyy", "izz", "lower", "upper",
}

# Round numbers that are suspicious as physical constants
# Legitimate values like 0.0 (for ixy, ixz, iyz of symmetric links) are excluded
# via field-specific logic, not here
ROUND_NUMBER_PATTERN = re.compile(r'^-?\d+\.0+$')

# Physical constant fields — these must always be empirically sourced
PHYSICAL_CONSTANT_FIELDS: set[str] = {
    "mass", "ixx", "iyy", "izz", "ixy", "ixz", "iyz",
    "effort", "effort_limit", "velocity", "velocity_limit",
    "lower", "upper", "damping", "friction",
    "calibration_value", "baseline", "focal_length",
    "sensor_gain", "exposure",
}


@dataclass
class PlaceholderFinding:
    field_path: str          # dot-notation path e.g. "joints.0.effort_limit"
    value: Any
    pattern: str             # which rule triggered
    severity: str            # "CRITICAL" | "WARN"
    rule: str                # e.g. "L1-R2", "L1-R5"
    message: str


class PlaceholderScanner:
    """
    Deterministic scanner for placeholder and suspicious values.
    Operates on any dict (agent output, config, URDF fields).
    """

    def scan(self, data: Any, path: str = "") -> list[PlaceholderFinding]:
        """
        Recursively scan a data structure for placeholder violations.
        Returns all findings — does not short-circuit.
        """
        findings: list[PlaceholderFinding] = []
        self._scan_recursive(data, path, findings)
        return findings

    def _scan_recursive(
        self,
        data: Any,
        path: str,
        findings: list[PlaceholderFinding],
    ) -> None:
        if isinstance(data, dict):
            for key, value in data.items():
                child_path = f"{path}.{key}" if path else key
                self._scan_recursive(value, child_path, findings)

        elif isinstance(data, list):
            for i, item in enumerate(data):
                self._scan_recursive(item, f"{path}[{i}]", findings)

        elif isinstance(data, str):
            self._check_string(data, path, findings)

        elif isinstance(data, (int, float)):
            self._check_number(data, path, findings)

    def _check_string(
        self,
        value: str,
        path: str,
        findings: list[PlaceholderFinding],
    ) -> None:
        for pattern in FORBIDDEN_STRING_PATTERNS:
            if pattern.search(value):
                findings.append(PlaceholderFinding(
                    field_path=path,
                    value=value,
                    pattern=pattern.pattern,
                    severity="CRITICAL",
                    rule="L1-R2",
                    message=(
                        f"Placeholder pattern '{pattern.pattern}' detected in field '{path}'. "
                        f"Value: '{value}'. This field must contain a verified empirical value or be NULL."
                    ),
                ))
                break  # One finding per field is sufficient

    def _check_number(
        self,
        value: float | int,
        path: str,
        findings: list[PlaceholderFinding],
    ) -> None:
        field_name = path.split(".")[-1].split("[")[0]

        # Check for suspicious zero in physical constant fields
        if field_name in SUSPICIOUS_ZERO_FIELDS and value == 0.0:
            findings.append(PlaceholderFinding(
                field_path=path,
                value=value,
                pattern="suspicious_zero",
                severity="WARN",
                rule="L1-R5",
                message=(
                    f"Field '{path}' = 0.0. Zero is suspicious for physical constant '{field_name}'. "
                    "Verify this is an empirically measured value, not a default."
                ),
            ))
            return

        # Check for round numbers in physical constant fields (L1-R5)
        if field_name in PHYSICAL_CONSTANT_FIELDS:
            value_str = str(float(value))
            if ROUND_NUMBER_PATTERN.match(value_str):
                findings.append(PlaceholderFinding(
                    field_path=path,
                    value=value,
                    pattern="round_number_physical_constant",
                    severity="WARN",
                    rule="L1-R5",
                    message=(
                        f"Field '{path}' = {value} is a round number for physical constant '{field_name}'. "
                        "Real empirical measurements are typically irregular. "
                        "Verify this value exists verbatim in the empirical DB."
                    ),
                ))


def scan_for_placeholders(data: Any) -> list[PlaceholderFinding]:
    """Convenience function. Returns all placeholder findings in data."""
    return PlaceholderScanner().scan(data)


def has_critical_placeholder_violations(findings: list[PlaceholderFinding]) -> bool:
    return any(f.severity == "CRITICAL" for f in findings)
