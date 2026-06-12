"""Lookup/reference data: categories and the Malaysian state→district list."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.dependencies import require_roles
from app.services.weather_service import get_forecast

router = APIRouter()


@router.get("/weather")
async def weather(city: str = "Kuala Terengganu"):
    """5-day forecast for fishing-event pages (OpenWeatherMap, mockable)."""
    return get_forecast(city)


@router.get("/categories")
async def list_categories(kind: str | None = None):
    query = get_db().table("categories").select("*")
    if kind:
        query = query.eq("kind", kind)
    return query.order("name").execute().data


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(name: str, kind: str = "event", _=Depends(require_roles("admin"))):
    if kind not in ("event", "news"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be 'event' or 'news'")
    return get_db().table("categories").insert({"name": name, "kind": kind}).execute().data[0]
