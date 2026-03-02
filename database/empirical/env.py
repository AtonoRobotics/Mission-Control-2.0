"""
Alembic environment — Mission Control Empirical DB.
Uses synchronous psycopg2 driver for migrations (Alembic doesn't support async).
Runtime code uses asyncpg via SQLAlchemy async engine.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# Load .env.machines from project root
project_root = Path(__file__).resolve().parents[2]
load_dotenv(project_root / ".env.machines")

# Add backend to sys.path so we can import models
sys.path.insert(0, str(project_root / "backend"))

from db.empirical.models import EmpiricalBase  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = EmpiricalBase.metadata

# Override sqlalchemy.url from env var, converting async URL to sync for Alembic
db_url = os.environ.get("MC_EMPIRICAL_DB_URL", config.get_main_option("sqlalchemy.url"))
if db_url:
    # Alembic needs sync driver — replace asyncpg with psycopg2
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    sync_url = sync_url.replace("postgresql://", "postgresql+psycopg2://")
    config.set_main_option("sqlalchemy.url", sync_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
