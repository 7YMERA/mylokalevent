"""Populate the database with lots of realistic demo data.

Run:  .venv/Scripts/python.exe seed_data.py
Safe to re-run: it clears previously seeded demo rows first (by the demo email
domain / a marker) so you don't get duplicates.

Creates: organizer/advertiser/fisherman users, ~40 events across Malaysian
states (mostly live), active ads, fish catches, news, and extra fishing spots,
plus matching successful payments so the revenue analytics look real.
"""
import random
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.security import hash_password

db = get_db()
random.seed(42)  # deterministic demo data

DEMO_PW = "Pass@123"
DEMO_DOMAIN = "@demo.mylokalevent.my"
now = datetime.now(timezone.utc)


def clear_previous_demo():
    """Remove rows from earlier seed runs (identified by the demo email domain)."""
    users = db.table("users").select("id").like("email", f"%{DEMO_DOMAIN}").execute().data or []
    ids = [u["id"] for u in users]
    if ids:
        # Children reference users with ON DELETE CASCADE, so deleting users
        # clears their events/ads/catches/payments too.
        db.table("users").delete().in_("id", ids).execute()
        print(f"cleared {len(ids)} previously-seeded users (and their data)")
    # News authored by demo users is cascaded; extra spots we tag by name prefix.
    db.table("fishing_spots").delete().like("name", "[demo]%").execute()


def _avatar(name: str) -> str:
    """A clean, on-brand initials avatar so every profile has a picture."""
    from urllib.parse import quote
    return f"https://ui-avatars.com/api/?name={quote(name)}&background=1B6CA8&color=fff&size=150&bold=true"


def make_users():
    def mk(name, email, role):
        return db.table("users").insert({
            "name": name, "email": email, "password": hash_password(DEMO_PW),
            "role": role, "status": "active", "profile_image": _avatar(name),
        }).execute().data[0]["id"]

    organizers = [
        mk("Terengganu Angling Club", f"tac{DEMO_DOMAIN}", "organizer"),
        mk("Kelantan Fisheries Assoc.", f"kfa{DEMO_DOMAIN}", "organizer"),
        mk("Sabah Coastal Events", f"sce{DEMO_DOMAIN}", "organizer"),
        mk("Perak Outdoor Society", f"pos{DEMO_DOMAIN}", "organizer"),
        mk("Johor Community Hub", f"jch{DEMO_DOMAIN}", "organizer"),
    ]
    # Advertiser role merged into organizer — these are organizers who run ads.
    advertisers = [
        mk("Pancing Pro Tackle", f"ppt{DEMO_DOMAIN}", "organizer"),
        mk("Bahtera Boat Rentals", f"bbr{DEMO_DOMAIN}", "organizer"),
        mk("Umpan Segar Bait Co.", f"usb{DEMO_DOMAIN}", "organizer"),
    ]
    fishermen = [
        mk("Nelson Co-op Kuantan", f"nck{DEMO_DOMAIN}", "fisherman"),
        mk("Koperasi Nelayan Tawau", f"knt{DEMO_DOMAIN}", "fisherman"),
        mk("Pantai Timur Seafood", f"pts{DEMO_DOMAIN}", "fisherman"),
    ]
    print(f"created {len(organizers)} organizers, {len(advertisers)} advertisers, {len(fishermen)} fishermen")
    return organizers, advertisers, fishermen


CATEGORIES = {}


def load_categories():
    for c in db.table("categories").select("id,name,kind").execute().data or []:
        CATEGORIES[c["name"]] = c["id"]


# state -> a few districts
STATE_DISTRICTS = {
    "Terengganu": ["Kuala Terengganu", "Kemaman", "Marang", "Dungun"],
    "Kelantan": ["Kota Bharu", "Tumpat", "Bachok", "Pasir Puteh"],
    "Sabah": ["Kota Kinabalu", "Tawau", "Sandakan", "Semporna"],
    "Perak": ["Ipoh", "Lumut", "Teluk Intan", "Tronoh"],
    "Johor": ["Johor Bahru", "Mersing", "Batu Pahat", "Pontian"],
    "Pahang": ["Kuantan", "Pekan", "Rompin", "Cherating"],
    "Selangor": ["Klang", "Sepang", "Kuala Selangor", "Sabak Bernam"],
    "Pulau Pinang": ["George Town", "Balik Pulau", "Batu Ferringhi"],
}

EVENT_TITLES = [
    ("Kejohanan Memancing {d} {y}", "Fishing Competition"),
    ("{d} Coastal Seafood Market", "Coastal Market"),
    ("Pesta Nelayan {d}", "Community Gathering"),
    ("{d} Sport Fishing Challenge", "Fishing Competition"),
    ("Karnival Laut {d}", "Cultural Festival"),
    ("{d} Anglers Workshop", "Seminar / Workshop"),
    ("Jom Pancing {d} Open", "Fishing Competition"),
    ("{d} Fresh Catch Bazaar", "Coastal Market"),
    ("Gotong-Royong Pantai {d}", "Community Gathering"),
    ("{d} Deep Sea Tournament", "Fishing Competition"),
]

DESCRIPTIONS = [
    "Join anglers from across the region for a full day of competitive fishing, food stalls, and family fun.",
    "A weekend market showcasing the freshest local seafood, bait suppliers, and coastal crafts.",
    "Community gathering celebrating our fishing heritage with games, demos, and live music.",
    "Test your skills against the best. Prizes for heaviest catch, most species, and youth category.",
    "Cultural festival by the sea — traditional performances, boat displays, and seafood tasting.",
]


def make_events(organizers):
    rows = []
    statuses = (["live"] * 7) + ["pending", "expired"]  # weighted toward live
    for i in range(40):
        state = random.choice(list(STATE_DISTRICTS))
        district = random.choice(STATE_DISTRICTS[state])
        tmpl, cat = random.choice(EVENT_TITLES)
        title = tmpl.format(d=district, y=2026)
        status = random.choice(statuses)
        start_offset = random.randint(-20, 90)  # some past (expired), many upcoming
        start = now + timedelta(days=start_offset, hours=random.choice([8, 9, 10]))
        end = start + timedelta(hours=random.choice([6, 8, 10]))
        if status == "expired":
            start = now - timedelta(days=random.randint(10, 40))
            end = start + timedelta(hours=8)
        fee = random.choice([0, 0, 10, 20, 30, 50, 100])
        rows.append({
            "organizer_id": random.choice(organizers),
            "title": title,
            "description": random.choice(DESCRIPTIONS),
            "category_id": CATEGORIES.get(cat),
            "state": state, "district": district,
            "location_url": f"https://www.google.com/maps/search/?api=1&query={district.replace(' ', '+')}+jetty",
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "entry_fee": fee,
            "banner_url": f"https://picsum.photos/seed/mle-event-{i}/800/400",
            "status": status,
            "view_count": random.randint(5, 850),
        })
    created = db.table("events").insert(rows).execute().data
    print(f"created {len(created)} events")
    return created


def make_payments_for(created_events, advertisers_ads):
    """Successful payments so revenue analytics show real numbers."""
    pays = []
    for ev in created_events:
        # spread across recent months for the monthly-revenue chart
        d = now - timedelta(days=random.randint(0, 150))
        pays.append({
            "user_id": ev["organizer_id"], "payable_type": "event", "payable_id": ev["id"],
            "amount": 10.00, "method": "fpx", "status": "success",
            "transaction_id": f"SEED-EV-{ev['id']}", "created_at": d.isoformat(),
        })
    for ad in advertisers_ads:
        d = now - timedelta(days=random.randint(0, 120))
        pays.append({
            "user_id": ad["advertiser_id"], "payable_type": "advertisement", "payable_id": ad["id"],
            "amount": 70.00, "method": "fpx", "status": "success",
            "transaction_id": f"SEED-AD-{ad['id']}", "created_at": d.isoformat(),
        })
    if pays:
        db.table("payments").insert(pays).execute()
    print(f"created {len(pays)} successful payments")


AD_DATA = [
    ("Pancing Pro — 20% Off Rods", "https://picsum.photos/seed/ad-rods/1200/300"),
    ("Bahtera Boat Rentals — Book Now", "https://picsum.photos/seed/ad-boat/1200/300"),
    ("Umpan Segar — Fresh Bait Daily", "https://picsum.photos/seed/ad-bait/1200/300"),
    ("Reel Deals — Weekend Clearance", "https://picsum.photos/seed/ad-reel/1200/300"),
    ("Coastal Gear Outlet", "https://picsum.photos/seed/ad-gear/1200/300"),
    ("Kayak Fishing Tours Langkawi", "https://picsum.photos/seed/ad-kayak/1200/300"),
]


def make_ads(advertisers, events):
    # Each ad promotes one of its advertiser's own events (falls back to any
    # event) so clicking it redirects to that event's page — no placeholder URL.
    by_owner = {}
    for ev in events:
        by_owner.setdefault(ev["organizer_id"], []).append(ev["id"])
    all_event_ids = [ev["id"] for ev in events]
    rows = []
    for i, (title, img) in enumerate(AD_DATA):
        adv = random.choice(advertisers)
        owned = by_owner.get(adv) or all_event_ids
        start = (now - timedelta(days=random.randint(0, 3))).date()
        rows.append({
            "advertiser_id": adv,
            "title": title, "image_url": img,
            "event_id": random.choice(owned) if owned else None,
            "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
            "amount_paid": 70.00, "status": "active",
            "clicks": random.randint(3, 120), "impressions": random.randint(200, 4000),
        })
    created = db.table("advertisements").insert(rows).execute().data
    print(f"created {len(created)} active ads")
    return created


SPECIES = ["Tuna", "Kembung", "Siakap", "Tenggiri", "Kerapu", "Selar", "Bawal Hitam",
           "Ikan Merah", "Sotong", "Udang Harimau", "Ketam Nipah", "Jenahak"]


def make_catches(fishermen):
    rows = []
    for i in range(16):
        sp = random.choice(SPECIES)
        rows.append({
            "user_id": random.choice(fishermen),
            "species": sp,
            "weight_kg": round(random.uniform(1, 40), 1),
            "price_per_kg": round(random.uniform(8, 60), 2),
            "location": random.choice(["Kuantan Port", "Tawau Jetty", "Kemaman", "Sandakan", "Endau"]),
            "catch_date": (now - timedelta(days=random.randint(0, 5))).date().isoformat(),
            "image_url": f"https://picsum.photos/seed/mle-fish-{i}/400/300",
            "is_available": random.random() > 0.25,
        })
    created = db.table("fish_catches").insert(rows).execute().data
    print(f"created {len(created)} fish catches")


NEWS = [
    ("Fishing Season Opens Along the East Coast", "The annual monsoon-end fishing season is officially open. Authorities remind anglers to check weather advisories before heading out."),
    ("New Jetty Facilities in Kuala Terengganu", "Upgraded jetty facilities now offer better access for recreational anglers and small co-op vessels."),
    ("Record Tuna Landing Reported in Tawau", "Local co-ops reported one of the largest tuna landings this quarter, boosting fresh supply at coastal markets."),
    ("Safety First: Life Jacket Campaign Launched", "A statewide campaign encourages all recreational anglers to wear life jackets during boat outings."),
    ("Coastal Cleanup Draws 500 Volunteers", "Community members gathered for a beach cleanup ahead of the coastal market season."),
    ("Weather Advisory: Rough Seas Expected", "Anglers are advised to postpone deep-sea trips this weekend due to strong winds forecast."),
]


def make_news(organizers):
    author = organizers[0]  # any user id works as author for demo
    rows = [{
        "author_id": author, "title": t, "body": b,
        "category_id": CATEGORIES.get("Fishery News") or CATEGORIES.get("Announcement"),
        "image_url": f"https://picsum.photos/seed/mle-news-{i}/600/300",
        "published": True,
    } for i, (t, b) in enumerate(NEWS)]
    db.table("news").insert(rows).execute()
    print(f"created {len(rows)} news articles")


EXTRA_SPOTS = [
    ("[demo] Kolam Pancing Danau Kota", "Popular city pond with patin and lampam. Night fishing allowed.", "Kuala Lumpur", "Setapak"),
    ("[demo] Tasik Biru Kundang", "Scenic ex-mining lake, good for toman and haruan.", "Selangor", "Rawang"),
    ("[demo] Kolam Pancing Air Payau Sepang", "Brackish pond stocked with siakap and jenahak.", "Selangor", "Sepang"),
    ("[demo] Empangan Pedu", "Large reservoir known for toman fly-fishing.", "Kedah", "Padang Terap"),
    ("[demo] Kolam Pancing Gunung Lang", "Family-friendly pond beside a recreation park.", "Perak", "Ipoh"),
    ("[demo] Pantai Kelanang Jetty", "Coastal spot for shore casting at sunset.", "Selangor", "Banting"),
]


def make_spots():
    rows = [{
        "name": n, "description": d, "state": s, "district": di,
        "maps_url": f"https://www.google.com/maps/search/?api=1&query={n.replace('[demo] ', '').replace(' ', '+')}",
        "is_active": True,
    } for (n, d, s, di) in EXTRA_SPOTS]
    db.table("fishing_spots").insert(rows).execute()
    print(f"created {len(rows)} extra fishing spots")


POST_CAPTIONS = [
    "Landed this beauty this morning — {sp} pulled hard! 🎣",
    "Perfect weather out on the water today. Tight lines everyone!",
    "Fresh {sp} straight off the boat. Who wants some?",
    "First time joining this event and it did not disappoint 🔥",
    "Family day out by the jetty. The kids caught their first fish!",
    "Big catch of the day — releasing this one back to grow bigger.",
    "Bait was on point today. {sp} everywhere near the rocks.",
    "Sunrise session paid off. Nothing beats fishing at dawn.",
    "Met so many fellow anglers at the tournament. Great vibes!",
    "Coastal market haul — supporting our local co-ops 💙",
    "Reeled in a monster {sp}! New personal best.",
    "Chill evening casting off the pier. Caught a few keepers.",
]


def make_posts(all_user_ids, events):
    live_events = [e for e in events if e["status"] == "live"]
    rows = []
    for i in range(15):
        sp = random.choice(SPECIES)
        caption = random.choice(POST_CAPTIONS).format(sp=sp)
        # ~60% tag a location, ~45% tag an event, ~70% have a photo
        state = district = None
        if random.random() < 0.6:
            state = random.choice(list(STATE_DISTRICTS))
            district = random.choice(STATE_DISTRICTS[state])
        event_id = None
        if live_events and random.random() < 0.45:
            ev = random.choice(live_events)
            event_id = ev["id"]
            if not state:
                state, district = ev["state"], ev["district"]
        rows.append({
            "user_id": random.choice(all_user_ids),
            "caption": caption,
            "image_url": f"https://picsum.photos/seed/mle-post-{i}/600/400" if random.random() < 0.7 else None,
            "state": state, "district": district, "event_id": event_id,
            "likes": random.randint(0, 45),
        })
    try:
        created = db.table("posts").insert(rows).execute().data
        print(f"created {len(created)} community posts")
    except Exception as exc:
        print(f"!! could not seed posts — did you run supabase/migration_posts.sql? ({exc})")


def main():
    print("=== Seeding MyLokalEvent demo data ===")
    clear_previous_demo()
    load_categories()
    organizers, advertisers, fishermen = make_users()
    events = make_events(organizers)
    ads = make_ads(advertisers, events)
    make_payments_for(events, ads)
    make_catches(fishermen)
    make_news(organizers)
    make_spots()
    make_posts(organizers + advertisers + fishermen, events)
    print("\n=== Done. Demo logins (password: Pass@123) ===")
    print("  organizer:  tac@demo.mylokalevent.my")
    print("  advertiser: ppt@demo.mylokalevent.my")
    print("  fisherman:  nck@demo.mylokalevent.my")
    print("  admin:      admin@mylokalevent.my / Admin@123")


if __name__ == "__main__":
    main()
