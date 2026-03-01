# backend/ — FastAPI Application
Loaded automatically when working in backend/ subdirectory.

## Key files
- `main.py` — app lifespan, integrity gate at startup (see `core/integrity.py`)
- `core/validation_chain.py` — ValidationChain class, MAX_RETRIES = 2, do not change
- `core/prompt_loader.py` — AGENT_MODULE_MANIFEST, assemble_prompt()
- `core/integrity.py` — SPEC_VERSION, GUARDRAILS_VERSION, EMPIRICAL_DB_SCHEMA_VERSION constants
- `integrity/` — deterministic checkers (no LLM): PlaceholderScanner, ScopeGuard, IntentVerifier, DriftScoreCalculator

## Architecture boundaries — enforced by CI
- `integrity/` checkers must NOT import from `agents/`
- Only `db/registry/writer.py` may perform DB writes
- Only `core/validation_chain.py` may implement agent retry loops
- `workflow_engine/` must NOT import from `orchestrator/` or `agents/`

## Running the backend
```bash
cd backend && uvicorn main:app --reload --port 8000
```
Check `/integrity` endpoint to confirm startup checks passed.

## Adding a new integrity checker
1. Create `backend/integrity/your_checker.py` — deterministic only, no LLM calls
2. Add to `backend/integrity/__init__.py`
3. Wire into `run_startup_integrity_check()` in `core/integrity.py`
4. Add a golden eval case in `evals/fixtures/golden_cases.py`
5. Run `run_evals.py` — new case must pass
