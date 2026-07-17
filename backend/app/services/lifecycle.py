"""Automated event/ad lifecycle jobs (Requirement 4), run hourly by APScheduler.

  - expire_events: events whose end_date has passed -> status 'expired' (archived).
  - expire_ads: ads whose end_date has passed -> status 'expired' + renewal email.

Both are idempotent and safe to run repeatedly.
"""
from datetime import date, datetime, timezone

from app.audit import write_audit_log
from app.database import get_db
from app.services.email_service import send_ad_expiry, send_email


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


AD_FEE = 70.00
AD_DURATION_DAYS = 7


def expire_ads() -> int:
    """Expire ads past their end_date. If auto_renew is on and the owner has
    enough credits, renew for another 7 days from the wallet instead; otherwise
    stop the ad and notify the owner."""
    from datetime import timedelta

    from app.services.credits_service import get_balance, spend_credits

    db = get_db()
    today = date.today()
    res = (
        db.table("advertisements").select("id,title,advertiser_id,auto_renew,amount_paid")
        .eq("status", "active").lt("end_date", today.isoformat()).execute()
    )
    expired = renewed = 0
    for ad in res.data or []:
        owner = db.table("users").select("email").eq("id", ad["advertiser_id"]).execute().data
        email = owner[0]["email"] if owner else None
        fee = float(ad.get("amount_paid") or AD_FEE)   # each ad renews at its placement price

        # Auto-renew from credits if enabled and affordable.
        if ad.get("auto_renew") and get_balance(ad["advertiser_id"]) >= fee:
            spend_credits(ad["advertiser_id"], fee, "ad_renewal",
                          f"Auto-renew ad: {ad['title']}")
            new_end = (today + timedelta(days=AD_DURATION_DAYS - 1)).isoformat()
            db.table("advertisements").update(
                {"start_date": today.isoformat(), "end_date": new_end}
            ).eq("id", ad["id"]).execute()
            write_audit_log(user_id=ad["advertiser_id"], action="UPDATE", table_name="advertisements",
                            record_id=ad["id"], new_value={"auto_renewed": True})
            if email:
                send_email(email, f"Your ad '{ad['title']}' auto-renewed",
                           f"<p>RM{fee:.0f} in credits was used to renew <b>{ad['title']}</b> for another 7 days.</p>")
            renewed += 1
            continue

        # Otherwise stop the ad.
        db.table("advertisements").update({"status": "expired"}).eq("id", ad["id"]).execute()
        write_audit_log(user_id=None, action="UPDATE", table_name="advertisements",
                        record_id=ad["id"], new_value={"status": "expired"})
        if email:
            if ad.get("auto_renew"):
                send_email(email, f"Your ad '{ad['title']}' stopped — out of credits",
                           f"<p>Auto-renew was on for <b>{ad['title']}</b>, but your credit balance "
                           f"was below RM{AD_FEE:.0f}, so the campaign has stopped. Top up and restart anytime.</p>")
            else:
                send_ad_expiry(email, ad["title"])
        expired += 1
    if expired or renewed:
        print(f"[lifecycle] ads: {renewed} auto-renewed, {expired} expired")
    return expired
