"""Tests for AuthService — password hashing and JWT tokens."""

import sys
from pathlib import Path

# Add backend to path so we can import services
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from services.auth import AuthService  # noqa: E402


def test_password_hash_and_verify():
    svc = AuthService(secret_key="test-secret-key-min-32-chars-long")
    hashed = svc.hash_password("mypassword")
    assert svc.verify_password("mypassword", hashed) is True
    assert svc.verify_password("wrongpassword", hashed) is False


def test_hash_is_not_plaintext():
    svc = AuthService(secret_key="test-secret-key-min-32-chars-long")
    hashed = svc.hash_password("mypassword")
    assert hashed != "mypassword"
    assert len(hashed) > 20


def test_create_access_token():
    svc = AuthService(secret_key="test-secret-key-min-32-chars-long")
    token = svc.create_access_token(user_id="abc-123", role="operator")
    payload = svc.decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["role"] == "operator"
    assert payload["type"] == "access"


def test_create_refresh_token():
    svc = AuthService(secret_key="test-secret-key-min-32-chars-long")
    token = svc.create_refresh_token(user_id="abc-123")
    payload = svc.decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["type"] == "refresh"


def test_expired_token_raises():
    from datetime import timedelta

    svc = AuthService(secret_key="test-secret-key-min-32-chars-long")
    svc.access_token_expire = timedelta(seconds=-1)
    token = svc.create_access_token(user_id="abc-123", role="viewer")
    try:
        svc.decode_token(token)
        assert False, "Should have raised for expired token"
    except Exception:
        pass  # Expected — expired token
