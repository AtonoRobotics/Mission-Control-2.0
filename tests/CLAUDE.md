# tests/ — Test Suite
Loaded automatically when working in tests/.

## Running tests
```bash
python -m pytest tests/ -v                    # all tests
python -m pytest tests/unit/ -v               # unit only
python -m pytest tests/integration/ -v        # integration only
python -m pytest tests/ -k "test_validator"   # filter by name
```

## Anthropic TDD workflow (DO NOT SKIP)
Write tests BEFORE implementation. This is not optional.
1. Write failing test — make it as specific as possible
2. Confirm it fails: pytest finds it, runs it, it fails
3. Commit the failing test
4. Implement until it passes
5. Run full suite — no regressions

## Test categories
- `tests/unit/` — single function/class, no external deps, no DB, no API
- `tests/integration/` — multiple components, uses fixture DB (SQLite in-memory)
- `tests/e2e/` — full pipeline, requires Docker containers running

## Fixture rules
- Unit tests: never mock the empirical DB — use `evals/mocks/fixture_db.py`
- Physical values in fixtures MUST be clearly marked as TEST VALUES, not real empirical data
- Never use round numbers (1.0, 0.5) as test physical values — makes bad habits visible

## DO NOT
- Mock `backend/core/validation_chain.py` — test it for real
- Use `@pytest.mark.skip` without a linked GitHub Issue explaining why
- Write tests that only pass because integrity checks are disabled
