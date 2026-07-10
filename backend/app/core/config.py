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

    # Grocery market/product data integrations.
    # Open Food Facts is used for barcode/product details. It does not provide live store pricing.
    open_food_facts_base_url: str = "https://world.openfoodfacts.org"
    open_food_facts_user_agent: str = "GroceryHouseManager/1.0 (support@grocery-house-manager.com)"

    # Apify Canadian grocery price comparison actor. Uses HTTPS 443, not SMTP.
    # Actor docs currently support input like:
    # {"items": ["eggs"], "location": "Vancouver, BC", "retailers": ["loblaws", "saveon", "tnt"]}
    apify_api_token: str | None = None
    apify_canada_price_actor_id: str = "sunny_eternity/canada-grocery-price-comparison"
    apify_price_output_mode: str = "comparison"
    apify_price_cache_hours: int = 12
    apify_price_timeout_seconds: int = 90
    market_max_compare_items: int = 12

    # Professional receipt scanning. Veryfi returns structured receipt JSON
    # including vendor/store, dates, line items, discounts, taxes, and totals.
    # Leave disabled until credentials are configured.
    receipt_ocr_provider: str = "local"  # local, veryfi
    receipt_scan_review_required: bool = True
    receipt_upload_max_mb: int = 20
    veryfi_client_id: str | None = None
    veryfi_username: str | None = None
    veryfi_api_key: str | None = None
    veryfi_api_url: str = "https://api.veryfi.com/api/v8/partner/documents"
    veryfi_timeout_seconds: int = 60

    # Password reset email provider.
    # Recommended production value when SMTP 587/465 is blocked by hosting: resend.
    # Supported values: auto, resend, smtp. auto uses Resend when RESEND_API_KEY exists, otherwise SMTP.
    email_provider: str = "auto"

    # Optional Resend HTTPS Email API settings. Uses outbound HTTPS port 443.
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    resend_from_name: str = "Grocery House Manager"

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
