"""Tests for auth API endpoints — register, login, refresh, me."""

import sys
import uuid
from pathlib import Path

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from httpx import AsyncClient, ASGITransport  # noqa: E402


def _unique_email() -> str:
    """Generate unique email for test isolation."""
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


async def _get_app():
    """Import app lazily to avoid startup side effects in test collection."""
    from main import app
    return app


@pytest.mark.anyio
async def test_register_user():
    app = await _get_app()
    email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "Test User",
            "password": "securepass123",
        })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert data["role"] == "viewer"
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.anyio
async def test_register_duplicate_returns_409():
    app = await _get_app()
    email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "First",
            "password": "securepass123",
        })
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "Duplicate",
            "password": "securepass123",
        })
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_login():
    app = await _get_app()
    email = _unique_email()

    # Register
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "Login User",
            "password": "securepass123",
        })

    # Login
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "securepass123",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.anyio
async def test_login_wrong_password_returns_401():
    app = await _get_app()
    email = _unique_email()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "Bad Login",
            "password": "securepass123",
        })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "wrongpassword",
        })
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_me_endpoint():
    app = await _get_app()
    email = _unique_email()

    # Register
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/auth/register", json={
            "email": email,
            "display_name": "Me User",
            "password": "securepass123",
        })

    # Login
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "securepass123",
        })
    token = login_resp.json()["access_token"]

    # Get me
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == email


@pytest.mark.anyio
async def test_me_without_token_returns_401():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
