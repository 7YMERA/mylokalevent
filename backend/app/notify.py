"""In-app notification helper (writes to the notifications table)."""
from app.database import get_db


def notify(user_id: int, title: str, body: str | None = None) -> None:
    try:
        get_db().table("notifications").insert(
            {"user_id": user_id, "title": title, "body": body}
        ).execute()
    except Exception as exc:  # pragma: no cover
        print(f"[notify] failed: {exc}")
