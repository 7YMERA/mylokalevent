"""Analytics, KPIs & audit-log viewer (Requirements 2, 7, 8).

Aggregations are computed in Python over fetched rows — simple and adequate for
this platform's scale. Admin-only.
"""
import csv
import io
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.utils import client_ip, user_agent

router = APIRouter()
admin_only = require_roles("admin")


@router.get("/dashboard")
async def dashboard(_: CurrentUser = Depends(admin_only)):
    """KPI summary cards for the admin dashboard."""
    db = get_db()

    def count(table: str, **eq) -> int:
        q = db.table(table).select("id", count="exact")
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    # Monthly revenue from successful payments.
    payments = db.table("payments").select("amount,status,created_at").eq("status", "success").execute().data or []
    total_revenue = sum(float(p["amount"]) for p in payments)

    return {
        "total_events": count("events"),
        "live_events": count("events", status="live"),
        "pending_approvals": count("events", status="pending"),
        "active_ads": count("advertisements", status="active"),
        "total_users": count("users"),
        "total_catches": count("fish_catches"),
        "total_revenue": round(total_revenue, 2),
        "total_payments": len(payments),
    }


@router.get("/events-by-state")
async def events_by_state(_: CurrentUser = Depends(admin_only)):
    rows = get_db().table("events").select("state").execute().data or []
    counts = Counter(r["state"] for r in rows if r.get("state"))
    return [{"label": k, "value": v} for k, v in counts.most_common()]


@router.get("/events-by-category")
async def events_by_category(_: CurrentUser = Depends(admin_only)):
    db = get_db()
    cats = {c["id"]: c["name"] for c in db.table("categories").select("id,name").execute().data or []}
    rows = db.table("events").select("category_id").execute().data or []
    counts = Counter(cats.get(r["category_id"], "Uncategorised") for r in rows)
    return [{"label": k, "value": v} for k, v in counts.most_common()]


@router.get("/revenue-monthly")
async def revenue_monthly(_: CurrentUser = Depends(admin_only)):
    rows = get_db().table("payments").select("amount,created_at").eq("status", "success").execute().data or []
    monthly: dict[str, float] = defaultdict(float)
    for r in rows:
        month = (r.get("created_at") or "")[:7]  # YYYY-MM
        if month:
            monthly[month] += float(r["amount"])
    ordered = sorted(monthly.items())
    return [{"label": m, "value": round(v, 2)} for m, v in ordered]


@router.get("/ad-ctr")
async def ad_ctr(_: CurrentUser = Depends(admin_only)):
    rows = get_db().table("advertisements").select("title,clicks,impressions").execute().data or []
    out = []
    for r in rows:
        imp = r.get("impressions") or 0
        clicks = r.get("clicks") or 0
        ctr = round((clicks / imp) * 100, 2) if imp else 0.0
        out.append({"label": r["title"], "clicks": clicks, "impressions": imp, "ctr": ctr})
    return sorted(out, key=lambda x: x["ctr"], reverse=True)


@router.get("/catch-trends")
async def catch_trends(_: CurrentUser = Depends(admin_only)):
    rows = get_db().table("fish_catches").select("species,weight_kg").execute().data or []
    weights: dict[str, float] = defaultdict(float)
    for r in rows:
        weights[r["species"]] += float(r.get("weight_kg") or 0)
    ordered = sorted(weights.items(), key=lambda x: x[1], reverse=True)[:10]
    return [{"label": s, "value": round(w, 2)} for s, w in ordered]


# ---------------- Audit log viewer (Requirement 7) ----------------
def _attach_users(rows: list[dict]) -> list[dict]:
    """Attach each log's actor name + email (so the trail isn't just ID numbers)."""
    if not rows:
        return rows
    ids = list({r["user_id"] for r in rows if r.get("user_id")})
    users = {}
    if ids:
        for u in get_db().table("users").select("id,name,email").in_("id", ids).execute().data or []:
            users[u["id"]] = u
    for r in rows:
        u = users.get(r.get("user_id"))
        r["user_name"] = u["name"] if u else ("System" if r.get("user_id") is None else "Deleted user")
        r["user_email"] = u["email"] if u else None
    return rows


@router.get("/audit-logs/summary")
async def audit_log_summary(_: CurrentUser = Depends(admin_only)):
    """Per-action counts for the audit-log filter chips (All + one per action)."""
    rows = get_db().table("audit_logs").select("action").execute().data or []
    counts = Counter(r["action"] for r in rows if r.get("action"))
    return {"total": len(rows),
            "by_action": [{"action": k, "count": v} for k, v in counts.most_common()]}


@router.get("/audit-logs")
async def audit_logs(
    user_id: int | None = None,
    action: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: CurrentUser = Depends(admin_only),
):
    db = get_db()
    query = db.table("audit_logs").select("*", count="exact")
    if user_id:
        query = query.eq("user_id", user_id)
    if action:
        query = query.eq("action", action)
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    return {"items": _attach_users(res.data), "total": res.count or 0, "page": page, "page_size": page_size}


@router.get("/audit-logs/export")
async def export_audit_logs(request: Request, admin: CurrentUser = Depends(admin_only)):
    """Download the full audit trail as CSV (for compliance/reporting)."""
    rows = _attach_users(get_db().table("audit_logs").select("*").order("created_at", desc=True).execute().data or [])

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "user_name", "user_email", "user_id", "action",
                     "table_name", "record_id", "ip_address", "user_agent"])
    for r in rows:
        writer.writerow([r.get("id"), r.get("created_at"), r.get("user_name"), r.get("user_email"),
                         r.get("user_id"), r.get("action"), r.get("table_name"), r.get("record_id"),
                         r.get("ip_address"), r.get("user_agent")])
    buf.seek(0)

    write_audit_log(user_id=admin.id, action="EXPORT", table_name="audit_logs",
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
