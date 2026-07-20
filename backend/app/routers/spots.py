"""Fishing Spots Directory (kolam pancing) CRUD (Requirement 3).

Public browses active spots and opens each one's plain Google Maps link
(no paid Maps API). Admins manage the directory.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.schemas.models import SpotCreate, SpotUpdate
from app.utils import client_ip, user_agent

router = APIRouter()


@router.get("")
async def list_spots(q: str | None = None, state: str | None = None, district: str | None = None,
                     include_inactive: bool = False):
    db = get_db()
    query = db.table("fishing_spots").select("*")
    if not include_inactive:
        query = query.eq("is_active", True)
    if q:
        query = query.ilike("name", f"%{q}%")
    if state:
        query = query.eq("state", state)
    if district:
        query = query.ilike("district", f"%{district}%")
    return query.order("name").execute().data


# Admin approval queue — MUST be declared before "/{spot_id}" so the literal
# path wins over the int path param.
@router.get("/pending")
async def pending_spots(_: CurrentUser = Depends(require_roles("admin"))):
    return (
        get_db().table("fishing_spots").select("*")
        .eq("is_active", False).order("created_at", desc=True).execute().data
    )


@router.get("/{spot_id}")
async def get_spot(spot_id: int):
    res = get_db().table("fishing_spots").select("*").eq("id", spot_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    return res.data[0]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_spot(payload: SpotCreate, request: Request,
                      user: CurrentUser = Depends(require_roles("fisherman", "organizer", "admin"))):
    """Anyone (fisherman / organizer / admin) may suggest a spot. Admins publish
    immediately; everyone else's submission is held for admin approval
    (is_active=False) so it isn't shown publicly until reviewed."""
    db = get_db()
    data = payload.model_dump()
    data["is_active"] = (user.role == "admin")
    created = db.table("fishing_spots").insert(data).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="fishing_spots", record_id=created["id"],
                    new_value={"name": created["name"], "is_active": data["is_active"]},
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return {"spot": created, "pending": not data["is_active"]}


@router.post("/{spot_id}/approve")
async def approve_spot(spot_id: int, request: Request,
                       admin: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    res = db.table("fishing_spots").select("*").eq("id", spot_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    db.table("fishing_spots").update({"is_active": True}).eq("id", spot_id).execute()
    write_audit_log(user_id=admin.id, action="APPROVE", table_name="fishing_spots", record_id=spot_id,
                    new_value={"is_active": True}, ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Spot approved and published"}


@router.put("/{spot_id}")
async def update_spot(spot_id: int, payload: SpotUpdate, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    res = db.table("fishing_spots").select("*").eq("id", spot_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not changes:
        return res.data[0]
    updated = db.table("fishing_spots").update(changes).eq("id", spot_id).execute().data[0]
    write_audit_log(user_id=user.id, action="UPDATE", table_name="fishing_spots", record_id=spot_id,
                    new_value=changes, ip_address=client_ip(request), user_agent=user_agent(request))
    return updated


@router.delete("/{spot_id}")
async def delete_spot(spot_id: int, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    res = db.table("fishing_spots").select("name").eq("id", spot_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    db.table("fishing_spots").delete().eq("id", spot_id).execute()
    write_audit_log(user_id=user.id, action="DELETE", table_name="fishing_spots", record_id=spot_id,
                    old_value={"name": res.data[0]["name"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Spot deleted"}
