"""Tests for user and team management API endpoints."""

import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from httpx import AsyncClient, ASGITransport  # noqa: E402


def _unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


async def _get_app():
    from main import app
    return app


async def _register_and_login(client, email=None, role="viewer"):
    """Helper: register user, login, return (token, user_id)."""
    email = email or _unique_email()
    await client.post("/api/auth/register", json={
        "email": email,
        "display_name": "Test User",
        "password": "securepass123",
    })
    login_resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": "securepass123",
    })
    token = login_resp.json()["access_token"]

    # If we need admin role, update it directly in DB
    if role != "viewer":
        me_resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        user_id = me_resp.json()["user_id"]
        # Use a direct DB update for test setup
        import subprocess
        subprocess.run([
            "docker", "exec", "mc-postgres",
            "psql", "-U", "mc", "-d", "registry", "-c",
            f"UPDATE users SET role='{role}' WHERE user_id='{user_id}'",
        ], capture_output=True, timeout=5)
        # Re-login to get a token with the updated role
        login_resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "securepass123",
        })
        token = login_resp.json()["access_token"]

    me_resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me_resp.json()["user_id"]
    return token, user_id


@pytest.mark.anyio
async def test_list_users_requires_admin():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, _ = await _register_and_login(c)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_list_users_as_admin():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, _ = await _register_and_login(c, role="admin")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.anyio
async def test_create_team():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, _ = await _register_and_login(c, role="admin")
    team_name = f"team-{uuid.uuid4().hex[:6]}"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            "/api/users/teams",
            json={"name": team_name},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 201
    assert resp.json()["name"] == team_name


@pytest.mark.anyio
async def test_list_teams():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, _ = await _register_and_login(c, role="admin")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/users/teams", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.anyio
async def test_update_own_profile():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, user_id = await _register_and_login(c)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.patch(
            f"/api/users/{user_id}",
            json={"display_name": "New Name"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "New Name"


@pytest.mark.anyio
async def test_delete_user_requires_admin():
    app = await _get_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        token, user_id = await _register_and_login(c)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.delete(
            f"/api/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403
