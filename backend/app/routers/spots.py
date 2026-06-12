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
async def list_spots(state: str | None = None, district: str | None = None,
                     include_inactive: bool = False):
    db = get_db()
    query = db.table("fishing_spots").select("*")
    if not include_inactive:
        query = query.eq("is_active", True)
    if state:
        query = query.eq("state", state)
    if district:
        query = query.eq("district", district)
    return query.order("name").execute().data


@router.get("/{spot_id}")
async def get_spot(spot_id: int):
    res = get_db().table("fishing_spots").select("*").eq("id", spot_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spot not found")
    return res.data[0]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_spot(payload: SpotCreate, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    created = get_db().table("fishing_spots").insert(payload.model_dump()).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="fishing_spots", record_id=created["id"],
                    new_value={"name": created["name"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return created


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
