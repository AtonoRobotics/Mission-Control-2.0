# prompts/ — Modular Prompt System
Loaded automatically when working in prompts/ subdirectory.

## Rules — IMPORTANT
- Every .md file MUST have `# Version: X.Y.Z` at line 3
- Bump version on EVERY edit — pre-commit hook blocks commits with stale versions
- Run `python scripts/integrity/generate_module_hashes.py` after ANY edit here
- Commit `module_hashes.json` in the same commit as the module change
- Module size limit: < 50 lines. Split into sub-files if exceeding.

## Structure
- `modules/core/` — universal rules loaded by all agents (never_do, null_policy, output_schema)
- `modules/domain/` — cinema robot domain knowledge
- `modules/validation/` — validator-specific checks
- `agents/<name>/` — per-agent role, rules, output schema
- `skills/<name>/SKILL.md` — Anthropic Skills format with YAML frontmatter
- `tools/` — tool interface definitions (db_agent, file_agent, container_agent)

## Prompt altitude rule
System prompts declare INTENT and OUTCOME — not step-by-step procedure.
Procedural logic lives in `backend/integrity/` code, not in prompts.
Wrong: "Step 1: check this. Step 2: check that."
Right: "Your purpose is X. You verify Y. Your verdict is PASS|WARN|FAIL based on Z."

## Adding a new agent
1. Create `prompts/agents/<name>/role.md` — identity and purpose (< 20 lines)
2. Add to `backend/core/prompt_loader.py` AGENT_MODULE_MANIFEST
3. Add scope definition to `backend/integrity/scope_guard.py` AGENT_SCOPE
4. Add 2+ golden eval cases (one PASS, one FAIL) to `evals/fixtures/golden_cases.py`
5. Run `generate_module_hashes.py` and commit hashes
