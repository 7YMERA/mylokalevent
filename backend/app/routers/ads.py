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
from app.services.email_service import send_ad_expiring
from app.services.payment_service import create_posting_payment
from app.utils import client_ip, user_agent

router = APIRouter()

AD_DURATION_DAYS = 7

# Tiered pricing by PURCHASABLE placement (7-day cycle). Premium real estate
# costs more. "feed" = a native sponsored post interleaved into the community
# feed. NOTE: "sponsored" is NOT a purchasable placement — the /sponsored page
# is a free showcase that lists EVERY active ad regardless of its placement.
PLACEMENT_PRICES = {"side": 40.00, "feed": 50.00, "featured": 70.00, "top": 130.00}
DEFAULT_PLACEMENT = "featured"


def ad_fee(placement: str) -> float:
    return PLACEMENT_PRICES.get(placement, PLACEMENT_PRICES[DEFAULT_PLACEMENT])


def _attach_event_titles(ads: list[dict]) -> list[dict]:
    """Attach the promoted event's title to each ad (for display)."""
    ids = list({a["event_id"] for a in ads if a.get("event_id")})
    titles = {}
    if ids:
        for e in get_db().table("events").select("id,title").in_("id", ids).execute().data or []:
            titles[e["id"]] = e["title"]
    for a in ads:
        a["event_title"] = titles.get(a.get("event_id"))
    return ads


@router.get("/pricing")
async def ad_pricing():
    """Public: placement -> price (for the ad form to show live pricing)."""
    return {"placements": PLACEMENT_PRICES, "duration_days": AD_DURATION_DAYS}


@router.get("")
async def list_ads(
    placement: str | None = None,
    mine: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    db = get_db()
    query = db.table("advertisements").select("*", count="exact")
    if not mine:
        query = query.eq("status", "active")
    if placement:
        query = query.eq("placement", placement)
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    total = res.count or 0
    return {"items": _attach_event_titles(res.data), "total": total, "page": page, "page_size": page_size,
            "pages": ceil(total / page_size) if page_size else 0}


@router.get("/mine")
async def my_ads(user: CurrentUser = Depends(require_roles("organizer", "admin"))):
    res = (
        get_db().table("advertisements").select("*")
        .eq("advertiser_id", int(user.id)).order("created_at", desc=True).execute()
    )
    return res.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ad(
    payload: AdCreate,
    request: Request,
    pay_with: str = "card",
    user: CurrentUser = Depends(require_roles("organizer", "admin")),
):
    fee = ad_fee(payload.placement)
    if pay_with == "credits":
        from app.services.credits_service import get_balance
        if get_balance(int(user.id)) < fee:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Insufficient credits")

    db = get_db()
    start = date.today()  # runs from today for a 7-day cycle (no manual dates)
    end = start + timedelta(days=AD_DURATION_DAYS - 1)
    data = payload.model_dump(mode="json")
    data.pop("start_date", None)
    data.update({
        "advertiser_id": int(user.id),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "amount_paid": fee,
        "status": "pending",
    })
    created = db.table("advertisements").insert(data).execute().data[0]

    payment = create_posting_payment(
        user_id=int(user.id), payable_type="advertisement", payable_id=created["id"],
        amount=fee, description=f"Ad ({payload.placement}): {created['title']}", pay_with=pay_with,
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


@router.post("/{ad_id}/remind-expiry")
async def remind_expiry(ad_id: int, user: CurrentUser = Depends(get_current_user)):
    """Demo helper: send the 'ad expiring soon' email now (instead of waiting for
    the scheduled reminder). Owner or admin only."""
    from datetime import date as _date

    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    if user.role != "admin" and ad["advertiser_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your ad")

    owner = db.table("users").select("email").eq("id", ad["advertiser_id"]).execute().data
    if not owner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")
    try:
        days_left = (_date.fromisoformat(ad["end_date"]) - _date.today()).days
    except Exception:
        days_left = 0
    send_ad_expiring(owner[0]["email"], ad["title"], max(days_left, 0),
                     bool(ad.get("auto_renew")), float(ad.get("amount_paid") or 0))
    return {"message": "Expiry reminder sent"}


@router.get("/{ad_id}/click")
async def click_ad(ad_id: int):
    """Increment click counter and redirect to the promoted event (Roblox-style:
    the ad takes you to the thing it advertises). Falls back to an external
    target URL, then the site homepage."""
    from app.config import settings

    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    db.table("advertisements").update({"clicks": (ad.get("clicks") or 0) + 1}).eq("id", ad_id).execute()

    if ad.get("event_id"):
        dest = f"{settings.public_frontend}/events/{ad['event_id']}"
    elif ad.get("target_url"):
        dest = ad["target_url"]
    else:
        dest = settings.public_frontend or "/"
    return RedirectResponse(dest)


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
