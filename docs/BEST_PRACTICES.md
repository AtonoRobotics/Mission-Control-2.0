# Mission Control — Anthropic Best Practices
**Version:** 1.0.0
**Sources:** docs.anthropic.com, anthropic.com/engineering, anthropic.com/research

This document is the authoritative reference for how Anthropic's published best
practices are applied throughout Mission Control. Every pattern here has a source.
Every rule here has enforcement. Nothing is aspirational — if it's here, it's implemented.

---

## 1. Project Structure

### 1.1 CLAUDE.md Hierarchy
*Source: anthropic.com/engineering/claude-code-best-practices*

Claude Code automatically loads CLAUDE.md files from the working directory and all
parent directories. Sub-directory CLAUDE.md files load on demand when Claude works
in that directory.

**Applied:**
```
CLAUDE.md                  ← root: bash commands, workflow, prime directives
backend/CLAUDE.md          ← architecture boundaries, async rules
prompts/CLAUDE.md          ← version rules, altitude guidance
evals/CLAUDE.md            ← how to run and extend evals
tests/CLAUDE.md            ← testing patterns, fixture rules
agents/CLAUDE.md           ← agent development rules
```

**Rule:** CLAUDE.md files are tuned prompts — iterate on them like code.
Anthropic uses "IMPORTANT" and "YOU MUST" emphasis for critical rules.

### 1.2 Slash Commands
*Source: anthropic.com/engineering/claude-code-best-practices*

Repeated workflows are stored as Markdown in `.claude/commands/` and checked into
git so every developer gets them.

**Applied:** `/project:build-urdf`, `/project:run-evals`, `/project:validate-output`,
`/project:update-hashes`, `/project:integrity-check`, `/project:audit-drift`

### 1.3 MCP Configuration
*Source: anthropic.com/engineering/claude-code-best-practices*

`.mcp.json` is checked into git so every engineer working on the repo gets the same
MCP servers out of the box.

**Applied:** `.mcp.json` defines db_agent, file_agent, container_agent MCP servers.

### 1.4 Tool Allowlist
*Source: anthropic.com/engineering/claude-code-best-practices*

`.claude/settings.json` defines the tool allowlist. Safe, easily-reversible operations
are pre-approved. High-risk operations require explicit session approval.

---

## 2. Agent Architecture

### 2.1 Orchestrator-Worker Pattern
*Source: anthropic.com/research/building-effective-agents*

A lead agent (orchestrator) decomposes tasks and delegates to specialized subagents.
Each subagent needs: concrete objective, output format, tool guidance, clear boundaries.

**Applied:** Orchestrator dispatches to 8 generating agents + 3 infrastructure agents.
Task intent is declared before dispatch. Agent identity is stripped before validation.

### 2.2 Blind Validation
*Source: Session architecture decisions*

The Validator Agent receives output without generating agent identity.
This prevents bias — the validator judges the output, not who made it.

**Applied:** `_strip_agent_identity()` in `backend/core/validation_chain.py`.
Git hook blocks diffs to that function.

### 2.3 Sequential Execution
*Source: anthropic.com/research/building-effective-agents — "sequential is always safe"*

Agents execute sequentially unless outputs are provably independent.
Safety > speed. Parallel only when neither agent reads from the other's output.

**Applied:** `task_complexity.md` parallel rules. Orchestrator must justify parallel dispatch.

### 2.4 Retry Cap
*Source: Session architecture decisions*

Maximum 2 retries before escalation. Enforced in code, not just convention.
`MAX_RETRIES = 2` in `validation_chain.py` is the single source of truth.

**Applied:** Import boundary check blocks retry loops outside `validation_chain.py`.

### 2.5 Sub-agent Summaries
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

Subagents may explore extensively (tens of thousands of tokens) but return only
condensed summaries — 1,000–2,000 tokens. Detailed context stays isolated.

**Applied:** Agent output schema enforces `output` field as compact artifact.
Full tool call history is not returned — only the registered artifact.

---

## 3. Context Engineering

### 3.1 Minimal High-Signal Tokens
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "Find the smallest possible set of high-signal tokens that maximize the
> likelihood of the desired outcome."

**Applied:**
- Prompt modules < 50 lines each (enforced by CI)
- Domain skills loaded on demand, not pre-loaded (progressive disclosure)
- Tool results cleared after processing (not retained in history)
- Context budget tracked per agent type in `prompt_loader.py`

### 3.2 Right Altitude for System Prompts
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "The Goldilocks zone between brittle hardcoded logic and vague high-level guidance."

**Applied:**
- Prompts declare intent and outcome — not step-by-step procedure
- Procedural logic lives in `backend/integrity/` code, not in prompts
- Wrong: "Step 1: check X. Step 2: check Y." Right: "Your purpose is X. Verify Y."

### 3.3 Just-in-Time Context
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

Agents maintain lightweight identifiers (registry IDs, file paths) and load data
at runtime using tools, rather than pre-loading everything into context.

**Applied:**
- Domain skills loaded by SKILL.md trigger, not pre-loaded
- DB queries happen at dispatch time with exact field requests
- File content loaded by registry ID, not bulk-loaded

### 3.4 Compaction for Long-Horizon Tasks
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "Compaction distills conversation history into a high-fidelity summary,
> enabling the agent to continue with minimal performance degradation."

**Applied:** `backend/core/compaction.py`
- `initialize_notes()` at task start for COMPLEX/CRITICAL tasks
- `update_current_state()` called continuously — this is the compaction anchor
- `build_compaction_prompt()` with explicit preserve/discard rules
- `build_resume_context()` for session resume from NOTES.md

**Preserve:** registered artifact IDs, NULL fields, operator decisions, current step, unresolved errors
**Discard:** raw tool outputs, resolved findings, redundant status messages, full URDF/YAML content

### 3.5 Structured Note-Taking
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "Agents maintain a NOTES.md file — this lets them track progress across complex
> tasks, maintaining critical context across dozens of tool calls."

**Applied:** `NOTES.md` at project root, maintained by `compaction.py`.
CLAUDE.md instructs Claude Code to update it on every major step.

### 3.6 Tool Design
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "One of the most common failure modes is bloated tool sets that lead to
> ambiguous decision points. If a human can't say which tool to use, an AI can't."

**Applied:** Each infrastructure agent exposes ≤ 5 tools with distinct, non-overlapping purposes.
Tool interfaces documented in `prompts/tools/`. No tool has overlapping functionality.

---

## 4. Prompt Engineering

### 4.1 XML Tags
*Source: docs.anthropic.com/en/docs/build-with-claude/prompt-engineering*

XML tags are the preferred structure for agent prompts. They delineate sections
clearly and are more reliably parsed than Markdown headers at depth.

**Applied:** All prompts use `<agent_intent>`, `<what_you_verify>`, `<verdict_criteria>`,
`<tool_interfaces>`, `<thinking_instruction>` tags.

### 4.2 Extended Thinking Keywords
*Source: anthropic.com/engineering/claude-code-best-practices*

These keywords map directly to increasing thinking budget:
`"think"` < `"think hard"` < `"think harder"` < `"ultrathink"`

**Applied:**
- CLAUDE.md: "Use 'think hard' before any architectural decision."
- CLAUDE.md: "Use 'ultrathink' for validation chain changes."
- `task_complexity.md`: orchestrator uses thinking before dispatch
- `validator/checklist.md`: `<thinking_instruction>` before verdict

### 4.3 Few-Shot Examples
*Source: anthropic.com/engineering/effective-context-engineering-for-ai-agents*

> "Examples are the 'pictures' worth a thousand words. Curate diverse,
> canonical examples that effectively portray expected behavior."

**Applied:** `evals/fixtures/golden_cases.py` serves as the canonical example set.
20 cases across 5 categories. Agent prompts reference example output shapes.

### 4.4 Prompt Improvement
*Source: anthropic.com/engineering/claude-code-best-practices*

> "Run CLAUDE.md files through the prompt improver. Tune with 'IMPORTANT'
> and 'YOU MUST' emphasis to improve adherence."

**Applied:** Prompt improvement is a standing maintenance task.
CI headless review catches altitude violations and conflicting instructions.

---

## 5. Evaluation

### 5.1 Start Immediately with Small Samples
*Source: anthropic.com/engineering/multi-agent-research-system*

> "A prompt tweak can shift results from 30% to 80% with just 20 cases.
> Don't wait for large evals — start with 20 representative cases."

**Applied:** `evals/fixtures/golden_cases.py` — 20 cases, run before any feature work.

### 5.2 Test-Driven Development
*Source: anthropic.com/engineering/claude-code-best-practices*

> "Write tests, commit; code, iterate, commit. TDD becomes even more powerful
> with agentic coding. Tell Claude not to write implementation until tests pass."

**Applied workflow:**
1. Write failing eval case for new behavior
2. Commit test
3. Implement feature
4. Run evals — must pass
5. Commit implementation

### 5.3 LLM-as-Judge for Subjective Review
*Source: anthropic.com/engineering/multi-agent-research-system*

> "Traditional evaluations assume fixed paths. Agents are non-deterministic.
> LLM-as-judge scales when done well."

**Applied:** `scripts/ci/claude_review.sh` uses `claude -p` (headless) for:
- Prompt module altitude violations
- Scope definition consistency
- CHANGELOG enforcement

---

## 6. Development Workflow

### 6.1 Explore → Plan → Code → Commit
*Source: anthropic.com/engineering/claude-code-best-practices*

The canonical Claude Code workflow. Skipping Explore and Plan is the most
common cause of poor output.

**Applied in CLAUDE.md:**
1. Explore — read files, use subagents for parallel investigation. No code yet.
2. Plan — "think hard". Create NOTES.md or GitHub Issue with plan.
3. Test first — write failing test. Commit.
4. Implement — code to pass tests.
5. Validate — run evals + CI checks.
6. Commit — atomic commit with CHANGELOG entry.

### 6.2 Git Worktrees for Parallel Work
*Source: anthropic.com/engineering/claude-code-best-practices*

> "Create 3-4 git worktrees, open each in separate terminal tabs,
> start Claude in each with different tasks."

**Applied in CLAUDE.md:**
```bash
git worktree add ../mc-prompts prompts-branch
git worktree add ../mc-backend backend-branch
```
Use for: prompts + backend simultaneously, or multi-agent parallel builds.

### 6.3 Headless Mode for CI
*Source: anthropic.com/engineering/claude-code-best-practices*

> "Use claude -p for non-interactive contexts like CI, pre-commit hooks,
> build scripts. Add --output-format stream-json for streaming."

**Applied:** `scripts/ci/claude_review.sh` — runs in GitHub Actions, also usable locally.
Pre-commit hook chains deterministic checks + eval regression + headless review.

### 6.4 GitHub Issues as Specs
*Source: anthropic.com/engineering/claude-code-best-practices*

> "If the plan looks good, have Claude create a GitHub Issue with it
> so you can reset to that spot if implementation goes wrong."

**Applied in CLAUDE.md:** Plans for COMPLEX/CRITICAL tasks → GitHub Issue before coding.
`/project:build-urdf` creates NOTES.md entry with plan before dispatching agents.

---

## 7. Code Quality

### 7.1 Import Boundaries
*Source: Session architecture decisions — enforces Anthropic's separation of concerns*

Architectural isolation enforced by `scripts/integrity/check_import_boundaries.py` in CI.
Violations are build failures, not warnings.

**Boundaries:**
- `backend/integrity/` → never imports from `agents/`
- `workflow_engine/` → never imports from `orchestrator/` or `agents/`
- Only `db/registry/writer.py` performs DB writes
- Only `core/validation_chain.py` implements retry loops

### 7.2 Version Pinning
*Source: GUARDRAILS.md L3-R5*

All Python dependencies use exact versions. No `>=` or `~=`. `uv lock` committed.

### 7.3 Type Hints and Dataclasses
*Source: Mission Control code standards*

Type hints on every function. Dataclasses for structured data over raw dicts.
Structlog only — never `print()` in production code.

---

## 8. Spec Integrity

### 8.1 Version Tagging on All Outputs
Every agent output includes `spec_version`, `guardrails_version`, `empirical_db_schema_version`.
Stale version tags are detected by the Validator and by drift scoring.

### 8.2 Module Hash Verification
SHA256 hash of every prompt module stored in `prompts/module_hashes.json`.
Startup check verifies every module. Tampered module → agents refuse to initialize.

### 8.3 Pre-commit Hooks
Five hooks enforced via `.claude/hooks/pre_commit_full.sh`:
- SPEC.md version bump on any SPEC.md change
- Module hash update on any prompts/ change
- CLAUDE.md prohibited section cannot shrink
- Deterministic CI checks pass
- Eval suite passes (no regressions)

---

## Source Index

| Practice | Source |
|---|---|
| CLAUDE.md files | anthropic.com/engineering/claude-code-best-practices |
| Slash commands | anthropic.com/engineering/claude-code-best-practices |
| Explore/Plan/Code/Commit | anthropic.com/engineering/claude-code-best-practices |
| TDD workflow | anthropic.com/engineering/claude-code-best-practices |
| Git worktrees | anthropic.com/engineering/claude-code-best-practices |
| Headless CI | anthropic.com/engineering/claude-code-best-practices |
| Orchestrator-worker | anthropic.com/research/building-effective-agents |
| Sequential execution | anthropic.com/research/building-effective-agents |
| Minimal context | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Right altitude | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Just-in-time context | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Compaction | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Structured note-taking | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Sub-agent summaries | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| XML tags | docs.anthropic.com/en/docs/build-with-claude/prompt-engineering |
| Thinking keywords | anthropic.com/engineering/claude-code-best-practices |
| Immediate evals | anthropic.com/engineering/multi-agent-research-system |
| LLM-as-judge | anthropic.com/engineering/multi-agent-research-system |
| Agent Skills | anthropic.com/engineering/equipping-agents-for-the-real-world |
| Tool design | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
