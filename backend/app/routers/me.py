"""Per-user dashboards, saved events, and notifications (Requirement 2).

Role-specific summary endpoints power the Organizer / Advertiser / Fisherman
dashboards. All require an authenticated user (own data only).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.services.credits_service import get_balance, recent_transactions
from app.services.payment_service import create_topup_session

router = APIRouter()


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    profile_image: str | None = None


class TopupRequest(BaseModel):
    amount: float = Field(gt=0, le=10000)  # RM to convert into credits


# ---------------- Credit wallet ----------------
@router.get("/wallet")
async def my_wallet(user: CurrentUser = Depends(get_current_user)):
    return {
        "balance": get_balance(int(user.id)),
        "transactions": recent_transactions(int(user.id), 50),
    }


@router.post("/wallet/topup")
async def topup_wallet(payload: TopupRequest, user: CurrentUser = Depends(get_current_user)):
    """Start a Stripe checkout to buy credits (RM amount -> credits, 1:1)."""
    result = create_topup_session(user_id=int(user.id), amount=round(payload.amount, 2))
    return {
        "payment_url": result.get("payment_url"),
        "mock": result.get("mock", False),
        "balance": get_balance(int(user.id)),
    }


@router.post("/wallet/remind-low")
async def remind_low_credits(user: CurrentUser = Depends(get_current_user)):
    """Demo helper: raise the 'credits running low' reminder now. Creates an in-app
    notification (the reliable signal) and also best-effort emails."""
    from app.notify import notify
    from app.services.email_service import send_low_credits

    bal = get_balance(int(user.id))
    notify(int(user.id), "Low credit balance",
           f"Your wallet is down to RM{bal:.2f}. Top up to keep posting events and running ads.")

    email = get_db().table("users").select("email").eq("id", int(user.id)).execute().data
    if email:  # best-effort email (only if an email provider is configured)
        send_low_credits(email[0]["email"], bal)
    return {"message": "Low-balance alert added to notifications"}


@router.get("/profile")
async def my_profile(user: CurrentUser = Depends(get_current_user)):
    res = get_db().table("users").select(
        "id,name,email,role,status,phone,profile_image,credits,created_at"
    ).eq("id", int(user.id)).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return res.data[0]


@router.put("/profile")
async def update_profile(payload: ProfileUpdate, user: CurrentUser = Depends(get_current_user)):
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not changes:
        return {"message": "Nothing to update"}
    updated = get_db().table("users").update(changes).eq("id", int(user.id)).execute().data[0]
    return {
        "id": updated["id"], "name": updated["name"], "email": updated["email"],
        "role": updated["role"], "phone": updated.get("phone"),
        "profile_image": updated.get("profile_image"),
    }


@router.get("/posts")
async def my_posts(user: CurrentUser = Depends(get_current_user)):
    return (
        get_db().table("posts").select("*")
        .eq("user_id", int(user.id)).order("created_at", desc=True).execute().data
    )


# ---------------- Notifications ----------------
@router.get("/notifications")
async def my_notifications(user: CurrentUser = Depends(get_current_user)):
    return (
        get_db().table("notifications").select("*")
        .eq("user_id", int(user.id)).order("created_at", desc=True).limit(50).execute().data
    )


@router.post("/notifications/{nid}/read")
async def mark_read(nid: int, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("notifications").select("user_id").eq("id", nid).execute()
    if not res.data or res.data[0]["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    db.table("notifications").update({"is_read": True}).eq("id", nid).execute()
    return {"message": "ok"}


# ---------------- Saved events ----------------
@router.get("/saved-events")
async def my_saved_events(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    saved = db.table("saved_events").select("event_id").eq("user_id", int(user.id)).execute().data or []
    ids = [s["event_id"] for s in saved]
    if not ids:
        return []
    return db.table("events").select("*").in_("id", ids).execute().data


# ---------------- Organizer summary ----------------
@router.get("/organizer-summary")
async def organizer_summary(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    events = db.table("events").select("*").eq("organizer_id", int(user.id)).execute().data or []
    event_ids = [e["id"] for e in events]
    saved_count = 0
    if event_ids:
        saved = db.table("saved_events").select("event_id", count="exact").in_("event_id", event_ids).execute()
        saved_count = saved.count or 0
    return {
        "total_events": len(events),
        "live": sum(1 for e in events if e["status"] == "live"),
        "pending": sum(1 for e in events if e["status"] == "pending"),
        "total_views": sum(e.get("view_count") or 0 for e in events),
        "saved_by_others": saved_count,
        "events": events,
    }


# ---------------- Advertiser summary ----------------
@router.get("/advertiser-summary")
async def advertiser_summary(user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    ads = (
        db.table("advertisements").select("*")
        .eq("advertiser_id", int(user.id)).order("created_at", desc=True).execute().data or []
    )
    # attach promoted event titles
    eids = list({a["event_id"] for a in ads if a.get("event_id")})
    titles = {}
    if eids:
        for e in db.table("events").select("id,title").in_("id", eids).execute().data or []:
            titles[e["id"]] = e["title"]
    for a in ads:
        imp = a.get("impressions") or 0
        a["ctr"] = round(((a.get("clicks") or 0) / imp) * 100, 2) if imp else 0.0
        a["event_title"] = titles.get(a.get("event_id"))
    return {
        "total_campaigns": len(ads),
        "active": sum(1 for a in ads if a["status"] == "active"),
        "total_clicks": sum(a.get("clicks") or 0 for a in ads),
        "total_impressions": sum(a.get("impressions") or 0 for a in ads),
        "campaigns": ads,
    }


# ---------------- Fisherman summary ----------------
@router.get("/fisherman-summary")
async def fisherman_summary(user: CurrentUser = Depends(get_current_user)):
    catches = (
        get_db().table("fish_catches").select("*")
        .eq("user_id", int(user.id)).order("created_at", desc=True).execute().data or []
    )
    return {
        "total_listings": len(catches),
        "available": sum(1 for c in catches if c.get("is_available")),
        "sold": sum(1 for c in catches if not c.get("is_available")),
        "catches": catches,
    }
