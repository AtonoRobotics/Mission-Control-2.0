# MODULE: db_verify
# Loaded by: Validator Agent, DB Agent
# Size: 22 lines
# Version: 1.0.0

## Empirical DB Verification Protocol

### Cross-Check Procedure
For every physical value in an agent's output:

1. Identify the DB table, row (robot_id), and column
2. Query the empirical DB for that exact cell
3. Compare: output value == DB value (within floating point tolerance: 1e-6)
4. If match → confidence verified
5. If no match or cell is NULL → output value is unverified → must be NULL

### Tolerance
Floating point comparison tolerance: 1e-6 absolute difference.
Values outside tolerance are treated as mismatches regardless of closeness.

### What the Validator Never Does
- Never accepts a value because it "seems reasonable"
- Never accepts a value because it matches values from other robots
- Never accepts a value because it's within a plausible range
- Never uses domain knowledge to validate physical constants — only DB matches

### DB Query Format Required
Every DB verification query must be logged:
```json
{
  "table": "joints",
  "robot_id": 7,
  "column": "effort_limit",
  "query_result": 47.3,
  "output_value": 47.3,
  "match": true,
  "tolerance_used": 1e-6
}
```
