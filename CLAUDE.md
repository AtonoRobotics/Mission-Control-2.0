# Mission Control — Cinema Robot Digital Twin
**Version:** 3.0.0 | **Guardrails:** 1.0.0 | **Schema:** 3.1.0

## Bash commands
- `python scripts/enforce_practices.py` — **run this first, always** — full practice audit
- `python evals/runners/run_evals.py` — run all 20 golden eval cases
- `python evals/runners/run_evals.py --category scope_violation` — single category
- `python scripts/integrity/run_ci_checks.py` — all deterministic integrity checks
- `python scripts/integrity/generate_module_hashes.py` — regenerate after any prompts/ edit
- `python scripts/integrity/check_import_boundaries.py` — check architectural boundaries
- `python -m pytest tests/ -v` — run test suite
- `docker compose ps` — container status (READ ONLY — use Container Agent to exec)
- `git worktree add ../mc-<name> <branch>` — parallel work on independent subsystems

## Workflow — ALWAYS in this order (Anthropic: Explore → Plan → Code → Commit)
1. **Explore** — read relevant files. Use subagents for parallel investigation. No code yet.
2. **Plan** — use `think hard`. For COMPLEX/CRITICAL tasks: create GitHub Issue or NOTES.md with plan before touching code.
3. **Test first** — write failing test/eval case. Commit tests before implementation.
4. **Implement** — write code to pass tests. Do not modify tests.
5. **Validate** — `python scripts/enforce_practices.py && python evals/runners/run_evals.py`. Both must pass.
6. **Commit** — atomic commit with CHANGELOG.md entry. Version bump if prompts/ or docs/SPEC.md changed.

Use **"think hard"** before architectural decisions. Use **"ultrathink"** for validation chain or guardrails changes.

## Project structure
- `CLAUDE.md` — this file (root, loaded always)
- `backend/CLAUDE.md` — loaded in backend/ (architecture, async, DB rules)
- `prompts/CLAUDE.md` — loaded in prompts/ (version rules, altitude, module size)
- `evals/CLAUDE.md` — loaded in evals/ (how to run, add cases, categories)
- `agents/CLAUDE.md` — loaded in agents/ (agent development rules)
- `tests/CLAUDE.md` — loaded in tests/ (testing patterns, fixture rules)
- `backend/core/validation_chain.py` — THE validation chain (do not bypass, MAX_RETRIES=2)
- `backend/core/prompt_loader.py` — modular prompt assembly, AGENT_MODULE_MANIFEST
- `backend/core/integrity.py` — startup integrity checks, version constants
- `backend/core/enforcement.py` — runtime best-practice enforcement (new)
- `backend/core/context_budget.py` — per-agent token budget tracking (new)
- `backend/core/compaction.py` — long-horizon context compaction
- `backend/integrity/` — deterministic guardrail checkers (NO LLM, NO exceptions)
- `prompts/modules/` — reusable prompt fragments, each MUST be < 50 lines
- `prompts/agents/` — per-agent role/task modules
- `prompts/skills/` — Anthropic Skills format (YAML frontmatter + sub-files)
- `prompts/tools/` — tool interface definitions (all 3 infrastructure agents)
- `evals/fixtures/golden_cases.py` — 20 golden cases, add new cases BEFORE features
- `scripts/enforce_practices.py` — comprehensive Anthropic practice audit
- `docs/BEST_PRACTICES.md` — source-cited practice reference
- `docs/GUARDRAILS.md` — 30 rules across 6 layers
- `.mcp.json` — MCP servers (checked in — team-wide)
- `.claude/settings.json` — tool allowlist (pre-approved safe operations)
- `.claude/commands/` — slash commands (checked in — team-wide)

## Code style
- Python 3.11+, type hints on EVERY function and variable
- Dataclasses over raw dicts for all structured data
- `async/await` everywhere — never block the event loop
- `structlog` only — never `print()` in production code
- Absolute imports only: `from backend.integrity.scope_guard import ScopeGuard`
- DB writes: ONLY through `backend/db/registry/writer.py`
- Retry loops: ONLY in `backend/core/validation_chain.py`

## Prime directives — non-negotiable
1. **YOU MUST dispatch** — never execute agent tasks yourself. Every task goes to the appropriate agent.
2. **YOU MUST validate** — every agent output goes through the validation chain before File Agent.
3. **NULL over estimates** — unverified physical values are NULL. Never substitute defaults.
4. **YOU MUST version bump** — any change to `prompts/`, `docs/SPEC.md`, or `docs/GUARDRAILS.md` requires version increment + hash update.
5. **IMPORTANT: context budget** — check `backend/core/context_budget.py` limits before loading modules.

## Context management (Anthropic: context engineering)
- Load domain skills ON DEMAND via SKILL.md triggers — not pre-loaded:
  - `prompts/skills/groot/SKILL.md` — GR00T N1.6 training, fine-tuning, Mimic/Dreams synthetic data
  - `prompts/skills/cosmos/SKILL.md` — Cosmos-Predict2.5 world model, Transfer2.5 sim2real
  - `prompts/skills/ecosystem/SKILL.md` — LeRobot datasets, NeMo Curator, cross-stack tools
  - `prompts/skills/curob_jerk/SKILL.md` — cuRobo jerk minimization config and validation
  - `prompts/skills/isaac_pipeline/SKILL.md` — Isaac Sim/Lab/ROS containers, URDF import, USD schema
  - `prompts/skills/cinema_robot_domain/SKILL.md` — 6-axis cinema arm geometry, FIZ axes, artifacts
  Read the matching SKILL.md BEFORE writing any code in that domain. It defines scope and invariants.
- For tasks > 10 tool calls: maintain `NOTES.md` at project root
- On context pressure: call `compaction.build_compaction_prompt()` to summarize
- Sub-agent summaries: ≤ 2,000 tokens — explore extensively, return concisely
- Use `think hard` before loading large modules — can this task be done without it?

## Long-horizon tasks — NOTES.md protocol
```
# Write at task start:
compaction.initialize_notes(task, robot_ids, complexity, plan)

# Update continuously:  
compaction.update_current_state("Currently: step 3/7, URDF registered, USD pending")

# After each artifact:
compaction.register_artifact(registry_id, artifact_type, robot_id)
```

## Parallel work — git worktrees
```bash
git worktree add ../mc-prompts prompts-branch   # prompt work
git worktree add ../mc-backend backend-branch   # backend work
# Each gets its own Claude Code session
```
Use when: backend + prompts work is independent. Do not use for dependent changes.

## Session start — IMPORTANT: run these before any work
```bash
python scripts/enforce_practices.py     # comprehensive practice check
python scripts/integrity/run_ci_checks.py  # must pass
python evals/runners/run_evals.py       # confirm baseline
```
If any fail: FIX before anything else.

## Warnings — read before every session
- NEVER write to empirical DB — READ ONLY from all application code
- NEVER hardcode paths — all paths come from `.env.machines` env vars
- NEVER add a prompt module > 50 lines — split into sub-files
- NEVER skip `generate_module_hashes.py` after editing prompts/
- NEVER commit without CHANGELOG.md entry
- ROS2 Jazzy lives EXCLUSIVELY in `isaac-ros-main` container — never install locally
- cuRobo scope: jerk minimization ONLY — no collision, path planning, or obstacle params
