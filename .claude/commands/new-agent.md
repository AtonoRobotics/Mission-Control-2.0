Scaffold a new agent: $ARGUMENTS

Format: /project:new-agent <agent_name> <output_type>
Example: /project:new-agent calibration_agent yaml_calibration

Steps:
1. Think hard about whether this agent's scope overlaps with existing agents.
   Read agents/ and prompts/agents/ first. Do NOT proceed if scope overlaps.

2. Create the following files (use existing agents as reference, e.g. urdf_build/):
   - agents/<name>/__init__.py
   - agents/<name>/agent.py  (extend BaseAgent from agents/_base/)
   - prompts/agents/<name>/role.md  (< 20 lines, intent + boundaries)
   - prompts/agents/<name>/output_schema.md

3. Add to backend/core/prompt_loader.py AGENT_MODULE_MANIFEST

4. Add scope to backend/integrity/scope_guard.py AGENT_SCOPE:
   - permitted_output_types: [<output_type>]
   - forbidden_output_keys: (keys that belong to other agents)

5. Add tool interface to prompts/tools/<name>.md if agent exposes MCP tools

6. Add eval cases to evals/fixtures/golden_cases.py:
   - Minimum: 1 correct PASS case, 1 scope violation FAIL case

7. Run: python scripts/integrity/generate_module_hashes.py
8. Run: python evals/runners/run_evals.py
9. Run: python scripts/enforce_practices.py

All checks must pass before committing.
