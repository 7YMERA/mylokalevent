"""Advertisements CRUD + click/impression tracking (Requirements 3 & 5).

Advertisers create RM70/week banner campaigns (creates a posting payment).
Admins approve/reject. Public lists active ads and clicks are tracked.
"""
from datetime import date, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.schemas.models import AdCreate, AdUpdate
from app.services.payment_service import create_posting_payment
from app.utils import client_ip, user_agent

router = APIRouter()

AD_FEE = 70.00
AD_DURATION_DAYS = 7


@router.get("")
async def list_ads(
    mine: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    db = get_db()
    query = db.table("advertisements").select("*", count="exact")
    if not mine:
        query = query.eq("status", "active")
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    total = res.count or 0
    return {"items": res.data, "total": total, "page": page, "page_size": page_size,
            "pages": ceil(total / page_size) if page_size else 0}


@router.get("/mine")
async def my_ads(user: CurrentUser = Depends(require_roles("advertiser", "admin"))):
    res = (
        get_db().table("advertisements").select("*")
        .eq("advertiser_id", int(user.id)).order("created_at", desc=True).execute()
    )
    return res.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ad(
    payload: AdCreate,
    request: Request,
    user: CurrentUser = Depends(require_roles("advertiser", "admin")),
):
    db = get_db()
    start = payload.start_date or date.today()
    end = start + timedelta(days=AD_DURATION_DAYS - 1)
    data = payload.model_dump(mode="json")
    data.update({
        "advertiser_id": int(user.id),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "amount_paid": AD_FEE,
        "status": "pending",
    })
    created = db.table("advertisements").insert(data).execute().data[0]

    payment = create_posting_payment(
        user_id=int(user.id), payable_type="advertisement", payable_id=created["id"],
        amount=AD_FEE, description=f"Ad campaign: {created['title']}",
    )
    db.table("advertisements").update({"payment_id": payment["id"]}).eq("id", created["id"]).execute()
    created["payment_id"] = payment["id"]

    write_audit_log(
        user_id=user.id, action="CREATE", table_name="advertisements", record_id=created["id"],
        new_value={"title": created["title"]}, ip_address=client_ip(request), user_agent=user_agent(request),
    )
    return {"advertisement": created, "payment": payment}


@router.put("/{ad_id}")
async def update_ad(ad_id: int, payload: AdUpdate, request: Request,
                    user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    if user.role != "admin" and ad["advertiser_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ad")
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not changes:
        return ad
    updated = db.table("advertisements").update(changes).eq("id", ad_id).execute().data[0]
    write_audit_log(user_id=user.id, action="UPDATE", table_name="advertisements", record_id=ad_id,
                    old_value={k: ad.get(k) for k in changes}, new_value=changes,
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return updated


@router.delete("/{ad_id}")
async def delete_ad(ad_id: int, request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    if user.role != "admin" and ad["advertiser_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ad")
    db.table("advertisements").delete().eq("id", ad_id).execute()
    write_audit_log(user_id=user.id, action="DELETE", table_name="advertisements", record_id=ad_id,
                    old_value={"title": ad["title"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Ad deleted"}


@router.get("/{ad_id}/click")
async def click_ad(ad_id: int):
    """Increment click counter and redirect to the advertiser's target URL."""
    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    db.table("advertisements").update({"clicks": (ad.get("clicks") or 0) + 1}).eq("id", ad_id).execute()
    return RedirectResponse(ad.get("target_url") or "/")


@router.post("/{ad_id}/impression")
async def track_impression(ad_id: int):
    db = get_db()
    res = db.table("advertisements").select("impressions").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    db.table("advertisements").update(
        {"impressions": (res.data[0].get("impressions") or 0) + 1}
    ).eq("id", ad_id).execute()
    return {"message": "ok"}
