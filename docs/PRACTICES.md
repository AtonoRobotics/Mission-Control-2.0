# Mission Control — Anthropic Best Practices Reference
**Version:** 1.0.0
**Sources:** anthropic.com/engineering — all practices link to published Anthropic documentation

This document is the authoritative reference for how Mission Control applies Anthropic's
published best practices. It is enforced by `scripts/enforce_practices.py` and checked
in CI. Every section maps directly to a published Anthropic engineering post.

---

## 1. Context Engineering
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

**Core principle:** Find the smallest possible set of high-signal tokens that maximize
the likelihood of the desired outcome.

### 1.1 Context as a finite resource
Context degrades. As tokens increase, recall accuracy decreases (context rot).
Every token costs attention budget. Treat context like memory — curate aggressively.

**Enforcement:**
- All prompt modules are < 50 lines (checked by `enforce_practices.py`)
- Modules are loaded just-in-time per agent, not pre-loaded for all agents
- Sub-agents return summaries ≤ 2,000 tokens, not raw tool outputs

### 1.2 System prompt altitude
The "Goldilocks zone": specific enough to guide behavior, flexible enough for heuristics.

**Too low (brittle):** Step 1: do X. Step 2: check Y. Step 3: if Z then W.
**Too high (vague):** Be helpful and accurate.
**Right altitude:** Declare intent, outcome, and decision criteria. Let code enforce procedure.

**Enforcement:**
- Prompt modules use XML tags for structure, not numbered lists
- Procedural logic lives in `backend/integrity/` code only
- Module content is intent + outcome + criteria, never step-by-step

### 1.3 Just-in-time context
Agents maintain lightweight identifiers (file paths, robot_ids, registry IDs) and load
data at runtime via tools — never pre-load entire datasets into context.

**Enforcement:**
- DB Agent fetches only requested fields, never full table dumps
- File Agent returns registry IDs, agents fetch content on demand
- Skills load sub-files on demand, not the entire skill directory

### 1.4 Long-horizon tasks (compaction + note-taking)
Tasks exceeding ~10 tool calls require active context management.

**Compaction:** Summarize before context fills. Preserve: registry IDs, NULL fields found,
operator decisions, current step. Discard: raw tool outputs, resolved warnings, XML payloads.

**Note-taking:** Maintain `NOTES.md` as persistent memory. Write state before compaction.
Resume sessions by reading `NOTES.md` first.

**Enforcement:**
- `backend/core/compaction.py` provides compaction and note-taking utilities
- CLAUDE.md instructs Claude Code to use NOTES.md for complex tasks
- Orchestrator `task_complexity.md` triggers note-taking for COMPLEX+ tasks

### 1.5 Sub-agent context isolation
Each sub-agent gets a clean context window. The lead agent synthesizes summaries,
not raw outputs. Sub-agents explore extensively; they return ≤ 2,000 token summaries.

---

## 2. Agent Design
*Source: anthropic.com/research/building-effective-agents*

### 2.1 Orchestrator-worker pattern
One lead agent decomposes tasks. Workers execute focused sub-tasks.
Workers never coordinate directly — all coordination through the orchestrator.

**Enforcement:**
- `prompts/agents/orchestrator/` owns task decomposition
- No agent imports from another agent's directory
- Workers return to orchestrator, never call other workers

### 2.2 Validation chain
Every agent output is validated before registration. The validator is blind to agent identity.
Two retries maximum. Third failure escalates to operator.

**Enforcement:**
- `backend/core/validation_chain.py` is the only retry loop implementation
- File Agent refuses registration without `validation_report_id`
- `backend/integrity/scope_guard.py` enforces agent boundaries deterministically

### 2.3 Tool interface quality
Tool interfaces require the same engineering attention as prompts.
If a human engineer can't say which tool to use, an agent won't either.

**Enforcement:**
- Every infrastructure agent has a `prompts/tools/<agent>.md` with full signatures
- Tools are self-contained, return tokens efficiently, fail explicitly (never silently)
- Tool count per agent is minimal — no overlapping tool functionality

### 2.4 Task complexity scaling
Simple tasks use 1 agent + structural validation.
Complex tasks use multiple agents + full validation chain + audit.
Critical tasks require human checkpoint before registration.

**Enforcement:**
- `prompts/agents/orchestrator/task_complexity.md` defines 4 tiers
- Orchestrator classifies every task before dispatch
- Tool call budgets are set per tier

### 2.5 Parallel dispatch rules
Parallel only when outputs are fully independent (neither reads from the other).
Sequential is always safe. Parallel is an optimization, never a requirement.

**Enforcement:**
- `prompts/agents/orchestrator/parallel_dispatch.md` defines the decision rule
- Orchestrator documents the independence rationale before parallel dispatch

---

## 3. Prompt Engineering
*Source: anthropic.com/engineering/claude-code-best-practices + docs.anthropic.com/prompt-engineering*

### 3.1 XML structure
Use XML tags to delimit prompt sections. Reliable, unambiguous, model-native.

**Required tags:** `<agent_boundaries>`, `<tool_interfaces>`, `<verdict_criteria>`,
`<thinking_instruction>`, `<enforcement_note>`, `<output_contract>`

**Enforcement:**
- Checked by `enforce_practices.py` — modules without XML tags are flagged

### 3.2 Extended thinking triggers
Use "think" keywords to trigger extended thinking. Each level allocates more compute.

- `think` — standard problems
- `think hard` — architectural decisions, multi-step plans
- `think harder` — validation chain changes, DB schema changes
- `ultrathink` — spec changes, guardrails changes

**Enforcement:**
- `prompts/modules/core/thinking_triggers.md` defines when each level applies
- Orchestrator uses `think hard` before every dispatch plan

### 3.3 Few-shot examples
Curate diverse canonical examples, not exhaustive edge case lists.
Examples are "pictures worth a thousand words" — choose quality over quantity.

**Enforcement:**
- Agent modules may contain ≤ 3 examples (more than 3 = review required)
- Examples must be in `<example>` XML tags

### 3.4 CLAUDE.md as a tuned prompt
CLAUDE.md files are part of Claude's context — they are prompts, not documentation.
Iterate on them like prompts. Use "IMPORTANT" and "YOU MUST" for critical rules.
Run through the prompt improver periodically.

**Enforcement:**
- Root CLAUDE.md ≤ 100 lines (concise, not a manual)
- Sub-directory CLAUDE.md files ≤ 40 lines
- Checked by `enforce_practices.py`

---

## 4. Autonomous Development Workflow
*Source: anthropic.com/engineering/claude-code-best-practices*

### 4.1 Explore → Plan → Code → Commit
Never jump straight to implementation. Research first, plan second, code third.

1. Read relevant files. Use sub-agents for parallel investigation. No code yet.
2. Create plan in NOTES.md or GitHub Issue. Get confirmation before coding.
3. Write tests first (TDD). Commit tests before implementation.
4. Implement. Tests are fixed targets — never modify tests to pass implementation.
5. Validate. Both evals and integrity checks must pass.
6. Commit with CHANGELOG.md entry.

**Enforcement:**
- `/project:build-urdf` slash command encodes this workflow
- Pre-commit hook blocks commits without CHANGELOG.md entry
- `CLAUDE.md` instructs Claude Code to follow this order

### 4.2 Test-driven development
Write tests before implementation. Tests are the specification.
Use sub-agents to verify implementation isn't overfitting to tests.

**Enforcement:**
- `evals/fixtures/golden_cases.py` are the ground truth — never modified to pass
- Tests live in `tests/unit/`, `tests/integration/`, `tests/e2e/`
- CI runs evals before accepting any merge

### 4.3 Subagent verification
For complex implementations, use a separate agent to verify the first agent's work.
Independent context = independent judgment.

**Pattern:** Agent A writes → Agent B reviews (no shared context) → Agent C synthesizes

**Enforcement:**
- `prompts/agents/orchestrator/task_complexity.md` COMPLEX tier requires review agent
- Validation chain is the structural implementation of this pattern

### 4.4 Headless mode for automation
`claude -p` for CI, pre-commit hooks, and batch operations.
Used for: subjective prompt review, scope consistency checks, CHANGELOG validation.

**Enforcement:**
- `scripts/ci/claude_review.sh` implements headless Claude reviews
- Pre-commit hook chains deterministic checks + claude -p checks

### 4.5 Git worktrees for parallel work
Multiple independent tasks → multiple worktrees → multiple Claude Code instances.

```bash
git worktree add ../mc-backend backend-branch
git worktree add ../mc-prompts prompts-branch
# Each gets its own Claude Code instance
```

---

## 5. Evaluation Framework
*Source: anthropic.com/research/building-effective-agents (evaluation section)*

### 5.1 Start immediately with small samples
20 representative cases reveal large effect sizes (30%→80% swings from prompt changes).
Add evals BEFORE adding features.

**Categories required:** correct outputs, hallucinations, silent NULL fills,
scope violations, intent mismatches.

**Enforcement:**
- `evals/fixtures/golden_cases.py` — minimum 20 cases at all times
- Eval suite runs in CI before every merge
- Checked by `enforce_practices.py` — fewer than 20 cases = BLOCK

### 5.2 Deterministic evaluation layer
Run deterministic code-layer checks first (no LLM cost).
LLM-based evaluation only for what deterministic checks can't catch.

**Enforcement:**
- `evals/runners/run_evals.py` runs deterministic checks only
- `scripts/ci/claude_review.sh` adds LLM layer for prompt review

### 5.3 Mock DB for full integration
DB cross-check evals require a fixture database, not mocks.
Real DB queries against fixture data = accurate confidence score testing.

**Enforcement:**
- `evals/fixtures/mock_db.py` provides the fixture DB
- B-* and C-* eval cases require DB cross-check to pass correctly

---

## 6. Data Integrity
*Source: Mission Control empirical data principles*

### 6.1 NULL over estimates
Unverified physical values are NULL. Always. No defaults, no domain knowledge substitution.
Wrong values in simulation are more dangerous than missing values.

### 6.2 Confidence scores
- `1.0` — direct DB match
- `0.95` — DB match with verified unit conversion
- `0.80` — computed from verified empirical values (state method)
- `0.0` — no source → field is NULL

Scores 0.01–0.79 are invalid — a value is either verified or absent.

### 6.3 Empirical DB as single source of truth
All physical constants come from manufacturer CAD (mass/inertia) or datasheets (limits).
The DB feeds URDF, cuRobo config, and simulation — nothing is computed at build time.

---

## Enforcement Summary

| Tool | What it checks | When it runs |
|---|---|---|
| `enforce_practices.py` | All 6 sections above | Every session start, CI |
| `run_ci_checks.py` | Guardrails L1-L6 | Pre-commit, CI |
| `run_evals.py` | 20 golden cases | Pre-commit, CI |
| `claude_review.sh` | Subjective prompt quality | PR review, `--full` flag |
| Pre-commit hook | Version bumps, hashes, CHANGELOG | Every commit |
| `context_budget.py` | Token counts per agent | Runtime (logged) |

A BLOCK violation from any tool prevents merge. WARN violations require operator acknowledgment.
