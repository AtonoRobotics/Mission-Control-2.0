"""Shared test fixtures — initializes DB engines for API tests."""

import sys
from pathlib import Path

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


@pytest.fixture(autouse=True, scope="session")
def init_db_engines():
    """Initialize async DB engines once for the test session.

    Uses NullPool to avoid connection reuse issues in tests — each query
    gets a fresh connection, preventing 'another operation in progress' errors.
    """
    from sqlalchemy.pool import NullPool

    import db.session as db_session

    if db_session._registry_engine is None:
        from core.settings import get_settings

        settings = get_settings()

        registry_url = db_session._ensure_async_url(str(settings.MC_REGISTRY_DB_URL))
        empirical_url = db_session._ensure_async_url(str(settings.MC_EMPIRICAL_DB_URL))

        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

        db_session._registry_engine = create_async_engine(
            registry_url, echo=False, poolclass=NullPool
        )
        db_session._empirical_engine = create_async_engine(
            empirical_url, echo=False, poolclass=NullPool
        )
        db_session._RegistrySession = async_sessionmaker(
            db_session._registry_engine, expire_on_commit=False
        )
        db_session._EmpiricalSession = async_sessionmaker(
            db_session._empirical_engine, expire_on_commit=False
        )
