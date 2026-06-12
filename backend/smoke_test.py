"""End-to-end smoke test against the REAL Supabase DB, in-process (no sockets).

Run:  .venv/Scripts/python.exe smoke_test.py
Exercises the full event lifecycle across all 8 requirements.
"""
import sys
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, cond: bool, detail: str = ""):
    results.append((PASS if cond else FAIL, name, detail))
    print(f"[{PASS if cond else FAIL}] {name} {('- ' + detail) if detail else ''}")


# 1. Health
r = client.get("/api/health")
check("health endpoint", r.status_code == 200 and r.json().get("status") == "ok")

# 2. Public reads (seed data)
r = client.get("/api/spots")
check("fishing spots seeded", r.status_code == 200 and len(r.json()) >= 3, f"{len(r.json())} spots")

r = client.get("/api/categories", params={"kind": "event"})
check("event categories seeded", r.status_code == 200 and len(r.json()) >= 5, f"{len(r.json())} cats")
cat_id = r.json()[0]["id"] if r.json() else None

r = client.get("/api/weather", params={"city": "Kuala Terengganu"})
check("weather endpoint (mock)", r.status_code == 200 and "forecast" in r.json())

# 3. Admin login (seeded account)
r = client.post("/api/auth/login", json={"email": "admin@mylokalevent.my", "password": "Admin@123"})
check("admin login", r.status_code == 200 and r.json()["user"]["role"] == "admin", r.text[:120])
admin_token = r.json()["access_token"] if r.status_code == 200 else None
admin_h = {"Authorization": f"Bearer {admin_token}"}

# 3b. Wrong password rejected
r = client.post("/api/auth/login", json={"email": "admin@mylokalevent.my", "password": "wrong"})
check("wrong password rejected", r.status_code == 401)

# 4. Register an organizer (unique email each run)
org_email = f"org_{uuid.uuid4().hex[:8]}@test.my"
r = client.post("/api/auth/register", json={
    "name": "Test Organizer", "email": org_email, "password": "Pass@123", "role": "organizer"})
check("organizer registration", r.status_code == 201 and r.json()["user"]["role"] == "organizer", r.text[:120])
org_token = r.json()["access_token"] if r.status_code == 201 else None
org_h = {"Authorization": f"Bearer {org_token}"}

# 4b. /me works with token
r = client.get("/api/auth/me", headers=org_h)
check("auth /me", r.status_code == 200 and r.json()["email"] == org_email)

# 5. Organizer creates an event (triggers mock payment -> success)
event_id = None
r = client.post("/api/events", headers=org_h, json={
    "title": "Kejohanan Memancing Terengganu 2026",
    "description": "Annual fishing tournament.",
    "category_id": cat_id,
    "state": "Terengganu", "district": "Kuala Terengganu",
    "start_date": "2026-08-01T08:00:00Z", "end_date": "2026-08-01T18:00:00Z",
    "entry_fee": 50,
})
ok = r.status_code == 201
if ok:
    event_id = r.json()["event"]["id"]
    pay_ok = r.json()["payment"]["status"] == "success"
check("create event + mock payment", ok and r.json()["payment"]["status"] == "success", r.text[:160])

# 5b. Role guard: organizer cannot access admin route
r = client.get("/api/admin/users", headers=org_h)
check("role guard blocks organizer from admin", r.status_code == 403)

# 6. Event is 'pending' and NOT yet public
r = client.get("/api/events")
public_ids = [e["id"] for e in r.json()["items"]]
check("pending event hidden from public", event_id not in public_ids)

# 7. Admin sees it in pending queue, then approves -> live
r = client.get("/api/admin/events/pending", headers=admin_h)
check("event in admin pending queue", any(e["id"] == event_id for e in r.json()))

r = client.post(f"/api/admin/events/{event_id}/approve", headers=admin_h)
check("admin approve -> live", r.status_code == 200 and r.json()["status"] == "live", r.text[:160])

# 7b. Now public + searchable by state
r = client.get("/api/events", params={"state": "Terengganu"})
check("approved event now public & filterable", any(e["id"] == event_id for e in r.json()["items"]))

# 8. Audit log captured the actions
r = client.get("/api/analytics/audit-logs", headers=admin_h, params={"action": "APPROVE"})
check("audit log recorded APPROVE", r.status_code == 200 and r.json()["total"] >= 1)

# 8b. Analytics dashboard KPIs
r = client.get("/api/analytics/dashboard", headers=admin_h)
check("analytics dashboard KPIs", r.status_code == 200 and "total_revenue" in r.json(),
      f"revenue={r.json().get('total_revenue')}")

# 9. Cleanup the test event
if event_id:
    client.delete(f"/api/events/{event_id}", headers=admin_h)

# ---- Summary ----
fails = [r for r in results if r[0] == FAIL]
print("\n" + "=" * 50)
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed")
if fails:
    print("FAILURES:")
    for _, name, detail in fails:
        print(f"  - {name}: {detail}")
sys.exit(1 if fails else 0)
