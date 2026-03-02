# Mission Control — Claude Code Orchestration Rules
**Version:** 1.0.0
**Spec:** SPEC.md v2.0.0 | **Guardrails:** GUARDRAILS.md v1.0.0

---

## Prime Directives

YOU MUST dispatch every task to its designated agent. You never absorb agent tasks directly.
YOU MUST try MCP agents first (DB, File, Container). Autogen agents are fallback only.
YOU MUST use `think hard` before every dispatch plan. Use `ultrathink` for schema or guardrail changes.
YOU MUST read NOTES.md at session start for any COMPLEX or CRITICAL task.

---

## Workflow — ALWAYS in this order

1. **Explore** — read relevant files, query DB Agent for current state. No code, no writes yet.
2. **Plan** — `think hard`. Write plan to NOTES.md. For CRITICAL tasks: create GitHub Issue first.
3. **Test** — write the failing eval case or validation fixture. Commit it before implementation.
4. **Implement** — dispatch to agents. Never modify tests to pass implementation.
5. **Validate** — run `scripts/enforce_practices.py` and `scripts/run_evals.py`. Both must pass.
6. **Commit** — atomic commit with CHANGELOG.md entry. Pre-commit hook will enforce.

---

## Agent Dispatch Rules

**Rule 1 — Agents always.** Never execute agent tasks directly. Orchestrate, dispatch, monitor, report.
**Rule 2 — MCP first.** DB Agent for all data. File Agent for all file writes. Container Agent for all Docker ops.
**Rule 3 — No direct file writes.** All config, YAML, URDF, launch file writes go through File Agent.
**Rule 4 — No direct DB queries.** All database access goes through DB Agent.
**Rule 5 — No direct container exec.** All Docker operations go through Container Agent.
**Rule 6 — No workflow execution.** The Mission Control backend workflow engine owns that. Not you.
**Rule 7 — Verify Autogen init.** Before dispatch, confirm all 6 init params are set (see SPEC §8).
**Rule 8 — Autonomous scope is limited.** You may autonomously monitor, schedule, audit, and notify.
           You may NOT autonomously modify any config, file, container, or workflow without operator approval.

---

## Data Integrity — Non-Negotiable

- All physical values must exist verbatim in the empirical DB for the specific robot_id. No exceptions.
- Unknown values are NULL. Never substitute defaults, estimates, or values from other robots.
- Confidence scores: 1.0 = direct DB match | 0.95 = verified unit conversion | 0.80 = computed from verified | 0.0 = NULL.
- No scores in range 0.01–0.79 are valid. A value is either verified or absent.
- IMPORTANT: Wrong values in simulation are more dangerous than missing values.

---

## Context Management

- Sub-agents return summaries ≤ 2,000 tokens. Never pass raw tool outputs between agents.
- For tasks exceeding ~10 tool calls: initialize NOTES.md, update it continuously, compact before context fills.
- **Preserve in compaction:** registry IDs, NULL fields found, operator decisions, current step, unresolved errors.
- **Discard in compaction:** raw tool outputs, resolved warnings, full YAML/URDF content, redundant status.
- Load knowledge context per task type before dispatch (see README.md knowledge routing table).

---

## Thinking Triggers

- `think` — standard dispatch decisions
- `think hard` — every dispatch plan, architectural decisions, multi-step builds
- `think harder` — validation chain changes, DB schema changes
- `ultrathink` — SPEC changes, GUARDRAILS changes, any change to core integrity code

---

## Prohibited Actions — IMMUTABLE, never remove from this list

- Writing physical constants not verified in the empirical DB for this robot_id
- Generating placeholder, TODO, or estimated values in any config output
- Executing Docker commands directly (bypass Container Agent)
- Writing files to the registry directly (bypass File Agent)
- Querying the DB directly (bypass DB Agent)
- Implementing retry loops outside `backend/core/validation_chain.py`
- Writing directly to the registry DB except through `backend/db/registry/writer.py`
- Importing from `backend/workflow_engine/` in orchestrator code
- Passing agent identity to the Validator Agent (blind validation required)
- Modifying `evals/fixtures/golden_cases.py` to pass a failing implementation
