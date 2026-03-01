# MODULE: null_policy
# Loaded by: ALL agents
# Size: 12 lines
# Version: 1.0.0

## NULL Policy — Non-Negotiable

Every field with no verified empirical source is written as NULL/blank.
Never substitute NULL with: defaults, estimates, ROS defaults, SDK defaults, "typical" values, or plausible-looking numbers.
Never infer a value from context, units, or similar robots.

On any NULL field you must emit:
```json
{ "field": "<name>", "element": "<joint|link|param>", "criticality": "critical|non-critical", "reason": "no verified source in empirical DB" }
```

Partial NULL reports are a validation failure. Every NULL must be reported.
