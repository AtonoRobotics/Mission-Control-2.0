"""RBAC middleware — role-based route protection via FastAPI dependencies."""

from fastapi import Depends, HTTPException

from api.auth import get_current_user

ROLE_HIERARCHY = {"admin": 3, "operator": 2, "viewer": 1}


def check_role_access(user_role: str, minimum_role: str) -> None:
    """Check if a user's role meets the minimum required level.

    Raises HTTPException 403 if insufficient permissions.
    """
    user_level = ROLE_HIERARCHY.get(user_role, 0)
    required_level = ROLE_HIERARCHY.get(minimum_role, 0)
    if user_level < required_level:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def require_role(minimum_role: str):
    """FastAPI dependency that enforces minimum role level on a route."""

    async def check(current_user=Depends(get_current_user)):
        check_role_access(user_role=current_user.role, minimum_role=minimum_role)
        return current_user

    return check
