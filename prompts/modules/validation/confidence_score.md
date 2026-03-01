# MODULE: confidence_score
# Loaded by: ALL agents + Validator Agent
# Size: 28 lines
# Version: 1.0.0

## Confidence Scoring Protocol

Every output field that contains a value (not NULL) requires a confidence score.

### Score Scale

| Score | Meaning | Source |
|---|---|---|
| 1.00 | Direct empirical DB match — exact row, exact field | Empirical DB |
| 0.95 | DB match with unit conversion applied | Empirical DB + conversion |
| 0.80 | Computed from verified empirical values (e.g. inertia from CAD) | Derived |
| 0.60 | Cross-referenced from secondary verified source | External verified |
| 0.00 | No verified source — MUST be NULL | N/A |

### Rules

- Any score below 0.80 automatically generates a warning
- Any score of 0.00 means the field must be written as NULL — no exceptions
- Scores between 0.01–0.79 are invalid — a value is either verified (≥0.80) or NULL (0.00)
- The method used to derive the score must be stated

### Format in output

```json
"confidence_scores": {
  "joint_1_effort_limit": { "score": 1.0, "source": "empirical_db.joints.row_14.effort_limit" },
  "joint_1_mass": { "score": 0.0, "source": null, "note": "NULL — no verified source" },
  "link_2_inertia_ixx": { "score": 0.95, "source": "empirical_db.links.row_7.ixx", "method": "direct" }
}
```

The Validator Agent cross-checks every score against the empirical DB independently.
