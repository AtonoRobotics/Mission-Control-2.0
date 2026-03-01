#!/usr/bin/env python3
"""
Mission Control — Module Hash Generator
Regenerates prompts/module_hashes.json after any prompt module change.

Usage:
  python scripts/integrity/generate_module_hashes.py

Must be run (and the result committed) whenever any .md file in prompts/ is changed.
Pre-commit hook enforces this — see .claude/hooks/pre_commit_module_hashes.sh

The module_hashes.json file is the tamper-evident record for all prompt modules.
At startup, backend/core/integrity.py verifies every module against these hashes.
Any mismatch halts agent initialization.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
PROMPTS_ROOT = ROOT / "prompts"
OUTPUT_PATH = PROMPTS_ROOT / "module_hashes.json"


def main() -> int:
    if not PROMPTS_ROOT.exists():
        print(f"✗ prompts/ directory not found at {PROMPTS_ROOT}")
        return 1

    # Import the hash utility from core
    sys.path.insert(0, str(ROOT))
    from backend.core.integrity import compute_current_module_hashes

    hashes = compute_current_module_hashes()

    if not hashes:
        print("✗ No .md files found in prompts/ — nothing to hash.")
        return 1

    OUTPUT_PATH.write_text(
        json.dumps(hashes, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"✓ Generated {len(hashes)} module hashes → {OUTPUT_PATH.relative_to(ROOT)}")
    for module_path, hash_value in sorted(hashes.items()):
        print(f"  {hash_value[:12]}…  {module_path}")

    print(
        "\nIMPORTANT: Commit module_hashes.json alongside your module changes.\n"
        "Pre-commit hook will block commits where hashes are stale."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
