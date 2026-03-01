# database/ — Empirical DB + Registry DB
Loaded when working in database/. These are the two core databases.

## Files
- `empirical/` — robot physical properties. READ ONLY from all application code.
- `registry/` — artifact registry, validation reports, drift scores. WRITE via writer.py only.

## Alembic migrations
```bash
cd database && alembic upgrade head      # apply pending migrations
cd database && alembic revision --autogenerate -m "description"  # new migration
```
EVERY migration must have a downgrade() function.
Irreversible migrations must have an explicit comment explaining why.

## Rules — IMPORTANT
- NEVER write to empirical DB from application code — READ ONLY
- NEVER write to registry DB directly — use backend/db/registry/writer.py only
- NEVER modify a migration file after it has been run — create a new migration
- NULL in empirical DB means "no verified source" — never fill with defaults
