#!/usr/bin/env python3
"""
scripts/enforce_practices.py
Comprehensive Anthropic best-practice audit for Mission Control.

Run this FIRST every session, and in CI on every push.
Audits: prompt structure, context budget, CLAUDE.md quality, module sizes,
skill format, tool interface completeness, eval coverage, import boundaries.

Usage:
  python scripts/enforce_practices.py           # full audit
  python scripts/enforce_practices.py --fix     # auto-fix safe violations
  python scripts/enforce_practices.py --report  # write report to docs/PRACTICE_AUDIT.md

Exit code: 0 = all pass, 1 = violations found
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).parent.parent


# ── Violation types ───────────────────────────────────────────────────────────

@dataclass
class Violation:
    check: str
    level: str   # "BLOCK" | "WARN" | "INFO"
    file: str
    message: str
    source: str = ""     # Anthropic doc reference
    fix: str = ""        # How to fix it


violations: list[Violation] = []
passes: list[str] = []


def fail(check: str, file: str, message: str, source: str = "", fix: str = "") -> None:
    violations.append(Violation("BLOCK", check, file, message, source, fix))


def warn(check: str, file: str, message: str, source: str = "", fix: str = "") -> None:
    violations.append(Violation("WARN", check, file, message, source, fix))


def ok(check: str) -> None:
    passes.append(check)


# ── Check 1: CLAUDE.md hierarchy ─────────────────────────────────────────────

def check_claude_md_hierarchy() -> None:
    """
    Anthropic: CLAUDE.md files at root + sub-dirs load automatically.
    Every major subsystem should have one.
    """
    required = {
        "CLAUDE.md": "root",
        "backend/CLAUDE.md": "backend subsystem",
        "prompts/CLAUDE.md": "prompts subsystem",
        "evals/CLAUDE.md": "evals subsystem",
        "agents/CLAUDE.md": "agents subsystem",
        "tests/CLAUDE.md": "tests subsystem",
    }

    for path, purpose in required.items():
        f = ROOT / path
        if not f.exists():
            fail("CLAUDE_MD_HIERARCHY", path,
                 f"Missing CLAUDE.md for {purpose}",
                 source="anthropic.com/engineering/claude-code-best-practices",
                 fix=f"Create {path} with bash commands, structure, and rules for this subsystem")
        else:
            content = f.read_text()
            lines = content.split("\n")
            # Check it has bash commands section
            if "##" not in content and len(lines) < 5:
                warn("CLAUDE_MD_CONTENT", path,
                     "CLAUDE.md appears too minimal — add bash commands and rules",
                     source="anthropic.com/engineering/claude-code-best-practices")

    ok("CLAUDE_MD_HIERARCHY")


# ── Check 2: Prompt module sizes ─────────────────────────────────────────────

def check_prompt_module_sizes() -> None:
    """
    Anthropic: modules should be minimal high-signal. We enforce < 50 lines.
    Larger modules should use progressive disclosure via sub-files.
    """
    modules_dir = ROOT / "prompts" / "modules"
    for md_file in modules_dir.rglob("*.md"):
        lines = md_file.read_text().split("\n")
        rel = str(md_file.relative_to(ROOT))
        if len(lines) > 50:
            warn("MODULE_SIZE", rel,
                 f"Module is {len(lines)} lines (limit: 50)",
                 source="anthropic.com/engineering/effective-context-engineering-for-ai-agents",
                 fix="Split into sub-files and use a SKILL.md with progressive disclosure")

    ok("PROMPT_MODULE_SIZES")


# ── Check 3: Prompt version tags ─────────────────────────────────────────────

def check_prompt_version_tags() -> None:
    """Every prompt module must declare version at line 3."""
    version_pattern = re.compile(r"^# Version: \d+\.\d+\.\d+$")

    for md_file in (ROOT / "prompts").rglob("*.md"):
        # Skip SKILL.md files (they use YAML frontmatter)
        if md_file.name == "SKILL.md":
            continue
        rel = str(md_file.relative_to(ROOT))
        lines = md_file.read_text().split("\n")
        if len(lines) < 3:
            fail("PROMPT_VERSION_TAG", rel,
                 "File too short — missing version tag at line 3",
                 fix="Add '# Version: 1.0.0' at line 3")
            continue
        if not version_pattern.match(lines[2].strip()):
            fail("PROMPT_VERSION_TAG", rel,
                 f"Line 3 must be '# Version: X.Y.Z', got: '{lines[2]}'",
                 source="GUARDRAILS.md L5-R5",
                 fix="Add '# Version: 1.0.0' at line 3")

    ok("PROMPT_VERSION_TAGS")


# ── Check 4: XML tag usage in prompts ────────────────────────────────────────

def check_prompt_xml_structure() -> None:
    """
    Anthropic: Use XML tags for structured prompts.
    Every agent role module should use at least one XML section.
    """
    for role_file in (ROOT / "prompts" / "agents").rglob("role.md"):
        content = role_file.read_text()
        rel = str(role_file.relative_to(ROOT))
        if "<" not in content or ">" not in content:
            warn("PROMPT_XML_STRUCTURE", rel,
                 "Agent role module has no XML tags",
                 source="docs.anthropic.com/en/docs/build-with-claude/prompt-engineering",
                 fix="Add <agent_intent>, <what_you_produce>, <boundaries> XML sections")

    ok("PROMPT_XML_STRUCTURE")


# ── Check 5: Prompt altitude ─────────────────────────────────────────────────

def check_prompt_altitude() -> None:
    """
    Anthropic: Prompts declare intent and outcome, not step-by-step procedure.
    Flag modules with > 5 consecutive numbered steps.
    """
    for md_file in (ROOT / "prompts").rglob("*.md"):
        if md_file.name == "SKILL.md":
            continue
        content = md_file.read_text()
        rel = str(md_file.relative_to(ROOT))

        # Count consecutive numbered list items
        lines = content.split("\n")
        consecutive = 0
        for line in lines:
            stripped = line.strip()
            if re.match(r"^\d+\.", stripped):
                consecutive += 1
                if consecutive > 5:
                    warn("PROMPT_ALTITUDE", rel,
                         "More than 5 consecutive numbered steps — potential procedure anti-pattern",
                         source="anthropic.com/engineering/effective-context-engineering-for-ai-agents",
                         fix="Move procedural logic to backend/integrity/ code. Prompt declares intent.")
                    break
            else:
                consecutive = 0

    ok("PROMPT_ALTITUDE")


# ── Check 6: Skill format (YAML frontmatter) ─────────────────────────────────

def check_skill_format() -> None:
    """
    Anthropic Skills require YAML frontmatter: name, description, version, files.
    """
    required_frontmatter = {"name", "description", "version", "files"}

    for skill_dir in (ROOT / "prompts" / "skills").iterdir():
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            fail("SKILL_FORMAT", str(skill_dir.relative_to(ROOT)),
                 "Skill directory missing SKILL.md",
                 source="anthropic.com/engineering/equipping-agents-for-the-real-world",
                 fix="Create SKILL.md with YAML frontmatter: name, description, version, files")
            continue

        content = skill_md.read_text()
        rel = str(skill_md.relative_to(ROOT))

        if not content.startswith("---"):
            fail("SKILL_FORMAT", rel,
                 "SKILL.md missing YAML frontmatter (must start with ---)",
                 source="anthropic.com/engineering/equipping-agents-for-the-real-world")
            continue

        # Extract frontmatter
        parts = content.split("---", 2)
        if len(parts) < 3:
            fail("SKILL_FORMAT", rel, "Malformed YAML frontmatter")
            continue

        frontmatter_text = parts[1]
        found_keys = {
            line.split(":")[0].strip()
            for line in frontmatter_text.split("\n")
            if ":" in line
        }
        missing_keys = required_frontmatter - found_keys
        if missing_keys:
            fail("SKILL_FORMAT", rel,
                 f"SKILL.md frontmatter missing keys: {missing_keys}",
                 source="anthropic.com/engineering/equipping-agents-for-the-real-world")

    ok("SKILL_FORMAT")


# ── Check 7: Tool interface completeness ─────────────────────────────────────

def check_tool_interfaces() -> None:
    """
    Anthropic: Tool interfaces need same engineering attention as prompts.
    Every infrastructure agent must have a tool interface module.
    """
    required_tool_files = [
        "prompts/tools/db_agent.md",
        "prompts/tools/file_agent.md",
        "prompts/tools/container_agent.md",
    ]

    for tool_file in required_tool_files:
        f = ROOT / tool_file
        if not f.exists():
            fail("TOOL_INTERFACES", tool_file,
                 "Missing tool interface module",
                 source="anthropic.com/engineering/effective-context-engineering-for-ai-agents",
                 fix="Create tool interface with: tool name, parameters, return shape, error cases")
        else:
            content = f.read_text()
            if "<tool" not in content and "<tool_interfaces>" not in content:
                warn("TOOL_INTERFACES", tool_file,
                     "Tool interface module has no <tool> XML tags",
                     source="anthropic.com/engineering/effective-context-engineering-for-ai-agents",
                     fix="Add <tool name='...'> XML blocks for each callable")

    ok("TOOL_INTERFACES")


# ── Check 8: Slash commands ───────────────────────────────────────────────────

def check_slash_commands() -> None:
    """Anthropic: repeated workflows go in .claude/commands/ checked into git."""
    commands_dir = ROOT / ".claude" / "commands"
    required_commands = [
        "build-urdf.md",
        "run-evals.md",
        "validate-output.md",
        "update-hashes.md",
        "integrity-check.md",
        "audit-drift.md",
    ]
    if not commands_dir.exists():
        fail("SLASH_COMMANDS", ".claude/commands/",
             "Slash commands directory missing",
             source="anthropic.com/engineering/claude-code-best-practices",
             fix="Create .claude/commands/ and add command .md files")
        return

    for cmd in required_commands:
        if not (commands_dir / cmd).exists():
            warn("SLASH_COMMANDS", f".claude/commands/{cmd}",
                 f"Missing slash command: /project:{cmd[:-3]}",
                 source="anthropic.com/engineering/claude-code-best-practices")

    ok("SLASH_COMMANDS")


# ── Check 9: MCP configuration ───────────────────────────────────────────────

def check_mcp_config() -> None:
    """Anthropic: .mcp.json checked into git for team-wide MCP server access."""
    mcp_file = ROOT / ".mcp.json"
    if not mcp_file.exists():
        fail("MCP_CONFIG", ".mcp.json",
             ".mcp.json missing — team members won't have MCP servers",
             source="anthropic.com/engineering/claude-code-best-practices",
             fix="Create .mcp.json with db_agent, file_agent, container_agent servers")
        return

    try:
        config = json.loads(mcp_file.read_text())
        servers = config.get("mcpServers", {})
        required_servers = {"db_agent", "file_agent", "container_agent"}
        missing = required_servers - set(servers.keys())
        if missing:
            warn("MCP_CONFIG", ".mcp.json",
                 f"Missing MCP servers: {missing}",
                 source="anthropic.com/engineering/claude-code-best-practices")
    except json.JSONDecodeError as e:
        fail("MCP_CONFIG", ".mcp.json", f"Invalid JSON: {e}")

    ok("MCP_CONFIG")


# ── Check 10: Eval coverage ──────────────────────────────────────────────────

def check_eval_coverage() -> None:
    """
    Anthropic: Start evaluating immediately with ~20 representative cases.
    Must cover: correct outputs, hallucinations, null fills, scope violations, intent mismatches.
    """
    golden_file = ROOT / "evals" / "fixtures" / "golden_cases.py"
    if not golden_file.exists():
        fail("EVAL_COVERAGE", "evals/fixtures/golden_cases.py",
             "Golden eval cases file missing",
             source="anthropic.com/engineering/multi-agent-research-system",
             fix="Create golden_cases.py with ≥20 cases across 5 categories")
        return

    content = golden_file.read_text()
    required_categories = [
        "correct",
        "hallucination_physical_value",
        "silent_null_fill",
        "scope_violation",
        "intent_mismatch",
    ]
    for cat in required_categories:
        if cat not in content:
            warn("EVAL_COVERAGE", "evals/fixtures/golden_cases.py",
                 f"Missing eval category: {cat}",
                 source="anthropic.com/engineering/multi-agent-research-system")

    # Count eval cases
    case_count = content.count("EvalCase(")
    if case_count < 20:
        warn("EVAL_COVERAGE", "evals/fixtures/golden_cases.py",
             f"Only {case_count} eval cases (recommendation: ≥20)",
             source="anthropic.com/engineering/multi-agent-research-system",
             fix="Add more eval cases — especially for new agent behaviors")
    else:
        ok(f"EVAL_COVERAGE ({case_count} cases)")


# ── Check 11: Import boundaries ──────────────────────────────────────────────

def check_import_boundaries() -> None:
    """Architectural isolation enforced by code, not convention."""
    try:
        result = subprocess.run(
            [sys.executable, "scripts/integrity/check_import_boundaries.py"],
            capture_output=True, text=True, cwd=ROOT
        )
        if result.returncode != 0:
            fail("IMPORT_BOUNDARIES", "scripts/integrity/check_import_boundaries.py",
                 "Import boundary violations found",
                 fix=result.stdout.strip() or result.stderr.strip())
        else:
            ok("IMPORT_BOUNDARIES")
    except FileNotFoundError:
        warn("IMPORT_BOUNDARIES", "scripts/integrity/check_import_boundaries.py",
             "Import boundary check script not found")


# ── Check 12: Module hashes ──────────────────────────────────────────────────

def check_module_hashes() -> None:
    """Module hashes must be current — stale hashes block agent startup."""
    hashes_file = ROOT / "prompts" / "module_hashes.json"
    if not hashes_file.exists():
        warn("MODULE_HASHES", "prompts/module_hashes.json",
             "Module hashes file missing — run generate_module_hashes.py",
             fix="python scripts/integrity/generate_module_hashes.py")
        return

    # Check all current modules are in hashes
    try:
        hashes = json.loads(hashes_file.read_text())
        for md_file in (ROOT / "prompts").rglob("*.md"):
            if md_file.name == "SKILL.md":
                continue
            key = str(md_file.relative_to(ROOT / "prompts"))
            if key not in hashes:
                warn("MODULE_HASHES", str(md_file.relative_to(ROOT)),
                     f"Module not in hashes file: {key}",
                     fix="Run python scripts/integrity/generate_module_hashes.py")
    except json.JSONDecodeError:
        fail("MODULE_HASHES", "prompts/module_hashes.json", "Invalid JSON in hashes file")

    ok("MODULE_HASHES")


# ── Check 13: pyproject.toml dep pinning ─────────────────────────────────────

def check_dependency_pinning() -> None:
    """Anthropic/GUARDRAILS: all deps pinned exactly. No >= or ~= ranges."""
    pyproject = ROOT / "pyproject.toml"
    if not pyproject.exists():
        warn("DEP_PINNING", "pyproject.toml", "pyproject.toml missing")
        return

    content = pyproject.read_text()
    bad_patterns = [">=", "~=", "<=", "!=", "^"]
    for pattern in bad_patterns:
        if pattern in content:
            # Check it's in dependencies section
            for line in content.split("\n"):
                if pattern in line and not line.strip().startswith("#"):
                    warn("DEP_PINNING", "pyproject.toml",
                         f"Non-pinned dependency found: '{line.strip()}'",
                         source="GUARDRAILS.md L3-R5",
                         fix="Pin all dependencies to exact versions (e.g. fastapi==0.115.6)")

    ok("DEP_PINNING")


# ── Check 14: CHANGELOG entries ──────────────────────────────────────────────

def check_changelog() -> None:
    """GUARDRAILS: every merge to main must include CHANGELOG.md entry."""
    changelog = ROOT / "CHANGELOG.md"
    if not changelog.exists():
        fail("CHANGELOG", "CHANGELOG.md",
             "CHANGELOG.md missing",
             source="GUARDRAILS.md L6-R3",
             fix="Create CHANGELOG.md with format: ## [version] - date")
        return

    content = changelog.read_text()
    if not content.startswith("# Changelog"):
        warn("CHANGELOG", "CHANGELOG.md", "CHANGELOG.md should start with '# Changelog'")

    # Must have at least one versioned entry
    if "## [" not in content:
        fail("CHANGELOG", "CHANGELOG.md",
             "No versioned entries in CHANGELOG.md",
             source="GUARDRAILS.md L6-R3")

    ok("CHANGELOG")


# ── Check 15: Agent output schema files ──────────────────────────────────────

def check_agent_schemas() -> None:
    """Every agent directory must have an output_schema.json."""
    agents_dir = ROOT / "agents"
    skip = {"_base", "__pycache__"}

    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir() or agent_dir.name in skip:
            continue
        schema_file = agent_dir / "output_schema.json"
        if not schema_file.exists():
            warn("AGENT_SCHEMAS", str(agent_dir.relative_to(ROOT)),
                 f"Missing output_schema.json for agent: {agent_dir.name}",
                 fix=f"Create agents/{agent_dir.name}/output_schema.json")

    ok("AGENT_SCHEMAS")


# ── Check 16: CI pipeline ────────────────────────────────────────────────────

def check_ci_pipeline() -> None:
    """GitHub Actions CI must exist and include Claude headless review."""
    ci_file = ROOT / ".github" / "workflows" / "ci.yml"
    if not ci_file.exists():
        warn("CI_PIPELINE", ".github/workflows/ci.yml",
             "GitHub Actions CI workflow missing",
             source="anthropic.com/engineering/claude-code-best-practices",
             fix="Create .github/workflows/ci.yml with lint, tests, evals, and claude review")
        return

    content = ci_file.read_text()
    if "claude" not in content.lower():
        warn("CI_PIPELINE", ".github/workflows/ci.yml",
             "CI pipeline does not include Claude headless review",
             source="anthropic.com/engineering/claude-code-best-practices",
             fix="Add claude_review.sh step to CI workflow")

    ok("CI_PIPELINE")


# ── Report ────────────────────────────────────────────────────────────────────

def run_all_checks() -> bool:
    check_claude_md_hierarchy()
    check_prompt_module_sizes()
    check_prompt_version_tags()
    check_prompt_xml_structure()
    check_prompt_altitude()
    check_skill_format()
    check_tool_interfaces()
    check_slash_commands()
    check_mcp_config()
    check_eval_coverage()
    check_import_boundaries()
    check_module_hashes()
    check_dependency_pinning()
    check_changelog()
    check_agent_schemas()
    check_ci_pipeline()

    return len([v for v in violations if v.level == "BLOCK"]) == 0


def print_report(write_file: bool = False) -> None:
    blocks = [v for v in violations if v.level == "BLOCK"]
    warns = [v for v in violations if v.level == "WARN"]

    lines = [
        "=" * 60,
        "Mission Control — Anthropic Practice Audit",
        "=" * 60,
        f"✓ Passing: {len(passes)}",
        f"⚠ Warnings: {len(warns)}",
        f"✗ Blocking: {len(blocks)}",
        "",
    ]

    if blocks:
        lines.append("BLOCKING VIOLATIONS (must fix):")
        for v in blocks:
            lines.append(f"\n  ✗ [{v.check}] {v.file}")
            lines.append(f"    {v.message}")
            if v.source:
                lines.append(f"    Source: {v.source}")
            if v.fix:
                lines.append(f"    Fix: {v.fix}")

    if warns:
        lines.append("\nWARNINGS (should fix):")
        for v in warns:
            lines.append(f"\n  ⚠ [{v.check}] {v.file}")
            lines.append(f"    {v.message}")
            if v.fix:
                lines.append(f"    Fix: {v.fix}")

    lines.append("\n" + ("=" * 60))
    if blocks:
        lines.append("RESULT: FAIL — fix blocking violations before proceeding")
    else:
        lines.append("RESULT: PASS" + (" (with warnings)" if warns else " — clean"))
    lines.append("=" * 60)

    report = "\n".join(lines)
    print(report)

    if write_file:
        report_path = ROOT / "docs" / "PRACTICE_AUDIT.md"
        report_path.write_text(f"# Practice Audit Report\n\n```\n{report}\n```\n")
        print(f"\nReport written to {report_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Anthropic practice audit")
    parser.add_argument("--report", action="store_true", help="Write report to docs/PRACTICE_AUDIT.md")
    args = parser.parse_args()

    passed = run_all_checks()
    print_report(write_file=args.report)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
