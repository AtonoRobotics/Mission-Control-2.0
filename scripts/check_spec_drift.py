"""
Check SPEC.md assertions against codebase ground truth.
Run in CI or pre-commit to catch spec drift early.

Usage: python scripts/check_spec_drift.py
Exit code: 0 = no drift, 1 = drift detected
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "docs" / "SPEC.md"

drift_found = False


def warn(msg: str):
    global drift_found
    drift_found = True
    print(f"  DRIFT: {msg}")


def check(label: str):
    print(f"\n[{label}]")


def count_alembic_migrations() -> int:
    versions_dir = ROOT / "database" / "registry" / "versions"
    return len([f for f in versions_dir.glob("0*.py") if f.name != "__pycache__"])


def count_registry_tables() -> int:
    models = ROOT / "backend" / "db" / "registry" / "models.py"
    if not models.exists():
        return 0
    content = models.read_text()
    # Count SQLAlchemy model classes (class Foo(Base):)
    return len(re.findall(r"class \w+\(Base\):", content))


def count_api_routers() -> int:
    main_py = ROOT / "backend" / "main.py"
    if not main_py.exists():
        return 0
    content = main_py.read_text()
    return len(re.findall(r"app\.include_router\(", content))


def get_workspace_packages() -> list[str]:
    packages_dir = ROOT / "packages"
    if not packages_dir.exists():
        return []
    return sorted(d.name for d in packages_dir.iterdir() if d.is_dir() and not d.name.startswith("."))


def extract_spec_number(pattern: str) -> int | None:
    """Extract a number from SPEC.md matching a regex pattern."""
    content = SPEC.read_text()
    match = re.search(pattern, content)
    if match:
        return int(match.group(1))
    return None


def spec_contains(text: str) -> bool:
    return text in SPEC.read_text()


def main():
    if not SPEC.exists():
        print("ERROR: docs/SPEC.md not found")
        sys.exit(1)

    spec_text = SPEC.read_text()

    # --- Registry table count ---
    check("Registry DB table count")
    actual_tables = count_registry_tables()
    spec_tables = extract_spec_number(r"Registry.*?(\d+)\s*tables")
    if spec_tables and actual_tables != spec_tables:
        warn(f"SPEC says {spec_tables} registry tables, codebase has {actual_tables} models")
    else:
        print(f"  OK: {actual_tables} tables")

    # --- Migration count ---
    check("Alembic migrations")
    actual_migrations = count_alembic_migrations()
    spec_migration = extract_spec_number(r"0*(\d+)/head\)|migration (\d+)")
    # Check if highest migration number is mentioned
    highest = f"0{actual_migrations:03d}" if actual_migrations < 10 else f"00{actual_migrations}"
    # Simpler: just check the last migration file is referenced
    last_migration = sorted(
        (ROOT / "database" / "registry" / "versions").glob("0*.py")
    )
    if last_migration:
        last_name = last_migration[-1].stem
        if last_name not in spec_text:
            warn(f"Latest migration '{last_name}' not mentioned in SPEC.md")
        else:
            print(f"  OK: {last_name} referenced")

    # --- API router count ---
    check("API router count")
    actual_routers = count_api_routers()
    spec_routers = extract_spec_number(r"(\d+)\s*(?:API\s*)?[Rr]outers")
    if spec_routers and actual_routers != spec_routers:
        warn(f"SPEC says {spec_routers} routers, backend has {actual_routers}")
    else:
        print(f"  OK: {actual_routers} routers")

    # --- Workspace packages ---
    check("Monorepo packages")
    actual_packages = get_workspace_packages()
    for pkg in actual_packages:
        if f"packages/{pkg}" not in spec_text and f"├── {pkg}/" not in spec_text and f"└── {pkg}/" not in spec_text:
            warn(f"Package 'packages/{pkg}/' not mentioned in SPEC.md")
        else:
            print(f"  OK: packages/{pkg}/")

    # --- Stale directory references ---
    check("Stale directory references")
    stale_dirs = ["frontend/src/", "frontend/package.json"]
    for d in stale_dirs:
        # Only flag if the directory doesn't actually exist
        if d in spec_text and not (ROOT / d.rstrip("/")).exists():
            warn(f"SPEC references '{d}' but it doesn't exist")

    # --- Spec version date ---
    check("Spec version freshness")
    version_match = re.search(r"\*Spec v([\d.]+)\s*—\s*(\d{4}-\d{2}-\d{2})\*", spec_text)
    if version_match:
        spec_date = version_match.group(2)
        # Get date of most recent commit that changed backend or packages
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", "backend/", "packages/", "database/"],
            capture_output=True, text=True, cwd=ROOT,
        )
        if result.returncode == 0:
            last_code_change = result.stdout.strip()
            if last_code_change > spec_date:
                warn(f"Code changed on {last_code_change} but SPEC dated {spec_date}")
            else:
                print(f"  OK: spec date {spec_date} >= last code change {last_code_change}")
    else:
        warn("Could not find spec version/date footer")

    # --- Summary ---
    print()
    if drift_found:
        print("SPEC DRIFT DETECTED — update docs/SPEC.md")
        sys.exit(1)
    else:
        print("No spec drift detected.")
        sys.exit(0)


if __name__ == "__main__":
    main()
