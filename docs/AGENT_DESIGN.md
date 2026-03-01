# Agent Design — Mission Control Reference
**Version:** 1.0.0
**Source:** anthropic.com/research/building-effective-agents

This document defines how agents are designed, bounded, and composed in this project.
Every pattern here maps to a published Anthropic recommendation. It is enforced by
`scripts/enforce_practices.py` and the validation chain.

---

## Agent taxonomy

### Generating agents (use LLM)
Produce artifacts from DB data and task context. Never directly execute output.

| Agent | Output type | Key constraint |
|---|---|---|
| `urdf_build` | URDF XML | Physical values from DB only — NULL > estimate |
| `usd_conversion` | USD asset config | URDF registry_id required as input |
| `scene_build` | Scene YAML | Isaac Sim scene parameters only |
| `sensor_config` | ZED X YAML | ROS2 topic must be confirmed or marked new |
| `launch_file` | ROS2 launch file | Container names from registry only |
| `curob_config` | cuRobo YAML | Jerk params only — no collision/path planning |
| `script_generation` | Python script | Imports verified against container manifest |
| `audit` | Audit report | Read-only — never modifies artifacts |

### Infrastructure agents (no LLM)
Execute deterministic operations. Expose MCP tool interfaces.

| Agent | Responsibility | Boundary |
|---|---|---|
| `db_agent` | Empirical DB + registry queries | READ ONLY on empirical DB |
| `file_agent` | Artifact registration + retrieval | Requires `validation_report_id` |
| `container_agent` | Docker exec, container status | Registered scripts only |

### Validator (blind LLM)
Receives generating agent output with agent identity stripped.
Returns PASS / WARN / FAIL. Never communicates with the generating agent directly.

### Orchestrator (LLM)
Decomposes tasks, dispatches agents, synthesizes results. Does not execute tasks itself.

---

## The orchestrator-worker pattern

Anthropic's recommended architecture for multi-agent systems:

```
Operator request
       │
       ▼
Orchestrator
  think hard → classify task → build dispatch plan
       │
       ├─→ [parallel, if independent] Agent A ──→ output ──→ Validator ──→ PASS
       │                              Agent B ──→ output ──→ Validator ──→ PASS
       │
       └─→ [sequential] Agent C (uses Agent A output) ──→ Validator ──→ PASS
                                                                │
                                                         File Agent register
```

**Invariants:**
- Workers never communicate directly with each other
- All coordination flows through the orchestrator
- Each worker gets a clean, minimal context for its specific task
- The orchestrator receives summaries, not raw worker outputs

---

## Agent scope enforcement

Each agent has a declared scope in `backend/integrity/scope_guard.py`.

```python
AGENT_SCOPE = {
    "urdf_build": AgentScope(
        permitted_output_types=["urdf"],
        forbidden_output_keys=["launch_file", "script", "curob_config"],
    ),
    "curob_config": AgentScope(
        permitted_output_types=["yaml_curob"],
        forbidden_output_keys=["collision_spheres", "world_model", "path_plan"],
    ),
    ...
}
```

Scope violations are detected by `ScopeGuard` — deterministic code, no LLM.
A scope violation is a CRITICAL finding that blocks registration.

**Why:** Agents that produce output outside their scope are doing another agent's job.
This creates hidden dependencies, compounds errors, and breaks the validation chain.

---

## Adding a new agent — checklist

Use `/project:new-agent <name> <output_type>` to scaffold. Manual steps:

1. **Check for scope overlap** — read existing agents first. If an existing agent
   covers 80%+ of the need, extend it rather than creating a new one.

2. **Create agent files:**
   ```
   agents/<name>/__init__.py
   agents/<name>/agent.py        (extend BaseAgent)
   agents/<name>/output_schema.json
   prompts/agents/<name>/role.md  (< 20 lines, intent only)
   ```

3. **Register scope** in `backend/integrity/scope_guard.py`

4. **Register modules** in `backend/core/prompt_loader.py` AGENT_MODULE_MANIFEST

5. **Define tool interface** in `prompts/tools/<name>.md` if agent exposes MCP tools

6. **Add eval cases** — minimum 2: one PASS, one scope-violation FAIL

7. **Run all checks** — `enforce_practices.py`, `run_evals.py`, `run_ci_checks.py`

---

## Prompt design for agents

### Role module (< 20 lines)
States what the agent IS and what it produces. Uses XML tags.
```xml
<agent_identity>
You are the URDF Build Agent. You produce URDF XML for 6-axis cinema robot arms
from verified data provided by the DB Agent. You do not fetch data yourself.
</agent_identity>

<output_commitment>
Every physical value in your output has a DB source and a confidence score.
Values with no DB source are NULL. You never substitute estimates.
</output_commitment>
```

### Rules module (if needed, < 30 lines)
Domain-specific constraints beyond `never_do`. State criteria, not procedure.

### NO checklist modules
Numbered step-by-step checklists in prompts are the anti-pattern Anthropic warns against.
Procedural enforcement belongs in `backend/integrity/` code.

---

## Validation chain — how it works

```
Generating agent output
         │
         ▼
_strip_agent_identity()    ← validator never knows who generated the output
         │
         ▼
Validator Agent (blind)
  ├── PlaceholderScanner    (deterministic — no LLM)
  ├── ScopeGuard            (deterministic — no LLM)
  ├── IntentVerifier        (deterministic — no LLM)
  ├── ConfidenceScoreCheck  (deterministic — no LLM)
  └── DB cross-check        (DB Agent tool call)
         │
         ▼
Verdict: PASS | WARN | FAIL
         │
    PASS or WARN ──→ File Agent register_artifact(validation_report_id=...)
         │
       FAIL ──→ Orchestrator (retry, max 2)
                     │
                   3rd FAIL ──→ Operator escalation
```

**Why blind validation:** If the validator knows which agent produced the output,
it might apply different standards. Blind validation ensures consistent, objective review.

**Why MAX_RETRIES = 2:** Anthropic's guidance on agentic systems: bound retries explicitly.
Unbounded retries on a broken generation loop waste compute and mask root causes.
The third failure is more diagnostic than the retry.

---

## Sub-agent patterns

### Parallel investigation (before dispatch)
```python
# Orchestrator: use sub-agents to gather information in parallel
# before dispatching the main generating agent

sub_tasks = [
    "Verify robot_id=7 exists in DB and return joint count",
    "Check all containers are running",
    "Fetch NULL field report for robot_id=7",
]
# Each sub-agent gets a clean context, returns ≤ 2000 token summary
# Orchestrator synthesizes summaries, then dispatches urdf_build
```

### Independent verification (after generation)
```python
# For COMPLEX tasks: use a second independent agent to verify
# the first agent's output before it reaches the Validator

# Agent A generates URDF
# Agent B (separate context, no knowledge of Agent A) reviews:
#   - Do joint names match expected pattern for this robot?
#   - Are any values suspiciously round?
#   - Is the structure well-formed?
# Validator receives output + review findings
```

---

## Context design per agent

Each agent's context is assembled at dispatch time from its module manifest.
Modules are the unit of context — not files, not whole directories.

**Principle:** An agent should have exactly the context it needs for its task —
no more, no less. If you're adding a module "just in case", don't.

**How to audit an agent's context:**
```bash
python -c "
from backend.core.prompt_loader import AGENT_MODULE_MANIFEST, assemble_prompt
modules = AGENT_MODULE_MANIFEST.get('urdf_build', [])
print(f'urdf_build loads {len(modules)} modules:')
for m in modules: print(f'  {m}')
"
```

---

## References

- `backend/core/validation_chain.py` — validation chain implementation
- `backend/integrity/scope_guard.py` — agent scope definitions
- `backend/core/prompt_loader.py` — module manifests
- `backend/core/context_budget.py` — token budgets per agent
- `prompts/agents/orchestrator/task_complexity.md` — task tier definitions
- `prompts/agents/orchestrator/parallel_dispatch.md` — parallel safety rules
- `agents/_base/` — BaseAgent to extend for new agents
