#!/usr/bin/env python3
"""
Mission Control — CI Integrity Check Runner
Runs all automated integrity checks. Called from CI pipeline.
All failures are build failures.

Exit codes:
  0 — all checks passed
  1 — one or more checks failed
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent


@dataclass
class CheckResult:
    name: str
    passed: bool
    output: str
    rule: str


def run_check(name: str, rule: str, command: list[str]) -> CheckResult:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    passed = result.returncode == 0
    output = (result.stdout + result.stderr).strip()
    return CheckResult(name=name, passed=passed, output=output, rule=rule)


def check_dependencies_pinned() -> CheckResult:
    """Verify all dependencies use exact version pinning (no >= or ~=)."""
    pyproject = ROOT / "backend" / "pyproject.toml"
    content = pyproject.read_text()
    violations = []
    for i, line in enumerate(content.split("\n"), 1):
        # Find dependency lines with unpinned versions
        if ">=" in line or "~=" in line or "^" in line:
            # Exclude dev/tool sections
            violations.append(f"  Line {i}: {line.strip()}")
    if violations:
        return CheckResult(
            name="dependency_pinning",
            passed=False,
            output=f"Unpinned dependencies found (L3-R5):\n" + "\n".join(violations),
            rule="L3-R5",
        )
    return CheckResult(
        name="dependency_pinning",
        passed=True,
        output="All dependencies use exact version pinning.",
        rule="L3-R5",
    )


def check_migrations_have_downgrade() -> CheckResult:
    """Verify all Alembic migrations have a downgrade() function."""
    migrations_dir = ROOT / "database" / "registry" / "versions"
    violations = []
    for migration_file in migrations_dir.glob("*.py"):
        content = migration_file.read_text()
        if "def downgrade" not in content:
            violations.append(f"  {migration_file.name}")
    if violations:
        return CheckResult(
            name="migration_completeness",
            passed=False,
            output=f"Migrations missing downgrade():\n" + "\n".join(violations),
            rule="L6-R5",
        )
    return CheckResult(
        name="migration_completeness",
        passed=True,
        output="All migrations have downgrade() functions.",
        rule="L6-R5",
    )


def check_todo_count() -> CheckResult:
    """Count TODOs in production code — warn if increasing, fail if > 20."""
    python_files = [
        f for f in ROOT.rglob("*.py")
        if "test_" not in f.name
        and "__pycache__" not in str(f)
        and "stub" not in f.name
    ]
    total = 0
    locations = []
    for f in python_files:
        content = f.read_text(errors="replace")
        count = content.upper().count("TODO")
        if count:
            total += count
            locations.append(f"  {f.relative_to(ROOT)}: {count}")

    if total > 20:
        return CheckResult(
            name="todo_count",
            passed=False,
            output=f"TODO count ({total}) exceeds limit of 20 (L6-R4):\n" + "\n".join(locations[:10]),
            rule="L6-R4",
        )
    return CheckResult(
        name="todo_count",
        passed=True,
        output=f"TODO count: {total}/20",
        rule="L6-R4",
    )


def check_guardrails_version_consistency() -> CheckResult:
    """Verify GUARDRAILS.md version matches integrity.py constant."""
    integrity_file = ROOT / "backend" / "core" / "integrity.py"
    guardrails_file = ROOT / "docs" / "GUARDRAILS.md"

    if not integrity_file.exists():
        return CheckResult("guardrails_version", False, "integrity.py not found", "L5-R2")
    if not guardrails_file.exists():
        return CheckResult("guardrails_version", False, "GUARDRAILS.md not found", "L5-R2")

    import re
    constant_match = re.search(r'GUARDRAILS_VERSION = "([^"]+)"', integrity_file.read_text())
    doc_match = re.search(r'\*\*Version:\*\* ([^\n]+)', guardrails_file.read_text())

    if not constant_match:
        return CheckResult("guardrails_version", False, "GUARDRAILS_VERSION constant not found in integrity.py", "L5-R2")
    if not doc_match:
        return CheckResult("guardrails_version", False, "Version not declared in GUARDRAILS.md", "L5-R2")

    constant_ver = constant_match.group(1).strip()
    doc_ver = doc_match.group(1).strip()

    if constant_ver != doc_ver:
        return CheckResult(
            "guardrails_version",
            False,
            f"Version mismatch — integrity.py: '{constant_ver}', GUARDRAILS.md: '{doc_ver}'",
            "L5-R2",
        )
    return CheckResult(
        "guardrails_version",
        True,
        f"GUARDRAILS version consistent: {constant_ver}",
        "L5-R2",
    )


def main() -> int:
    print("=" * 60)
    print("Mission Control — CI Integrity Checks")
    print("=" * 60)

    results: list[CheckResult] = []

    # Programmatic checks
    results.append(check_dependencies_pinned())
    results.append(check_migrations_have_downgrade())
    results.append(check_todo_count())
    results.append(check_guardrails_version_consistency())

    # Script-based checks
    results.append(run_check(
        "import_boundaries",
        "L4-R3/R4/R5",
        [sys.executable, "scripts/integrity/check_import_boundaries.py"],
    ))

    # Print results
    failed = []
    for r in results:
        status = "✓" if r.passed else "✗"
        print(f"\n{status} [{r.rule}] {r.name}")
        if not r.passed or r.output:
            print(f"  {r.output.replace(chr(10), chr(10) + '  ')}")
        if not r.passed:
            failed.append(r)

    print("\n" + "=" * 60)
    if failed:
        print(f"FAILED: {len(failed)}/{len(results)} checks failed.")
        for f in failed:
            print(f"  ✗ {f.name} ({f.rule})")
        return 1

    print(f"PASSED: All {len(results)} integrity checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
