"""OpenWeatherMap 5-day forecast (Requirement 5).

Used on fishing-event detail pages. In MOCK mode returns deterministic sample
data so the UI renders without an API key.
"""
import httpx

from app.config import settings

_MOCK = {
    "location": "Kuala Terengganu",
    "forecast": [
        {"date": "Day 1", "temp": 30, "condition": "Sunny", "icon": "01d", "wind": 12, "humidity": 70},
        {"date": "Day 2", "temp": 29, "condition": "Partly cloudy", "icon": "02d", "wind": 14, "humidity": 74},
        {"date": "Day 3", "temp": 28, "condition": "Light rain", "icon": "10d", "wind": 18, "humidity": 82},
        {"date": "Day 4", "temp": 31, "condition": "Sunny", "icon": "01d", "wind": 10, "humidity": 66},
        {"date": "Day 5", "temp": 30, "condition": "Cloudy", "icon": "03d", "wind": 13, "humidity": 72},
    ],
    "mock": True,
}


def get_forecast(city: str) -> dict:
    """Return a simplified 5-day forecast for a Malaysian city/district."""
    if settings.mock_weather or not settings.openweather_api_key:
        data = dict(_MOCK)
        data["location"] = city or _MOCK["location"]
        return data

    try:
        # 5-day / 3-hour forecast endpoint, restricted to Malaysia.
        resp = httpx.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"q": f"{city},MY", "appid": settings.openweather_api_key, "units": "metric"},
            timeout=20,
        )
        resp.raise_for_status()
        raw = resp.json()

        # Collapse 3-hour entries into one reading per day (midday-ish).
        days: dict[str, dict] = {}
        for entry in raw.get("list", []):
            day = entry["dt_txt"].split(" ")[0]
            if day not in days and "12:00:00" in entry["dt_txt"]:
                days[day] = {
                    "date": day,
                    "temp": round(entry["main"]["temp"]),
                    "condition": entry["weather"][0]["main"],
                    "icon": entry["weather"][0]["icon"],
                    "wind": round(entry["wind"]["speed"]),
                    "humidity": entry["main"]["humidity"],
                }
        return {
            "location": raw.get("city", {}).get("name", city),
            "forecast": list(days.values())[:5],
            "mock": False,
        }
    except Exception as exc:
        print(f"[weather] fetch failed, returning mock: {exc}")
        data = dict(_MOCK)
        data["location"] = city or _MOCK["location"]
        return data
