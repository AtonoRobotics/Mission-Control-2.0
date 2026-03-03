"""Tests for OAuth service — Google and GitHub providers."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from services.oauth import GoogleOAuthProvider, GitHubOAuthProvider  # noqa: E402


def test_google_provider_auth_url():
    provider = GoogleOAuthProvider(
        client_id="test-client-id",
        client_secret="test-secret",
        redirect_uri="http://localhost:8000/api/auth/oauth/google/callback",
    )
    url = provider.get_authorization_url(state="random-state")
    assert "accounts.google.com" in url
    assert "test-client-id" in url
    assert "random-state" in url
    assert "openid" in url


def test_github_provider_auth_url():
    provider = GitHubOAuthProvider(
        client_id="test-client-id",
        client_secret="test-secret",
        redirect_uri="http://localhost:8000/api/auth/oauth/github/callback",
    )
    url = provider.get_authorization_url(state="random-state")
    assert "github.com" in url
    assert "test-client-id" in url
    assert "random-state" in url


def _make_response(data: dict) -> MagicMock:
    """Create a mock httpx response with sync .json() method."""
    resp = MagicMock()
    resp.json.return_value = data
    resp.raise_for_status.return_value = None
    return resp


@pytest.mark.anyio
async def test_google_exchange_code():
    provider = GoogleOAuthProvider(
        client_id="test-id",
        client_secret="test-secret",
        redirect_uri="http://localhost:8000/callback",
    )

    token_resp = _make_response({"access_token": "google-token", "id_token": "id-tok"})
    userinfo_resp = _make_response({
        "sub": "google-user-123",
        "email": "user@gmail.com",
        "name": "Test User",
        "picture": "https://example.com/photo.jpg",
    })

    with patch("services.oauth.httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = token_resp
        mock_client.get.return_value = userinfo_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client

        user_info = await provider.exchange_code("test-code")

    assert user_info["email"] == "user@gmail.com"
    assert user_info["name"] == "Test User"
    assert user_info["provider"] == "google"
    assert user_info["provider_id"] == "google-user-123"
    assert user_info["avatar_url"] == "https://example.com/photo.jpg"


@pytest.mark.anyio
async def test_github_exchange_code():
    provider = GitHubOAuthProvider(
        client_id="test-id",
        client_secret="test-secret",
        redirect_uri="http://localhost:8000/callback",
    )

    token_resp = _make_response({"access_token": "github-token"})
    user_resp = _make_response({
        "id": 12345,
        "login": "testuser",
        "name": "Test User",
        "avatar_url": "https://github.com/avatar.jpg",
    })
    email_resp = _make_response([
        {"email": "user@github.com", "primary": True, "verified": True},
    ])

    with patch("services.oauth.httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = token_resp
        mock_client.get.side_effect = [user_resp, email_resp]
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client

        user_info = await provider.exchange_code("test-code")

    assert user_info["email"] == "user@github.com"
    assert user_info["name"] == "Test User"
    assert user_info["provider"] == "github"
    assert user_info["provider_id"] == "12345"
    assert user_info["avatar_url"] == "https://github.com/avatar.jpg"
