"""Supabase client singleton. The server uses the service-role key for full DB access."""
from supabase import Client, create_client

from app.config import settings

_client: Client | None = None


def get_db() -> Client:
    """Return a cached Supabase client. Raises a clear error if not configured."""
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
