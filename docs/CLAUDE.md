# docs/ — Project Documentation
Loaded when working in docs/. All versioned docs require version bump on any change.

## Files and their purpose
- `SPEC.md` — system specification. Version at line 2. Bump on ANY change.
- `GUARDRAILS.md` — 30 rules across 6 layers. Version must match `backend/core/integrity.py`.
- `PRACTICES.md` — Anthropic best practices reference. Source of truth for enforce_practices.py.
- `CONTEXT_ENGINEERING.md` — how context budgets, compaction, and note-taking work.
- `AGENT_DESIGN.md` — agent taxonomy, scope enforcement, validation chain, design patterns.
- `BEST_PRACTICES.md` — implementation notes (no version required, edit freely).

## Rules — IMPORTANT
- SPEC.md and GUARDRAILS.md: version bump required on any edit (pre-commit hook enforces)
- GUARDRAILS.md version + `GUARDRAILS_VERSION` in `backend/core/integrity.py` must always match
- NEVER delete rules from GUARDRAILS.md — only add
- PRACTICES.md: all sources must cite published Anthropic docs
- Use `/project:spec-update` slash command for SPEC.md changes — it handles all side effects
