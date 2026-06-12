"""Background scheduler (APScheduler) for the automated event/ad lifecycle.

Cron jobs:
  - expire_events: move events past their end_date to status 'expired' (archived).
  - expire_ads: set ads past end_date to 'expired' and send renewal reminders.

Full job bodies are implemented with the workflow automation feature (task #6).
This stub keeps the app importable before that step is built.
"""
from apscheduler.schedulers.background import BackgroundScheduler

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="Asia/Kuala_Lumpur")

    # Jobs are registered here once the workflow service is built.
    try:
        from app.services.lifecycle import expire_events, expire_ads
        _scheduler.add_job(expire_events, "interval", hours=1, id="expire_events")
        _scheduler.add_job(expire_ads, "interval", hours=1, id="expire_ads")
    except Exception as exc:
        print(f"[scheduler] lifecycle jobs not registered yet: {exc}")

    _scheduler.start()
    print("[scheduler] started")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
