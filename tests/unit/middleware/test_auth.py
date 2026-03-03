"""Tests for RBAC middleware — role hierarchy enforcement."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from fastapi import HTTPException  # noqa: E402
from middleware.auth import ROLE_HIERARCHY, check_role_access  # noqa: E402


def test_role_hierarchy_ordering():
    assert ROLE_HIERARCHY["admin"] > ROLE_HIERARCHY["operator"]
    assert ROLE_HIERARCHY["operator"] > ROLE_HIERARCHY["viewer"]


def test_admin_can_access_operator_routes():
    check_role_access(user_role="admin", minimum_role="operator")  # no exception


def test_admin_can_access_viewer_routes():
    check_role_access(user_role="admin", minimum_role="viewer")  # no exception


def test_operator_can_access_operator_routes():
    check_role_access(user_role="operator", minimum_role="operator")  # no exception


def test_operator_can_access_viewer_routes():
    check_role_access(user_role="operator", minimum_role="viewer")  # no exception


def test_viewer_blocked_from_operator_routes():
    with pytest.raises(HTTPException) as exc_info:
        check_role_access(user_role="viewer", minimum_role="operator")
    assert exc_info.value.status_code == 403


def test_viewer_blocked_from_admin_routes():
    with pytest.raises(HTTPException) as exc_info:
        check_role_access(user_role="viewer", minimum_role="admin")
    assert exc_info.value.status_code == 403


def test_operator_blocked_from_admin_routes():
    with pytest.raises(HTTPException) as exc_info:
        check_role_access(user_role="operator", minimum_role="admin")
    assert exc_info.value.status_code == 403


def test_unknown_role_blocked():
    with pytest.raises(HTTPException) as exc_info:
        check_role_access(user_role="guest", minimum_role="viewer")
    assert exc_info.value.status_code == 403
