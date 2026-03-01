# GUARDRAILS.md — Mission Control Compliance System
**Version:** 1.0.0
**Authority:** This document is the source of truth for all compliance rules.
**Enforcement:** Rules here are implemented in code, hooks, and CI — not just documented.

Any change to this document requires:
1. Version number increment
2. Update to `GUARDRAILS_VERSION` in `backend/core/integrity.py`
3. All running agents re-initialized
4. Audit Agent run to verify no drift introduced

---

## Layer 1 — Data Integrity

### L1-R1: No Unverified Physical Values
Every mass, inertia tensor component, joint limit (effort / velocity / position / lower / upper),
damping, friction, calibration constant, and sensor parameter must exist verbatim
in the empirical database for the specific robot_id being built.

**Enforcement:** Validator Agent Check 3 (DB cross-check), Pydantic `VerifiedValue` type.
**Violation class:** CRITICAL — output rejected, retry triggered.

### L1-R2: No Placeholder Syntax
Outputs must not contain any of these patterns in field values:
`TODO`, `FIXME`, `PLACEHOLDER`, `EXAMPLE`, `0.0` as a physical constant,
`1.0` as a physical constant, `"string"`, `"value"`, `null` where a real value exists in DB,
template variables like `<value>`, `{value}`, `[value]`.

**Enforcement:** `PlaceholderScanner` in `backend/integrity/placeholder_scanner.py`.
**Violation class:** CRITICAL — output rejected immediately, no retry.

### L1-R3: NULL is the Only Acceptable Unknown
When a physical value is not in the empirical DB, the field is left NULL.
NULL is never substituted with: defaults, typical values, values from other robots,
values from documentation, values from domain knowledge.

**Enforcement:** Validator Agent Check 2 (confidence score audit) + Check 4 (NULL completeness).
**Violation class:** CRITICAL.

### L1-R4: Confidence Scores Are Mandatory and Honest
Every non-NULL field in agent output carries a confidence score (0.0–1.0).
Scores must reflect actual source: 1.0 = direct DB match, 0.0 = no source (→ NULL).
No scores in range 0.01–0.79 are valid — a value is either verified (≥0.80) or NULL (0.0).

**Enforcement:** `ConfidenceScoreValidator` in `backend/integrity/confidence.py`.
**Violation class:** CRITICAL.

### L1-R5: Round Number Flag
Physical constants that are exact round numbers (1.0, 0.5, 10.0, 100.0, etc.)
are automatically flagged for manual review even when confidence score is 1.0.
Real empirical values are typically irregular.

**Enforcement:** `RoundNumberScanner` in `backend/integrity/placeholder_scanner.py`.
**Violation class:** WARN — proceeds with operator notification.

---

## Layer 2 — Behavioral Compliance

### L2-R1: Scope Boundary Enforcement
Each agent has a declared scope. Output may only contain artifact types within that scope.
An agent that generates correct output of the wrong type has still violated scope.

Scope boundaries are defined in `backend/integrity/scope_registry.py`.
Any output field not in the agent's declared output schema → FAIL.

**Enforcement:** `ScopeGuard` in `backend/integrity/scope_guard.py`.
**Violation class:** CRITICAL — output rejected, operator notified of scope violation.

### L2-R2: Never-Do Rule Compliance Check
The 14 rules in `prompts/modules/core/never_do.md` are checked against every output.
Each rule has a corresponding programmatic check.

| Rule | Check |
|------|-------|
| No placeholder values | PlaceholderScanner |
| No invented physical constants | DB cross-check |
| No unconfirmed file paths | PathVerifier |
| No unconfirmed ROS2 topic names | TopicVerifier |
| No wrong container names | ContainerNameVerifier |
| No unconfirmed joint/link names | NameVerifier |
| No unconfirmed Python imports | ImportVerifier |
| No silent NULL fill | NULL completeness check |
| No suppressed warnings | ErrorFieldValidator |

**Enforcement:** `NeverDoChecker` in `backend/integrity/never_do_checker.py`.
**Violation class:** CRITICAL.

### L2-R3: Intent Verification
Every task dispatched to an agent includes a machine-readable intent declaration:
```json
{
  "task_intent": "generate URDF for robot_id=7 with base_locked=true",
  "expected_output_type": "urdf",
  "expected_robot_id": 7,
  "expected_joint_count_min": 6,
  "expected_joint_count_max": 9
}
```
Validator checks output against intent declaration.
Output type mismatch, wrong robot_id, or joint count outside bounds → FAIL.

**Enforcement:** `IntentVerifier` in `backend/integrity/intent_verifier.py`.
**Violation class:** CRITICAL.

### L2-R4: cuRobo Scope Lock
cuRobo outputs must never contain collision, path planning, or obstacle avoidance parameters.
This is checked by field name presence, not just value.

Forbidden fields in cuRobo output: `collision_*`, `obstacle_*`, `path_plan*`, `world_model`, `kinematics_solver`.

**Enforcement:** `CuroboScopeChecker` in `backend/integrity/scope_guard.py`.
**Violation class:** CRITICAL.

---

## Layer 3 — Drift Prevention

### L3-R1: Version Tagging on All Outputs
Every agent output includes:
```json
{
  "spec_version": "2.0.0",
  "guardrails_version": "1.0.0",
  "modules_loaded": { "null_policy": "1.0.0", ... },
  "empirical_db_schema_version": "3.1.0",
  "generated_at": "<ISO8601>"
}
```
Validator rejects any output missing these fields or with stale version numbers.

**Enforcement:** `VersionTagValidator` in `backend/integrity/version_tag.py`.
**Violation class:** CRITICAL.

### L3-R2: Module Hash Verification
Every prompt module has a SHA256 hash stored in `prompts/module_hashes.json`.
At agent initialization, the loader verifies loaded module content matches stored hash.
Hash mismatch means a module was modified without a version bump → FAIL initialization.

**Enforcement:** `prompt_loader.py` hash check at load time.
**Violation class:** CRITICAL — agent will not initialize with tampered modules.

### L3-R3: Field Name Staleness Check
For every joint name and link name in output: verify name still exists in DB for that robot_id.
Catches outputs built against a DB state that has since been updated.

**Enforcement:** Validator Agent Check 4 + Drift Detection module.
**Violation class:** CRITICAL.

### L3-R4: Registered File Hash Drift
Audit Agent checks all promoted files: SHA256(file on disk) == SHA256 in registry.
Any mismatch means the file was modified outside the registry system.

**Enforcement:** Audit Agent Check 2, continuous background task.
**Violation class:** CRITICAL — file marked as drifted, downstream workflows blocked.

### L3-R5: Dependency Version Pinning
All Python dependencies pinned to exact versions in `pyproject.toml`.
No `>=` or `~=` version ranges.
`uv lock` is committed and verified in CI.

**Enforcement:** `scripts/integrity/check_deps_pinned.py` in CI.
**Violation class:** Build failure.

---

## Layer 4 — Architecture Integrity

### L4-R1: Validation Chain Cannot Be Bypassed
File Agent refuses to register any output that does not carry a valid `validation_report_id`
referencing a PASS or WARN verdict in the registry DB.

**Enforcement:** `file_agent_pre_register_check` in `backend/services/file_agent.py`.
**Violation class:** CRITICAL — registration refused.

### L4-R2: Agent Identity Isolation
Orchestrator strips agent identity before passing output to Validator Agent.
The `_strip_agent_identity()` method in `backend/core/validation_chain.py` is the
only place this stripping occurs. It must not be modified to pass identity.

**Enforcement:** Code review rule. Git hook checks for diffs to `_strip_agent_identity`.
**Violation class:** Architecture violation — PR blocked.

### L4-R3: No Direct DB Writes from Non-DB-Agent Code
Only `backend/db/registry/writer.py` (called exclusively by DB Agent) may write to the registry DB.
Only Alembic migrations may modify the empirical DB schema.

**Enforcement:** `scripts/integrity/check_db_write_paths.py` — scans for unauthorized DB write calls.
**Violation class:** Build failure.

### L4-R4: Workflow Engine Isolation
Claude Code orchestrator has no imports from `backend/workflow_engine/`.
The workflow engine has no imports from `orchestrator/` or `agents/`.

**Enforcement:** `scripts/integrity/check_import_boundaries.py` in CI.
**Violation class:** Build failure.

### L4-R5: Retry Cap Enforcement
Max 2 retries is not a convention — it is enforced in code.
`MAX_RETRIES = 2` in `backend/core/validation_chain.py` is the single source.
No other code may call a generating agent in a retry loop.

**Enforcement:** Import boundary check — only `validation_chain.py` may call agent retry.
**Violation class:** Architecture violation.

---

## Layer 5 — Spec and Rule Integrity

### L5-R1: Spec Changes Require Version Bump
`docs/SPEC.md` contains `**Version:**` at line 1.
Any commit modifying `docs/SPEC.md` that does not also increment the version → pre-commit hook fails.

**Enforcement:** `.claude/hooks/pre_commit_spec_version.sh`
**Violation class:** Commit blocked.

### L5-R2: GUARDRAILS Changes Require Double Approval
Any change to `docs/GUARDRAILS.md` requires:
- Version increment in the file
- `GUARDRAILS_VERSION` update in `backend/core/integrity.py`
- These two changes must be in the same commit

**Enforcement:** `.claude/hooks/pre_commit_guardrails.sh`
**Violation class:** Commit blocked.

### L5-R3: Prompt Module Changes Require Hash Update
Any change to a file in `prompts/` must update `prompts/module_hashes.json` in the same commit.
Stale hashes mean agents will refuse to initialize.

**Enforcement:** `.claude/hooks/pre_commit_module_hashes.sh`
**Violation class:** Commit blocked.

### L5-R4: CLAUDE.md Immutable Core Rules
The "Prohibited Actions" section of `docs/CLAUDE.md` may not be removed or shortened.
Rules may only be added, never removed.

**Enforcement:** `.claude/hooks/pre_commit_claude_md.sh` — checks line count of prohibited section.
**Violation class:** Commit blocked.

### L5-R5: Agent Prompt Version Tracking
Every prompt module file declares its version at line 3: `# Version: X.Y.Z`
Any change to a module that does not increment the version → pre-commit hook fails.

**Enforcement:** `.claude/hooks/pre_commit_module_version.sh`
**Violation class:** Commit blocked.

---

## Layer 6 — Accumulation Prevention

### L6-R1: Weekly Integrity Report
Audit Agent runs automatically every week and produces a full integrity report covering
all 6 layers. Report is stored in registry DB and surfaced in Mission Control UI.
Any CRITICAL finding blocks new builds until resolved.

**Enforcement:** Scheduled workflow in Mission Control workflow engine.
**Violation class:** Build block.

### L6-R2: Drift Score Tracking
Registry DB tracks a `drift_score` for each robot's configuration bundle (URDF + configs).
Score increments when: a field is NULL that has since been populated in DB,
a hash mismatches, a name drifts, a version is stale.
Score displayed in Mission Control UI. Score above threshold blocks promotion.

**Enforcement:** `backend/integrity/drift_score.py`
**Violation class:** Promotion blocked above threshold.

### L6-R3: Changelog Enforcement
Every merge to main must include an entry in `CHANGELOG.md`.
Format: `## [version] - date`, then `### Changed`, `### Fixed`, `### Added`.

**Enforcement:** `.claude/hooks/pre_commit_changelog.sh`
**Violation class:** Commit blocked.

### L6-R4: No TODO Accumulation
`scripts/integrity/check_todos.py` counts TODOs in production code (not tests, not stubs).
If count increases in a commit → CI warning.
If count > 20 → CI failure.

**Enforcement:** CI pipeline.
**Violation class:** Build warning / failure.

### L6-R5: Schema Migration Completeness
Every Alembic migration must have a corresponding `downgrade()` function.
Irreversible migrations must be explicitly marked with a comment explaining why.

**Enforcement:** `scripts/integrity/check_migrations.py` in CI.
**Violation class:** Build failure.

---

## Guardrail Summary Matrix

| Rule | Layer | Enforcement | Violation Class |
|------|-------|-------------|-----------------|
| No unverified physical values | Data | Validator DB check | CRITICAL |
| No placeholders | Data | PlaceholderScanner | CRITICAL |
| NULL for unknowns | Data | Confidence + NULL check | CRITICAL |
| Confidence scores mandatory | Data | ConfidenceScoreValidator | CRITICAL |
| Round number flag | Data | RoundNumberScanner | WARN |
| Scope boundaries | Behavior | ScopeGuard | CRITICAL |
| Never-do compliance | Behavior | NeverDoChecker | CRITICAL |
| Intent verification | Behavior | IntentVerifier | CRITICAL |
| cuRobo scope lock | Behavior | CuroboScopeChecker | CRITICAL |
| Version tagging | Drift | VersionTagValidator | CRITICAL |
| Module hash verification | Drift | prompt_loader | CRITICAL |
| Field name staleness | Drift | Validator + Audit | CRITICAL |
| Registry hash drift | Drift | Audit Agent | CRITICAL |
| Dependency pinning | Drift | CI check | Build failure |
| Validation chain bypass | Architecture | File Agent pre-check | CRITICAL |
| Agent identity isolation | Architecture | Code review + hook | Architecture violation |
| No unauthorized DB writes | Architecture | Import scanner | Build failure |
| Workflow engine isolation | Architecture | Import boundary check | Build failure |
| Retry cap enforcement | Architecture | Import boundary check | Architecture violation |
| Spec version bump | Spec integrity | pre-commit hook | Commit blocked |
| Guardrails double approval | Spec integrity | pre-commit hook | Commit blocked |
| Module hash update | Spec integrity | pre-commit hook | Commit blocked |
| CLAUDE.md immutability | Spec integrity | pre-commit hook | Commit blocked |
| Module version tracking | Spec integrity | pre-commit hook | Commit blocked |
| Weekly integrity report | Accumulation | Scheduled workflow | Build block |
| Drift score tracking | Accumulation | drift_score.py | Promotion blocked |
| Changelog enforcement | Accumulation | pre-commit hook | Commit blocked |
| TODO accumulation | Accumulation | CI check | Build warning/failure |
| Migration completeness | Accumulation | CI check | Build failure |
