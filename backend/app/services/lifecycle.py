"""Automated event/ad lifecycle jobs (Requirement 4), run hourly by APScheduler.

  - expire_events: events whose end_date has passed -> status 'expired' (archived).
  - expire_ads: ads whose end_date has passed -> status 'expired' + renewal email.

Both are idempotent and safe to run repeatedly.
"""
from datetime import date, datetime, timezone

from app.audit import write_audit_log
from app.database import get_db
from app.services.email_service import send_ad_expiry


def expire_events() -> int:
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    # Live/approved events past their end_date become expired.
    res = (
        db.table("events").select("id,title")
        .in_("status", ["approved", "live"]).lt("end_date", now).execute()
    )
    count = 0
    for ev in res.data or []:
        db.table("events").update({"status": "expired"}).eq("id", ev["id"]).execute()
        write_audit_log(user_id=None, action="UPDATE", table_name="events",
                        record_id=ev["id"], new_value={"status": "expired"})
        count += 1
    if count:
        print(f"[lifecycle] expired {count} event(s)")
    return count


def expire_ads() -> int:
    db = get_db()
    today = date.today().isoformat()
    res = (
        db.table("advertisements").select("id,title,advertiser_id")
        .eq("status", "active").lt("end_date", today).execute()
    )
    count = 0
    for ad in res.data or []:
        db.table("advertisements").update({"status": "expired"}).eq("id", ad["id"]).execute()
        write_audit_log(user_id=None, action="UPDATE", table_name="advertisements",
                        record_id=ad["id"], new_value={"status": "expired"})
        # Renewal reminder.
        owner = db.table("users").select("email").eq("id", ad["advertiser_id"]).execute().data
        if owner:
            send_ad_expiry(owner[0]["email"], ad["title"])
        count += 1
    if count:
        print(f"[lifecycle] expired {count} ad(s)")
    return count
