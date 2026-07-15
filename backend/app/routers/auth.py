"""Authentication & account management (Requirement 1).

Custom JWT auth over the Supabase `users` table:
  - register (self-service roles only; never admin)
  - login with bcrypt verification, audit logging, and account lockout
  - logout (audit only — JWT is stateless)
  - me (current profile)
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.audit import write_audit_log
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.security import create_access_token, hash_password, verify_password
from app.services.email_service import send_welcome

router = APIRouter()

# Roles a visitor may pick at registration. Admin is provisioned manually only.
# 'advertiser' merged into 'organizer' — organizers post events AND run ads.
SELF_SERVICE_ROLES = {"user", "organizer", "fisherman"}


def _client_ip(request: Request) -> str | None:
    # Respect a reverse proxy (Nginx/Render) X-Forwarded-For if present.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def _to_public(row: dict) -> UserPublic:
    return UserPublic(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
        phone=row.get("phone"),
        profile_image=row.get("profile_image"),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request):
    db = get_db()

    role = payload.role if payload.role in SELF_SERVICE_ROLES else "user"

    existing = db.table("users").select("id").eq("email", payload.email).execute()
    if existing.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")

    insert = (
        db.table("users")
        .insert(
            {
                "name": payload.name,
                "email": payload.email,
                "password": hash_password(payload.password),
                "role": role,
                "status": "active",
                "phone": payload.phone,
            }
        )
        .execute()
    )
    user = insert.data[0]

    write_audit_log(
        user_id=user["id"],
        action="CREATE",
        table_name="users",
        record_id=user["id"],
        new_value={"email": user["email"], "role": user["role"]},
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    # Welcome email (best-effort; mocked/skipped if email isn't configured).
    send_welcome(user["email"], user["name"])

    token = create_access_token(subject=user["id"], role=user["role"], extra={"email": user["email"]})
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_expire_minutes,
        user=_to_public(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request):
    db = get_db()
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")

    res = db.table("users").select("*").eq("email", payload.email).execute()
    if not res.data:
        # Don't reveal whether the email exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    user = res.data[0]

    # Account status checks.
    if user["status"] in ("suspended", "banned"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Account is {user['status']}")

    # Lockout check.
    locked_until = user.get("locked_until")
    if locked_until:
        locked_dt = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
        if locked_dt > datetime.now(timezone.utc):
            mins = int((locked_dt - datetime.now(timezone.utc)).total_seconds() // 60) + 1
            raise HTTPException(
                status.HTTP_423_LOCKED,
                f"Account locked due to failed logins. Try again in ~{mins} min.",
            )

    # Password check.
    if not verify_password(payload.password, user["password"]):
        attempts = (user.get("failed_attempts") or 0) + 1
        update: dict = {"failed_attempts": attempts}
        if attempts >= settings.max_login_attempts:
            update["locked_until"] = (
                datetime.now(timezone.utc) + timedelta(minutes=settings.lockout_minutes)
            ).isoformat()
            update["failed_attempts"] = 0
        db.table("users").update(update).eq("id", user["id"]).execute()

        write_audit_log(
            user_id=user["id"], action="LOGIN_FAILED", table_name="users",
            record_id=user["id"], ip_address=ip, user_agent=ua,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    # Success: reset counters, issue token, log.
    db.table("users").update({"failed_attempts": 0, "locked_until": None}).eq("id", user["id"]).execute()
    write_audit_log(
        user_id=user["id"], action="LOGIN", table_name="users",
        record_id=user["id"], ip_address=ip, user_agent=ua,
    )

    token = create_access_token(subject=user["id"], role=user["role"], extra={"email": user["email"]})
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_expire_minutes,
        user=_to_public(user),
    )


@router.post("/logout")
async def logout(request: Request, current: CurrentUser = Depends(get_current_user)):
    write_audit_log(
        user_id=current.id, action="LOGOUT", table_name="users",
        record_id=current.id, ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return {"message": "Logged out"}


@router.get("/me", response_model=UserPublic)
async def me(current: CurrentUser = Depends(get_current_user)):
    res = get_db().table("users").select("*").eq("id", current.id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return _to_public(res.data[0])
