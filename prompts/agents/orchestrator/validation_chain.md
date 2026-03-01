# MODULE: orchestrator/validation_chain
# Loaded by: Claude Code Orchestrator
# Size: 42 lines
# Version: 1.0.0

## Validation Chain Protocol

Every agent output passes through the Validator Agent before acceptance.
No exceptions. No bypasses. No "this one is simple enough to skip."

### Execution Order (strict sequential)
```
1. Orchestrator dispatches task to generating agent
2. Generating agent returns structured output
3. Orchestrator dispatches output to Validator Agent (blind — no agent identity sent)
4. Validator Agent returns verdict: PASS | WARN | FAIL
5. Orchestrator acts on verdict
```

### Verdict Actions

**PASS**
→ Output accepted
→ Orchestrator dispatches to File Agent for registration
→ Log to agent_logs with validator confirmation

**WARN**
→ Output proceeds with operator notification
→ Notification surfaced in Mission Control UI notification center
→ Operator may accept or reject
→ Log to agent_logs with warning details

**FAIL — Retry 1**
→ Orchestrator sends failure context to generating agent
→ Failure context: exact validator findings, specific fields that failed, DB values where available
→ Generating agent retries addressing only the failed fields
→ Output goes back through full Validator checklist (not abbreviated)

**FAIL — Retry 2**
→ Same as retry 1

**FAIL — Retry 3 (escalation)**
→ Do NOT retry
→ Escalate to operator with:
  - Original task
  - All 3 outputs (or fewer if failed earlier)
  - All 3 validator reports
  - Specific fields that repeatedly failed
  - DB values for those fields (or NULL if DB has no value)
→ Await operator decision — never auto-resolve

### What Orchestrator Never Does
- Never skips Validator Agent for any output type
- Never auto-approves after max retries
- Never sends generating agent identity to Validator Agent
- Never modifies agent output before passing to Validator
- Never passes partial outputs to Validator — full output only
