"""Top up demo organizer accounts so their dashboards look lived-in.

Ensures each listed demo organizer has at least a few LIVE events AND a couple
of ACTIVE ad campaigns, plus some in-app notifications (for the dashboard's
notifications widget). Idempotent-ish: only tops up what's missing.

Run:  .venv/Scripts/python.exe populate_demo.py
"""
import random
from datetime import date, datetime, timedelta, timezone

from app.database import get_db

db = get_db()
random.seed(7)
now = datetime.now(timezone.utc)

# Demo organizers to make look active (dropdown accounts first).
DEMO_ORGS = [
    "tac@demo.mylokalevent.my",   # Organizer 1
    "ppt@demo.mylokalevent.my",   # Organizer 2 (also runs ads)
    "kfa@demo.mylokalevent.my",
    "bbr@demo.mylokalevent.my",
    "usb@demo.mylokalevent.my",
]

STATE_DISTRICTS = {
    "Terengganu": ["Kuala Terengganu", "Kemaman", "Marang"],
    "Perak": ["Ipoh", "Lumut", "Tronoh"],
    "Selangor": ["Klang", "Sepang", "Kuala Selangor"],
    "Pahang": ["Kuantan", "Pekan", "Cherating"],
}
EVENT_TITLES = ["Kejohanan Memancing {d}", "{d} Coastal Market", "Pesta Nelayan {d}",
                "{d} Sport Fishing Challenge", "Karnival Laut {d}"]
AD_TITLES = ["{n} — Weekend Sale", "{n} — 20% Off Gear", "{n} — Book Now",
             "{n} — Fresh Stock Daily"]
NOTIFS = [
    ("Welcome to MyLokalEvent", "Your account is ready — start posting events and ads."),
    ("Event approved", "Your event is now live and visible to the public."),
    ("New comment", "Someone commented on your community post."),
    ("Payment received", "We received your RM10 event posting fee."),
    ("Ad approved", "Your campaign is now running across the platform."),
]


def get_user(email):
    r = db.table("users").select("id,name").eq("email", email).execute().data
    return r[0] if r else None


def count(table, col, uid):
    return len(db.table(table).select("id").eq(col, uid).execute().data or [])


def add_events(uid, want=3):
    have = count("events", "organizer_id", uid)
    made = 0
    while have + made < want:
        state = random.choice(list(STATE_DISTRICTS))
        district = random.choice(STATE_DISTRICTS[state])
        start = now + timedelta(days=random.randint(7, 60), hours=9)
        ev = db.table("events").insert({
            "organizer_id": uid,
            "title": random.choice(EVENT_TITLES).format(d=district),
            "description": "Join us for a great day out by the water — food, prizes, and fun for the whole family.",
            "state": state, "district": district,
            "location_url": f"https://www.google.com/maps/search/?api=1&query={district.replace(' ', '+')}+jetty",
            "start_date": start.isoformat(), "end_date": (start + timedelta(hours=8)).isoformat(),
            "entry_fee": random.choice([0, 10, 30, 50]),
            "banner_url": f"https://picsum.photos/seed/demo-ev-{uid}-{made}/800/400",
            "status": "live", "view_count": random.randint(20, 600),
        }).execute().data[0]
        # matching successful payment (revenue realism)
        db.table("payments").insert({
            "user_id": uid, "payable_type": "event", "payable_id": ev["id"],
            "amount": 10.00, "method": "card", "status": "success",
            "transaction_id": f"DEMO-EV-{ev['id']}",
            "created_at": (now - timedelta(days=random.randint(1, 60))).isoformat(),
        }).execute()
        made += 1
    return made


def add_ads(uid, name, want=2):
    have = count("advertisements", "advertiser_id", uid)
    made = 0
    while have + made < want:
        start = (now - timedelta(days=random.randint(0, 3))).date()
        ad = db.table("advertisements").insert({
            "advertiser_id": uid,
            "title": random.choice(AD_TITLES).format(n=name),
            "description": "Great deals for anglers this week — visit us in-store or online.",
            "image_url": f"https://picsum.photos/seed/demo-ad-{uid}-{made}/1200/300",
            "target_url": "https://example.com/shop",
            "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
            "amount_paid": 70.00, "status": "active",
            "clicks": random.randint(5, 90), "impressions": random.randint(300, 3000),
        }).execute().data[0]
        db.table("payments").insert({
            "user_id": uid, "payable_type": "advertisement", "payable_id": ad["id"],
            "amount": 70.00, "method": "card", "status": "success",
            "transaction_id": f"DEMO-AD-{ad['id']}",
            "created_at": (now - timedelta(days=random.randint(1, 30))).isoformat(),
        }).execute()
        made += 1
    return made


FEED_AD_CAPTIONS = [
    "Wanna go fishing somewhere you'll love this weekend? Come join us at {ev} \U0001F3A3",
    "The tide is perfect and spots are filling up fast — see you at {ev}?",
    "Bring your rod and your buddies. {ev} is going to be a good one!",
    "Fresh catches, good vibes, great people. Don't miss {ev} \U0001F41F",
]


def add_feed_ads(uid, name, want=1):
    """Seed a native 'feed' placement ad that promotes one of the org's events,
    so the community feed shows a sponsored post (social-media style)."""
    have = (db.table("advertisements").select("id", count="exact")
            .eq("advertiser_id", uid).eq("placement", "feed").execute().count or 0)
    if have >= want:
        return 0
    evs = (db.table("events").select("id,title").eq("organizer_id", uid)
           .order("created_at", desc=True).limit(5).execute().data or [])
    if not evs:
        return 0
    made = 0
    while have + made < want:
        ev = random.choice(evs)
        start = (now - timedelta(days=random.randint(0, 2))).date()
        ad = db.table("advertisements").insert({
            "advertiser_id": uid,
            "title": name,
            "description": random.choice(FEED_AD_CAPTIONS).format(ev=ev["title"]),
            "image_url": f"https://picsum.photos/seed/feed-ad-{uid}-{made}/800/600",
            "event_id": ev["id"],
            "placement": "feed",
            "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
            "amount_paid": 50.00, "status": "active",
            "clicks": random.randint(3, 40), "impressions": random.randint(200, 1500),
        }).execute().data[0]
        db.table("payments").insert({
            "user_id": uid, "payable_type": "advertisement", "payable_id": ad["id"],
            "amount": 50.00, "method": "card", "status": "success",
            "transaction_id": f"DEMO-FEEDAD-{ad['id']}",
            "created_at": (now - timedelta(days=random.randint(1, 20))).isoformat(),
        }).execute()
        made += 1
    return made


def add_notifs(uid):
    if count("notifications", "user_id", uid) >= 3:
        return 0
    rows = []
    for i, (title, body) in enumerate(random.sample(NOTIFS, 4)):
        rows.append({"user_id": uid, "title": title, "body": body, "is_read": i >= 2,
                     "created_at": (now - timedelta(hours=random.randint(1, 72))).isoformat()})
    db.table("notifications").insert(rows).execute()
    return len(rows)


def main():
    print("=== Topping up demo organizer accounts ===")
    for email in DEMO_ORGS:
        u = get_user(email)
        if not u:
            print(f"  (skip) {email} not found")
            continue
        e = add_events(u["id"], want=3)
        a = add_ads(u["id"], u["name"], want=2)
        fa = add_feed_ads(u["id"], u["name"], want=1)
        n = add_notifs(u["id"])
        print(f"  {email}: +{e} events, +{a} ads, +{fa} feed ads, +{n} notifications")
    print("Done.")


if __name__ == "__main__":
    main()
