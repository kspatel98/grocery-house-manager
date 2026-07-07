from functools import lru_cache
import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Grocery House Manager"
    environment: str = "development"
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 60 * 24

    # Keep this as a string so .env can use a simple value like:
    # BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    backend_cors_origins: str = "http://localhost:5173"

    frontend_url: str = "http://localhost:5173"
    google_client_id: str | None = None

    # Stripe Billing / Checkout. Add real values in backend/.env when ready.
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_basic_monthly: str | None = None
    stripe_price_family_monthly: str | None = None
    stripe_price_pro_monthly: str | None = None
    # Optional Stripe promotion code ID for the automatic new-user Basic offer.
    # Create a Stripe coupon: 65% off, duration=repeating, duration_in_months=2,
    # then create a Promotion Code and paste its promo_... ID here.
    stripe_promotion_code_basic_new_user: str | None = None
    new_user_offer_days: int = 14
    upload_dir: str = "public/uploads"

    # Comma-separated app administrator emails. The owner email is included by default.
    admin_emails: str = "kp3813294@gmail.com"

    # Optional Google Maps Platform Places API key for nearby grocery store search.
    google_places_api_key: str | None = None

    # Optional SMTP settings for password reset emails. If these are blank,
    # forgot-password requests still generate secure codes but the backend can
    # only expose the code in non-production development mode.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Grocery House Manager"
    smtp_use_tls: bool = True
    # Keep true for Docker servers where smtp.gmail.com may resolve to IPv6
    # even though the container only has IPv4 routing. This prevents
    # OSError: [Errno 101] Network is unreachable during SMTP connect.
    smtp_force_ipv4: bool = True

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def admin_email_list(self) -> list[str]:
        return [email.strip().lower() for email in (self.admin_emails or "").split(",") if email.strip()]

    def is_admin_email(self, email: str | None) -> bool:
        return bool(email and email.lower() in self.admin_email_list)

    @property
    def cors_origins(self) -> list[str]:
        value = (self.backend_cors_origins or "").strip()
        if not value:
            return ["http://localhost:5173"]

        # Also support JSON format if someone uses:
        # BACKEND_CORS_ORIGINS=["http://localhost:5173"]
        if value.startswith("["):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            except json.JSONDecodeError:
                pass

        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
