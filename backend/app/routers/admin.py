"""Admin workflow & management (Requirements 4 & 1).

Event/ad approval pipeline (approve -> live / reject -> rejected) with email +
in-app notifications, plus user account management. Admin-only throughout.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.notify import notify
from app.schemas.events import RejectRequest
from app.services.email_service import send_event_approved, send_event_rejected
from app.utils import client_ip, user_agent

router = APIRouter()
admin_only = require_roles("admin")


# ---------------- Pending queues ----------------
@router.get("/events/pending")
async def pending_events(_: CurrentUser = Depends(admin_only)):
    return (
        get_db().table("events").select("*").eq("status", "pending")
        .order("created_at", desc=False).execute().data
    )


@router.get("/advertisements/pending")
async def pending_ads(_: CurrentUser = Depends(admin_only)):
    return (
        get_db().table("advertisements").select("*").eq("status", "pending")
        .order("created_at", desc=False).execute().data
    )


# ---------------- Event approval ----------------
def _event_payment_ok(event: dict) -> bool:
    """An event may only go live once its posting fee is paid."""
    pid = event.get("payment_id")
    if not pid:
        return False
    pay = get_db().table("payments").select("status").eq("id", pid).execute().data
    return bool(pay) and pay[0]["status"] == "success"


@router.post("/events/{event_id}/approve")
async def approve_event(event_id: int, request: Request, admin: CurrentUser = Depends(admin_only)):
    db = get_db()
    res = db.table("events").select("*").eq("id", event_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event = res.data[0]
    if not _event_payment_ok(event):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Posting fee not paid yet")

    db.table("events").update({"status": "live"}).eq("id", event_id).execute()
    write_audit_log(user_id=admin.id, action="APPROVE", table_name="events", record_id=event_id,
                    old_value={"status": event["status"]}, new_value={"status": "live"},
                    ip_address=client_ip(request), user_agent=user_agent(request))

    organizer = db.table("users").select("email").eq("id", event["organizer_id"]).execute().data
    if organizer:
        send_event_approved(organizer[0]["email"], event["title"])
    notify(event["organizer_id"], "Event approved", f"Your event '{event['title']}' is now live.")
    return {"message": "Event approved and published", "status": "live"}


@router.post("/events/{event_id}/reject")
async def reject_event(event_id: int, payload: RejectRequest, request: Request,
                       admin: CurrentUser = Depends(admin_only)):
    db = get_db()
    res = db.table("events").select("*").eq("id", event_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event = res.data[0]

    db.table("events").update({"status": "rejected", "reject_reason": payload.reason}).eq("id", event_id).execute()
    write_audit_log(user_id=admin.id, action="REJECT", table_name="events", record_id=event_id,
                    old_value={"status": event["status"]}, new_value={"status": "rejected", "reason": payload.reason},
                    ip_address=client_ip(request), user_agent=user_agent(request))

    organizer = db.table("users").select("email").eq("id", event["organizer_id"]).execute().data
    if organizer:
        send_event_rejected(organizer[0]["email"], event["title"], payload.reason)
    notify(event["organizer_id"], "Event rejected", f"'{event['title']}' was rejected: {payload.reason}")
    return {"message": "Event rejected", "status": "rejected"}


# ---------------- Ad approval ----------------
@router.post("/advertisements/{ad_id}/approve")
async def approve_ad(ad_id: int, request: Request, admin: CurrentUser = Depends(admin_only)):
    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    db.table("advertisements").update({"status": "active"}).eq("id", ad_id).execute()
    write_audit_log(user_id=admin.id, action="APPROVE", table_name="advertisements", record_id=ad_id,
                    new_value={"status": "active"}, ip_address=client_ip(request), user_agent=user_agent(request))
    notify(ad["advertiser_id"], "Ad approved", f"Your campaign '{ad['title']}' is now running.")
    return {"message": "Ad approved", "status": "active"}


@router.post("/advertisements/{ad_id}/reject")
async def reject_ad(ad_id: int, payload: RejectRequest, request: Request,
                    admin: CurrentUser = Depends(admin_only)):
    db = get_db()
    res = db.table("advertisements").select("*").eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    ad = res.data[0]
    db.table("advertisements").update({"status": "rejected", "reject_reason": payload.reason}).eq("id", ad_id).execute()
    write_audit_log(user_id=admin.id, action="REJECT", table_name="advertisements", record_id=ad_id,
                    new_value={"status": "rejected"}, ip_address=client_ip(request), user_agent=user_agent(request))
    notify(ad["advertiser_id"], "Ad rejected", f"'{ad['title']}' was rejected: {payload.reason}")
    return {"message": "Ad rejected", "status": "rejected"}


# ---------------- User management ----------------
@router.get("/users")
async def list_users(_: CurrentUser = Depends(admin_only)):
    return (
        get_db().table("users").select("id,name,email,role,status,phone,created_at")
        .order("created_at", desc=True).execute().data
    )


@router.put("/users/{user_id}/status")
async def set_user_status(user_id: int, new_status: str, request: Request,
                          admin: CurrentUser = Depends(admin_only)):
    if new_status not in ("active", "suspended", "banned"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid status")
    db = get_db()
    res = db.table("users").select("status").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    db.table("users").update({"status": new_status}).eq("id", user_id).execute()
    write_audit_log(user_id=admin.id, action="UPDATE", table_name="users", record_id=user_id,
                    old_value={"status": res.data[0]["status"]}, new_value={"status": new_status},
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": f"User status set to {new_status}"}
