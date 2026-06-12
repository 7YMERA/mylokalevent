"""Fishermen Co-op catch listings CRUD (Requirement 3).

Fishermen post daily catches (no approval needed); public browses the
"Catch of the Day" board. Marking sold archives the listing.
"""
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.schemas.models import FishCreate, FishUpdate
from app.utils import client_ip, user_agent

router = APIRouter()


@router.get("")
async def list_catches(
    species: str | None = None,
    location: str | None = None,
    available_only: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
):
    db = get_db()
    query = db.table("fish_catches").select("*", count="exact")
    if available_only:
        query = query.eq("is_available", True)
    if species:
        query = query.ilike("species", f"%{species}%")
    if location:
        query = query.ilike("location", f"%{location}%")
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    total = res.count or 0
    return {"items": res.data, "total": total, "page": page, "page_size": page_size,
            "pages": ceil(total / page_size) if page_size else 0}


@router.get("/mine")
async def my_catches(user: CurrentUser = Depends(require_roles("fisherman", "admin"))):
    res = (get_db().table("fish_catches").select("*")
           .eq("user_id", int(user.id)).order("created_at", desc=True).execute())
    return res.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_catch(payload: FishCreate, request: Request,
                       user: CurrentUser = Depends(require_roles("fisherman", "admin"))):
    db = get_db()
    data = payload.model_dump(mode="json")
    data["user_id"] = int(user.id)
    created = db.table("fish_catches").insert(data).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="fish_catches", record_id=created["id"],
                    new_value={"species": created["species"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return created


@router.put("/{catch_id}")
async def update_catch(catch_id: int, payload: FishUpdate, request: Request,
                       user: CurrentUser = Depends(require_roles("fisherman", "admin"))):
    db = get_db()
    res = db.table("fish_catches").select("*").eq("id", catch_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catch not found")
    catch = res.data[0]
    if user.role != "admin" and catch["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your listing")
    changes = {k: v for k, v in payload.model_dump(mode="json", exclude_unset=True).items() if v is not None}
    if not changes:
        return catch
    updated = db.table("fish_catches").update(changes).eq("id", catch_id).execute().data[0]
    write_audit_log(user_id=user.id, action="UPDATE", table_name="fish_catches", record_id=catch_id,
                    new_value=changes, ip_address=client_ip(request), user_agent=user_agent(request))
    return updated


@router.post("/{catch_id}/sold")
async def mark_sold(catch_id: int, request: Request,
                    user: CurrentUser = Depends(require_roles("fisherman", "admin"))):
    db = get_db()
    res = db.table("fish_catches").select("*").eq("id", catch_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catch not found")
    if user.role != "admin" and res.data[0]["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your listing")
    updated = db.table("fish_catches").update({"is_available": False}).eq("id", catch_id).execute().data[0]
    write_audit_log(user_id=user.id, action="UPDATE", table_name="fish_catches", record_id=catch_id,
                    new_value={"is_available": False}, ip_address=client_ip(request), user_agent=user_agent(request))
    return updated


@router.delete("/{catch_id}")
async def delete_catch(catch_id: int, request: Request,
                       user: CurrentUser = Depends(require_roles("fisherman", "admin"))):
    db = get_db()
    res = db.table("fish_catches").select("*").eq("id", catch_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catch not found")
    if user.role != "admin" and res.data[0]["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your listing")
    db.table("fish_catches").delete().eq("id", catch_id).execute()
    write_audit_log(user_id=user.id, action="DELETE", table_name="fish_catches", record_id=catch_id,
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Listing deleted"}
