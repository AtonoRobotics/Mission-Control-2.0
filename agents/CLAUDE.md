# agents/ — Agent Implementations
Loaded automatically when working in agents/.

## Agent development rules (Anthropic: orchestrator-worker pattern)
Each agent needs exactly: role prompt, output schema JSON, Python implementation, MCP server.
Test BEFORE implementing: write eval case first, commit, then implement.

## Required files per agent
- `<agent>/prompt.md` — assembled from prompts/agents/<n>/ modules by prompt_loader
- `<agent>/output_schema.json` — JSON Schema for output validation
- `<agent>/agent.py` — async implementation, calls Anthropic API
- `<agent>/mcp_server.py` — MCP server wrapper (infrastructure agents only)

## Context budget per agent (Anthropic: minimal high-signal tokens)
| Agent | Max prompt tokens | Max output tokens |
|---|---|---|
| urdf_build | 4,000 | 8,000 |
| validator | 3,000 | 2,000 |
| curob_config | 2,000 | 3,000 |
| script_generation | 3,000 | 6,000 |
| audit | 4,000 | 4,000 |
| orchestrator | 5,000 | 2,000 |
See `backend/core/context_budget.py` for full table and enforcement.

## Sub-agent summary rule (Anthropic: sub-agents return ≤ 2000 token summaries)
IMPORTANT: Agent output.summary must be ≤ 2,000 tokens.
Agents explore with full tool access but return CONCISE summaries to orchestrator.
Full artifact content goes to registry — orchestrator gets registry_id, not content.

## Adding a new agent
1. Write eval case in evals/fixtures/golden_cases.py (PASS + FAIL cases)
2. Commit eval cases
3. Create prompts/agents/<n>/role.md (intent/outcome, not procedure)
4. Add to backend/core/prompt_loader.py AGENT_MODULE_MANIFEST
5. Add scope to backend/integrity/scope_guard.py AGENT_SCOPE
6. Create agents/<n>/output_schema.json
7. Create agents/<n>/agent.py
8. Run generate_module_hashes.py
9. Run evals — both new cases must pass
10. Commit all in one atomic commit with CHANGELOG entry
