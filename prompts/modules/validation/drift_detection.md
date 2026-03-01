# MODULE: validation/drift_detection
# Loaded by: Validator Agent, Audit Agent
# Version: 1.0.0
# Responsibility: Single concern — detect output that has drifted from the current spec

## Drift Detection

Drift is the most insidious failure mode: the system gradually becomes something
different from what was designed, with no single moment of obvious failure.

### What Drift Looks Like
- A config references a joint name that was renamed in the DB last week
- An agent produces output matching an older version of its role module
- A file hash in the registry no longer matches the file on disk
- A workflow node references a container that was renamed
- A script uses an API that changed in the latest Isaac Lab version

### Drift Check 1 — Spec Version Consistency
Every output must declare which spec version it was generated against:
```json
{ "spec_version": "2.0.0" }
```
Validator cross-checks: output spec_version == current docs/SPEC.md version.
Mismatch → FAIL. Agent is operating against an outdated spec.

### Drift Check 2 — Prompt Module Version Consistency
Every agent output must declare which module versions loaded it:
```json
{ "modules_loaded": { "null_policy": "1.0.0", "cinema_robot": "1.0.0", ... } }
```
Validator cross-checks each version against module files on disk.
Mismatch → FAIL. Agent was initialized with stale module content.

### Drift Check 3 — DB Schema Version Consistency
Output must declare the DB schema version it queried against:
```json
{ "empirical_db_schema_version": "3.1.0" }
```
Validator cross-checks: matches current Alembic head.
Mismatch → FAIL. Agent queried against a migrated schema with wrong column names.

### Drift Check 4 — Field Name Drift
For every joint/link/param name in output: query current DB for that robot_id.
If name existed in DB at some point but is now different → FAIL with current name.
This catches outputs generated before a rename was applied.

### Drift Check 5 — Registry Hash Drift
For every file path referenced in output: compare current SHA256 of file against
the registry entry hash. Mismatch → WARN. File has changed since it was registered.

### Drift Findings Format
```json
{
  "drift_findings": [
    {
      "drift_type": "spec_version | module_version | db_schema | field_name | registry_hash",
      "expected": "<current value>",
      "found_in_output": "<stale value>",
      "severity": "FAIL | WARN",
      "remediation": "<update agent initialization | re-run migration | re-register file>"
    }
  ]
}
```
