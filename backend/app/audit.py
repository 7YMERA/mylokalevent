"""Audit logging helper — writes an entry to the audit_logs table.

Used both by the automatic middleware (app/middleware/audit.py) and explicitly
by routers that want to record old/new values for an affected record.
"""
from typing import Any

from app.database import get_db


def write_audit_log(
    *,
    user_id: str | int | None,
    action: str,
    table_name: str | None = None,
    record_id: str | int | None = None,
    old_value: Any = None,
    new_value: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Insert a single audit log row. Never raises — auditing must not break the request."""
    try:
        get_db().table("audit_logs").insert(
            {
                "user_id": user_id,
                "action": action,
                "table_name": table_name,
                "record_id": record_id,
                "old_value": old_value,
                "new_value": new_value,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
        ).execute()
    except Exception as exc:  # pragma: no cover - logging must be best-effort
        print(f"[audit] failed to write log: {exc}")
