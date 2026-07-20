"""One-off maintenance: make every ad redirect to a real event.

Older demo ads were seeded with a placeholder `target_url` (example.com) and
no `event_id`, so clicking them left the site. This links each such ad to one
of its advertiser's own events (preferring live ones) and clears the
placeholder URL, so the click endpoint redirects to that event's page.

Run:  .venv/Scripts/python.exe fix_ad_targets.py
"""
import random

from app.database import get_db

db = get_db()
random.seed(7)


def events_for(advertiser_id, cache):
    if advertiser_id not in cache:
        rows = (db.table("events").select("id,status")
                .eq("organizer_id", advertiser_id).execute().data or [])
        # prefer live events; fall back to any of the advertiser's events
        live = [e["id"] for e in rows if e.get("status") == "live"]
        cache[advertiser_id] = live or [e["id"] for e in rows]
    return cache[advertiser_id]


def main():
    ads = (db.table("advertisements").select("id,advertiser_id,event_id,target_url")
           .execute().data or [])
    cache, linked, cleared, skipped = {}, 0, 0, 0
    for ad in ads:
        updates = {}
        # 1) ads with no event link: point them at one of the advertiser's events
        if not ad.get("event_id"):
            evs = events_for(ad["advertiser_id"], cache)
            if evs:
                updates["event_id"] = random.choice(evs)
                linked += 1
            else:
                skipped += 1
                print(f"  (skip) ad {ad['id']}: advertiser {ad['advertiser_id']} has no events")
        # 2) drop the example.com placeholder URL (unused once an event is linked)
        if "example.com" in (ad.get("target_url") or ""):
            updates["target_url"] = None
            cleared += 1
        if updates:
            db.table("advertisements").update(updates).eq("id", ad["id"]).execute()
    print(f"Done. Linked {linked} ad(s) to an event, cleared {cleared} placeholder URL(s). {skipped} skipped.")


if __name__ == "__main__":
    main()
