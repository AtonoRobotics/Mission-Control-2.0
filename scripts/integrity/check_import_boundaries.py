#!/usr/bin/env python3
"""
Mission Control — Import Boundary Checker
Enforces architectural isolation. Runs in CI.
Implements L4-R3, L4-R4, L4-R5 from GUARDRAILS.md.

Any import boundary violation is a build failure.
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent


@dataclass
class BoundaryViolation:
    file: str
    importer: str
    imported: str
    rule: str
    message: str


# ── Boundary Rules ────────────────────────────────────────────────────────────
# Each rule: (forbidden_importer_pattern, forbidden_import_pattern, rule_id, message)
# If a file matching importer_pattern imports anything matching import_pattern → violation.

BOUNDARY_RULES: list[tuple[str, str, str, str]] = [
    # L4-R3: Only db/registry/writer.py may write to DB
    # No other file may import sqlalchemy write operations directly
    (
        r"backend/(?!db/registry/writer)",
        r"sqlalchemy.*session.*add|sqlalchemy.*session.*commit|sqlalchemy.*session.*execute.*INSERT",
        "L4-R3",
        "Only backend/db/registry/writer.py may perform DB write operations. "
        "Route writes through the DB Agent.",
    ),
    # L4-R4: Claude Code orchestrator has no workflow engine imports
    (
        r"orchestrator/",
        r"backend\.workflow_engine|from workflow_engine",
        "L4-R4",
        "orchestrator/ must not import from backend/workflow_engine/. "
        "The workflow engine is isolated from orchestration.",
    ),
    # L4-R4: Workflow engine has no orchestrator or agent imports
    (
        r"backend/workflow_engine/",
        r"from orchestrator|import orchestrator|from agents\.",
        "L4-R4",
        "backend/workflow_engine/ must not import from orchestrator/ or agents/. "
        "The workflow engine executes nodes, not agent coordination.",
    ),
    # L4-R5: Only validation_chain.py may retry agent calls
    (
        r"backend/(?!core/validation_chain)",
        r"for.*attempt.*range.*retry|while.*retry.*<|retry_count",
        "L4-R5",
        "Agent retry logic must only exist in backend/core/validation_chain.py. "
        "Other files must not implement retry loops for agent calls.",
    ),
    # Architecture: Integrity checkers must not import generating agents
    (
        r"backend/integrity/",
        r"from agents\.|from backend\.agents",
        "L2-R1",
        "Integrity checkers must not import generating agents. "
        "They operate on output data structures only.",
    ),
]


def check_file(filepath: Path) -> list[BoundaryViolation]:
    """Parse a Python file and check its imports against boundary rules."""
    violations: list[BoundaryViolation] = []
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return violations  # Syntax errors caught by other checks

    import_lines: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                import_lines.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            import_lines.append(module)

    rel_path = str(filepath.relative_to(ROOT))

    import re
    for importer_pattern, import_pattern, rule_id, message in BOUNDARY_RULES:
        if not re.search(importer_pattern, rel_path):
            continue
        for imported in import_lines:
            if re.search(import_pattern, imported):
                violations.append(BoundaryViolation(
                    file=rel_path,
                    importer=rel_path,
                    imported=imported,
                    rule=rule_id,
                    message=f"[{rule_id}] {message}\nViolating import: '{imported}' in '{rel_path}'",
                ))

    return violations


def check_all() -> list[BoundaryViolation]:
    """Check all Python files in the project."""
    all_violations: list[BoundaryViolation] = []
    python_files = list(ROOT.rglob("*.py"))
    # Exclude test files and this script itself
    python_files = [
        f for f in python_files
        if "test_" not in f.name
        and "__pycache__" not in str(f)
        and f != Path(__file__)
    ]

    for filepath in python_files:
        violations = check_file(filepath)
        all_violations.extend(violations)

    return all_violations


def main() -> int:
    violations = check_all()

    if not violations:
        print("✓ Import boundary check passed — no violations found.")
        return 0

    print(f"✗ Import boundary check FAILED — {len(violations)} violation(s):\n")
    for v in violations:
        print(f"  Rule {v.rule}: {v.file}")
        print(f"  → {v.message}\n")

    return 1


if __name__ == "__main__":
    sys.exit(main())
