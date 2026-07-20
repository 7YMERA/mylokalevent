"""Application configuration loaded from environment variables (.env)."""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to backend/.env so it loads no matter the working directory
# (e.g. when uvicorn is launched from the project root with --app-dir backend).
_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_PATH, env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "MyLokalEvent"
    base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"

    # JWT / security
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    max_login_attempts: int = 5
    lockout_minutes: int = 15

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_storage_bucket: str = "uploads"

    # Stripe (payments)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    payment_currency: str = "myr"
    # Where to send users back after Stripe checkout (the public frontend).
    frontend_url: str = "http://localhost:8000"

    # ToyyibPay (legacy — kept for backwards compatibility; unused now)
    toyyibpay_base_url: str = "https://dev.toyyibpay.com"
    toyyibpay_secret_key: str = ""
    toyyibpay_category_code: str = ""

    # SMTP (preferred — e.g. Gmail with an App Password; most reliable for demos).
    # If these are set, email is sent via SMTP instead of SendGrid.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # SendGrid
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "no-reply@example.com"
    sendgrid_from_name: str = "MyLokalEvent"
    # Demo: emails to fake seeded accounts (@demo.*, admin) are redirected here so
    # they're visible during a demo. Real registered users get their own email.
    demo_email_redirect: str = ""

    # OpenWeatherMap
    openweather_api_key: str = ""

    # Feature flags
    mock_payments: bool = False
    mock_email: bool = False
    mock_weather: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def public_frontend(self) -> str:
        """The public frontend base URL for redirects (ad clicks, Stripe return).
        Uses FRONTEND_URL if set to a real host, else falls back to the first
        non-backend CORS origin (so it works on Render without extra config)."""
        if self.frontend_url and "localhost" not in self.frontend_url:
            return self.frontend_url.rstrip("/")
        for o in self.cors_origin_list:
            if o.startswith("http") and "onrender.com" not in o and "localhost" not in o:
                return o.rstrip("/")
        return self.frontend_url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
