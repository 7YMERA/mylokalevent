"""Events CRUD + search/filtering (Requirements 3 & 6).

Public can browse approved/live events with rich filters. Organizers manage their
own events; admins manage all. Posting an event creates a RM10 posting-fee payment
(the ToyyibPay redirect is wired in the payments router / task 5).
"""
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import (
    CurrentUser,
    get_current_user,
    get_current_user_optional,
    require_roles,
)
from app.schemas.events import EventCreate, EventUpdate
from app.services.email_service import send_event_submitted
from app.services.payment_service import create_posting_payment

router = APIRouter()

EVENT_POSTING_FEE = 10.00
# Statuses visible to the public.
PUBLIC_STATUSES = ("approved", "live")


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)


@router.get("")
async def list_events(
    request: Request,
    q: str | None = Query(None, description="keyword in title/description"),
    state: str | None = None,
    district: str | None = None,
    category_id: int | None = None,
    fee: str | None = Query(None, description="'free' or 'paid'"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str = Query("newest", description="newest | popular | upcoming"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    viewer: CurrentUser | None = Depends(get_current_user_optional),
):
    db = get_db()
    query = db.table("events").select("*", count="exact")

    # Visibility: public sees approved/live; admins see everything.
    if not (viewer and viewer.role == "admin"):
        query = query.in_("status", list(PUBLIC_STATUSES))

    if q:
        query = query.or_(f"title.ilike.%{q}%,description.ilike.%{q}%")
    if state:
        query = query.eq("state", state)
    if district:
        query = query.eq("district", district)
    if category_id:
        query = query.eq("category_id", category_id)
    if fee == "free":
        query = query.eq("entry_fee", 0)
    elif fee == "paid":
        query = query.gt("entry_fee", 0)
    if date_from:
        query = query.gte("start_date", date_from.isoformat())
    if date_to:
        query = query.lte("start_date", date_to.isoformat())

    if sort == "popular":
        query = query.order("view_count", desc=True)
    elif sort == "upcoming":
        query = query.order("start_date", desc=False)
    else:
        query = query.order("created_at", desc=True)

    start = (page - 1) * page_size
    query = query.range(start, start + page_size - 1)
    res = query.execute()

    total = res.count or 0
    return {
        "items": res.data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


@router.get("/{event_id}")
async def get_event(event_id: int, increment_view: bool = True):
    db = get_db()
    res = db.table("events").select("*").eq("id", event_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event = res.data[0]
    if increment_view:
        db.table("events").update({"view_count": (event.get("view_count") or 0) + 1}).eq(
            "id", event_id
        ).execute()
        event["view_count"] = (event.get("view_count") or 0) + 1

    # Attach organizer contact info so the public can reach out.
    org = db.table("users").select("name,email,phone").eq("id", event["organizer_id"]).execute().data
    if org:
        event["organizer_name"] = org[0]["name"]
        event["organizer_email"] = org[0]["email"]
        event["organizer_phone"] = org[0].get("phone")
    return event


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    request: Request,
    user: CurrentUser = Depends(require_roles("organizer", "admin")),
):
    if payload.end_date <= payload.start_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "end_date must be after start_date")

    db = get_db()
    data = payload.model_dump(mode="json")
    data.update({"organizer_id": int(user.id), "status": "pending"})
    created = db.table("events").insert(data).execute().data[0]

    # Create the RM10 posting-fee payment (mock auto-succeeds; real returns a bill URL).
    payment = create_posting_payment(
        user_id=int(user.id),
        payable_type="event",
        payable_id=created["id"],
        amount=EVENT_POSTING_FEE,
        description=f"Event posting fee: {created['title']}",
    )
    db.table("events").update({"payment_id": payment["id"]}).eq("id", created["id"]).execute()
    created["payment_id"] = payment["id"]

    write_audit_log(
        user_id=user.id, action="CREATE", table_name="events", record_id=created["id"],
        new_value={"title": created["title"], "status": created["status"]},
        ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"),
    )

    # Email the organizer: event received, pending approval.
    if user.email:
        send_event_submitted(user.email, created["title"])

    return {"event": created, "payment": payment}


@router.put("/{event_id}")
async def update_event(
    event_id: int,
    payload: EventUpdate,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db()
    res = db.table("events").select("*").eq("id", event_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event = res.data[0]

    if user.role != "admin" and event["organizer_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your event")

    changes = {k: v for k, v in payload.model_dump(mode="json", exclude_unset=True).items() if v is not None}
    if not changes:
        return event
    updated = db.table("events").update(changes).eq("id", event_id).execute().data[0]

    write_audit_log(
        user_id=user.id, action="UPDATE", table_name="events", record_id=event_id,
        old_value={k: event.get(k) for k in changes}, new_value=changes,
        ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"),
    )
    return updated


@router.delete("/{event_id}")
async def delete_event(
    event_id: int, request: Request, user: CurrentUser = Depends(get_current_user)
):
    db = get_db()
    res = db.table("events").select("*").eq("id", event_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    event = res.data[0]

    if user.role != "admin" and event["organizer_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your event")

    db.table("events").delete().eq("id", event_id).execute()
    write_audit_log(
        user_id=user.id, action="DELETE", table_name="events", record_id=event_id,
        old_value={"title": event["title"]},
        ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"),
    )
    return {"message": "Event deleted"}


# ---- Saved events (bookmarks) ----------------------------------------------
@router.post("/{event_id}/save")
async def save_event(event_id: int, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    if not db.table("events").select("id").eq("id", event_id).execute().data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    db.table("saved_events").upsert(
        {"user_id": int(user.id), "event_id": event_id}
    ).execute()
    return {"message": "Saved"}


@router.delete("/{event_id}/save")
async def unsave_event(event_id: int, user: CurrentUser = Depends(get_current_user)):
    get_db().table("saved_events").delete().eq("user_id", int(user.id)).eq(
        "event_id", event_id
    ).execute()
    return {"message": "Removed from saved"}
