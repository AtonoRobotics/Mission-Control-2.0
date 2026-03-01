# MODULE: core/thinking_triggers
# Loaded by: orchestrator, validator
# Version: 1.0.0

<thinking_levels>
Extended thinking allocates more compute before responding.
Use it for decisions where errors compound — wrong plans are expensive to undo.

Source: anthropic.com/engineering/claude-code-best-practices
"think" < "think hard" < "think harder" < "ultrathink"
Each level allocates progressively more thinking budget.
</thinking_levels>

<when_to_use>
Use `think` for:
- Selecting which agent to dispatch for a given task
- Interpreting an ambiguous operator request
- Choosing between two valid approaches

Use `think hard` for:
- Every dispatch plan before sending tasks to agents
- Any decision involving multiple agents or parallel work
- Diagnosing a repeated validator FAIL

Use `think harder` for:
- Changes to validation_chain.py or scope_guard.py
- DB schema migrations
- Any change that affects existing registered artifacts

Use `ultrathink` for:
- Changes to docs/SPEC.md or docs/GUARDRAILS.md
- New agent scope definitions
- Any decision that modifies what outputs are considered valid
</when_to_use>

<thinking_instruction>
When using extended thinking, structure your <thinking> block as:
1. What do I know for certain?
2. What am I uncertain about?
3. What are the failure modes if I get this wrong?
4. What is my decision and why?
Then proceed with the action.
</thinking_instruction>
