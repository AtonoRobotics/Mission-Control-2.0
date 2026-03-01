# Context Engineering — Mission Control Reference
**Version:** 1.0.0
**Source:** anthropic.com/engineering/effective-context-engineering-for-ai-agents

Context engineering is the discipline of curating what information enters each agent's
context window to maximize quality while minimizing token cost. This document covers
the principles, the patterns we use, and how they are implemented in this project.

---

## Core principle

> Find the smallest possible set of high-signal tokens that maximize the likelihood
> of the desired outcome. — Anthropic Applied AI team

Context is not free. Every token costs attention budget, and as context fills, recall
accuracy degrades (context rot). The goal is always: less is more, if the fewer tokens
are the right tokens.

---

## The four levers

### 1. System prompt altitude

Prompts live in a "Goldilocks zone" between two failure modes:

| Too low (brittle) | Right altitude | Too high (vague) |
|---|---|---|
| Step 1: check X. Step 2: if Y then Z. | Declare intent, outcome, criteria. | Be helpful and accurate. |
| Fragile, high maintenance | Guides behavior with heuristics | Gives no signal |

**In this project:** Prompts declare what the agent is, what it verifies, and what
its verdict criteria are. Procedural logic lives in `backend/integrity/` code, not prompts.

**Enforcement:** `scripts/enforce_practices.py` flags modules with numbered-list procedures.

---

### 2. Just-in-time context

Agents hold lightweight identifiers and fetch data at runtime — they do not pre-load
full datasets. This mirrors how humans use file systems and bookmarks.

**Pattern:**
```
❌ Load all robot data into context at session start
✓  Hold robot_id. Fetch specific fields when needed via DB Agent tool call.

❌ Load full URDF XML into validator context
✓  Validator receives output_type + confidence_scores + null_fields summary.
   Fetches specific values from DB to verify. Discards raw XML after check.
```

**In this project:**
- `prompts/tools/db_agent.md` — `get_field()` fetches one field at a time
- `backend/core/prompt_loader.py` — modules load per-agent, not globally
- Skills load sub-files on demand via `SKILL.md` routing, not as a bundle

---

### 3. Token budgets

Each agent has a hard token budget enforced at prompt assembly time.

| Agent | Prompt budget | Output budget | Rationale |
|---|---|---|---|
| orchestrator | 5,000 | 1,500 | Dispatch plans are compact JSON |
| urdf_build | 4,000 | 8,000 | URDF XML can be large |
| validator | 3,000 | 2,000 | Verdict + findings only |
| curob_config | 2,500 | 2,000 | YAML config — compact by nature |
| sub-agent summary | — | ≤ 2,000 | Anthropic: sub-agents return summaries, not raw output |

**Enforcement:** `backend/core/context_budget.py` — `check_module_list_fits_budget()`
is called in `assemble_prompt()` before every agent dispatch. Over-budget = logged WARN,
not a hard block (to avoid cascading failures), but logged to structlog for monitoring.

**How to check budgets:**
```bash
python -c "from backend.core.context_budget import get_budget_report; import json; print(json.dumps(get_budget_report(), indent=2))"
```

---

### 4. Long-horizon context management

Three tools for tasks that exceed a single context window:

#### Compaction
Summarize conversation before the window fills. Run by the orchestrator between tasks.

Preserve: registry IDs, NULL fields found, operator decisions, unresolved errors, current step.
Discard: raw tool outputs already acted on, resolved warnings, full XML/YAML payloads.

```python
from backend.core.compaction import build_compaction_prompt
prompt = build_compaction_prompt(conversation_history)
# Send to Claude — response replaces the conversation history
```

#### Note-taking
`NOTES.md` at project root is the agent's persistent memory across compaction cycles.
Written continuously during complex tasks. Read at session resume.

```python
from backend.core.compaction import (
    initialize_notes, append_completed_step,
    update_current_state, register_artifact
)
```

The root `CLAUDE.md` instructs Claude Code to maintain `NOTES.md` for COMPLEX+ tasks.

#### Sub-agent isolation
Each sub-agent gets a clean context window. It explores with its full budget, then
returns a ≤ 2,000 token summary. The orchestrator synthesizes summaries — it never
holds the sub-agent's raw exploration context.

```
Orchestrator (synthesis context)
├── Sub-agent A: explores URDF requirements → returns 800-token summary
├── Sub-agent B: checks container state → returns 300-token summary
└── Orchestrator combines summaries → dispatches main agents
```

---

## Module loading — what gets loaded when

### Always loaded (all agents)
```
modules/core/never_do         ~80 tokens
modules/core/null_policy      ~70 tokens
modules/core/output_schema    ~120 tokens
```

### Loaded by tier
```
COMPLEX+ tasks add:
  modules/core/context_budget   ~100 tokens
  modules/core/thinking_triggers ~130 tokens

Orchestrator adds:
  agents/orchestrator/task_complexity    ~200 tokens
  agents/orchestrator/parallel_dispatch  ~180 tokens
  tools/db_agent                         ~200 tokens
  tools/file_agent                       ~190 tokens
  tools/container_agent                  ~190 tokens
```

### Loaded on demand (Skills)
```
cinema_robot_domain/arm_geometry.md  — only when building URDF
cinema_robot_domain/fiz_axes.md      — only when FIZ joints are involved
curob_jerk/forbidden_parameters.md   — only when validating cuRobo output
```

---

## Context health monitoring

The `/project:context-check` slash command estimates context usage for the current session.

**Signal thresholds:**
- < 50% used → healthy, proceed normally
- 50–70% used → write state to `NOTES.md` before next heavy tool call
- > 70% used → flag to orchestrator, trigger compaction between tasks

```python
from backend.core.context_budget import ContextBudget, Tier
budget = ContextBudget(agent="orchestrator", tier=Tier.COMPLEX)
budget.charge("system_prompt", tokens=340)
budget.charge("db_query_results", tokens=1200, discardable=True)
budget.log_status()   # structlog output
if budget.should_compact():
    # Write NOTES.md, signal to orchestrator
```

---

## Anti-patterns (what not to do)

```
❌ Loading the full empirical DB into context at task start
❌ Keeping raw URDF XML in context after the Validator has checked it
❌ Re-loading the same module in multiple places within one agent's context
❌ Using a module > 50 lines when it could be split into two focused modules
❌ Sending full tool output from sub-agent to orchestrator (send summaries)
❌ Letting context fill without writing to NOTES.md first
```

---

## References

- `backend/core/context_budget.py` — budget definitions and enforcement
- `backend/core/compaction.py` — compaction and note-taking utilities
- `prompts/modules/core/context_budget.md` — agent-facing version of these rules
- `scripts/enforce_practices.py` — automated enforcement checks
