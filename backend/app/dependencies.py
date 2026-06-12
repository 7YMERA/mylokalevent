"""FastAPI dependencies: current-user extraction and role-based access guards."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.security import decode_access_token

# auto_error=False so we can return a clean 401 instead of FastAPI's default.
bearer_scheme = HTTPBearer(auto_error=False)

# The five roles defined in the report.
ROLES = {"user", "organizer", "fisherman", "advertiser", "admin"}


class CurrentUser:
    def __init__(self, user_id: str, role: str, email: str | None = None):
        self.id = user_id
        self.role = role
        self.email = email


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(creds.credentials)
    if payload is None or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return CurrentUser(user_id=payload["sub"], role=payload.get("role", "user"), email=payload.get("email"))


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser | None:
    """Like get_current_user but returns None for anonymous visitors (public endpoints)."""
    if creds is None or not creds.credentials:
        return None
    payload = decode_access_token(creds.credentials)
    if payload is None or "sub" not in payload:
        return None
    return CurrentUser(user_id=payload["sub"], role=payload.get("role", "user"), email=payload.get("email"))


def require_roles(*allowed: str):
    """Dependency factory enforcing that the current user holds one of `allowed` roles."""

    async def _guard(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires one of roles: {', '.join(allowed)}",
            )
        return user

    return _guard
