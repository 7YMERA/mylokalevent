"""MyLokalEvent — FastAPI application entrypoint.

Serves the REST API under /api/* and the static Bootstrap frontend at the root.
Runs locally, on a free host (Render/Fly), or a Hostinger VPS without code changes.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Routers (added incrementally as features are built).
from app.routers import (  # noqa: E402
    admin,
    ads,
    analytics,
    auth,
    events,
    fish,
    me,
    meta,
    news,
    payments,
    posts,
    spots,
    uploads,
)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: scheduler (event/ad expiry cron) is started here once built.
    try:
        from app.scheduler import start_scheduler, shutdown_scheduler
        start_scheduler()
    except Exception as exc:
        print(f"[startup] scheduler not started: {exc}")
        shutdown_scheduler = None
    yield
    if shutdown_scheduler:
        shutdown_scheduler()


app = FastAPI(
    title="MyLokalEvent API",
    description="Regional Event & Fishery Marketplace — Enterprise Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.app_name}


# --- API routers ---
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(ads.router, prefix="/api/advertisements", tags=["advertisements"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(fish.router, prefix="/api/fish-catches", tags=["fish-catches"])
app.include_router(spots.router, prefix="/api/spots", tags=["fishing-spots"])
app.include_router(posts.router, prefix="/api/posts", tags=["community-feed"])
app.include_router(uploads.router, prefix="/api/upload", tags=["upload"])
app.include_router(payments.router, prefix="/api/payment", tags=["payments"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(me.router, prefix="/api/me", tags=["me"])
app.include_router(meta.router, prefix="/api", tags=["meta"])


# --- Static frontend + SPA fallback (local dev / Render fallback) ---
# The frontend uses real /path URLs (history routing), so any unknown path must
# serve index.html and let the client router handle it. Real files (js/css) are
# served directly. Registered LAST so /api routes above take precedence.
if os.path.isdir(FRONTEND_DIR):
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return FileResponse(os.path.join(FRONTEND_DIR, "index.html"), status_code=404)
        candidate = os.path.normpath(os.path.join(FRONTEND_DIR, full_path))
        if full_path and candidate.startswith(FRONTEND_DIR) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
