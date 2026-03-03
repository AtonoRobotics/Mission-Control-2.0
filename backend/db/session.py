"""
Mission Control — Async Database Sessions
Provides async engine + sessionmaker for both registry and empirical databases.
Used as FastAPI dependencies via get_registry_session() and get_empirical_session().
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_registry_engine = None
_empirical_engine = None
_RegistrySession = None
_EmpiricalSession = None


def _ensure_async_url(url: str) -> str:
    """Ensure URL uses asyncpg driver."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def init_engines(registry_url: str | None = None, empirical_url: str | None = None) -> None:
    """Create async engines. Called once during app lifespan startup."""
    global _registry_engine, _empirical_engine, _RegistrySession, _EmpiricalSession

    if not registry_url:
        from core.settings import get_settings
        settings = get_settings()
        registry_url = str(settings.MC_REGISTRY_DB_URL)
        empirical_url = str(settings.MC_EMPIRICAL_DB_URL)

    if not registry_url:
        raise RuntimeError("MC_REGISTRY_DB_URL is not set")
    if not empirical_url:
        raise RuntimeError("MC_EMPIRICAL_DB_URL is not set")

    _registry_engine = create_async_engine(
        _ensure_async_url(registry_url),
        echo=False,
        pool_size=5,
        max_overflow=10,
    )
    _empirical_engine = create_async_engine(
        _ensure_async_url(empirical_url),
        echo=False,
        pool_size=5,
        max_overflow=10,
    )
    _RegistrySession = async_sessionmaker(_registry_engine, expire_on_commit=False)
    _EmpiricalSession = async_sessionmaker(_empirical_engine, expire_on_commit=False)


async def dispose_engines() -> None:
    """Dispose engines. Called during app lifespan shutdown."""
    if _registry_engine:
        await _registry_engine.dispose()
    if _empirical_engine:
        await _empirical_engine.dispose()


async def get_registry_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async session for the registry DB."""
    if _RegistrySession is None:
        raise RuntimeError("Database engines not initialized. Call init_engines() first.")
    async with _RegistrySession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_empirical_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a read-only async session for the empirical DB."""
    if _EmpiricalSession is None:
        raise RuntimeError("Database engines not initialized. Call init_engines() first.")
    async with _EmpiricalSession() as session:
        yield session


from contextlib import asynccontextmanager


@asynccontextmanager
async def get_registry_session_context() -> AsyncGenerator[AsyncSession, None]:
    """Standalone async context manager for background tasks (not FastAPI deps)."""
    if _RegistrySession is None:
        raise RuntimeError("Database engines not initialized. Call init_engines() first.")
    async with _RegistrySession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_registry_engine():
    return _registry_engine


def get_empirical_engine():
    return _empirical_engine
