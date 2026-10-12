from __future__ import annotations

import argparse
import requests

from app.core.config import settings
from app.utils.external_providers import (
    geoapify_is_configured,
    geoapify_nearby_stores,
    instacart_is_configured,
    instacart_nearby_retailers,
    upcdatabase_is_configured,
)


def yn(value: bool) -> str:
    return "yes" if value else "no"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check GHM third-party provider configuration and optional live connectivity.")
    parser.add_argument("--live", action="store_true", help="Perform small live calls. May consume one Serper query; does not scan a receipt.")
    parser.add_argument("--postal-code", default="L9C3M4")
    parser.add_argument("--lat", type=float, default=43.2557)
    parser.add_argument("--lng", type=float, default=-79.8711)
    args = parser.parse_args()

    rows = [
        ("Geoapify", bool(settings.geoapify_api_key)),
        ("UPCDatabase", bool(settings.upcdatabase_api_key)),
        ("Serper", bool(settings.serper_api_key)),
        ("Instacart", bool(settings.instacart_api_key)),
        ("Apify", bool(settings.apify_api_token)),
        ("Tabscanner", bool(settings.tabscanner_api_key)),
        ("AWS Textract", bool(settings.aws_textract_enabled)),
        ("DigitalOcean AI", bool(settings.digitalocean_ai_enabled or settings.digitalocean_agent_enabled)),
    ]
    print("GHM provider connectivity check")
    print("=" * 72)
    for label, configured in rows:
        print(f"{label:20} configured={yn(configured)}")

    if not args.live:
        print("\nRun again with --live to make small non-destructive provider calls.")
        return 0

    failures = 0
    print("\nLive checks")
    if geoapify_is_configured():
        try:
            stores = geoapify_nearby_stores(city="Hamilton", country="Canada", lat=args.lat, lng=args.lng, limit=3)
            print(f"[PASS] Geoapify returned {len(stores)} nearby supermarket result(s).")
        except Exception as exc:
            failures += 1; print(f"[FAIL] Geoapify: {exc}")

    if upcdatabase_is_configured():
        try:
            r = requests.get(f"{settings.upcdatabase_base_url.rstrip('/')}/account", headers={"Authorization": f"Bearer {settings.upcdatabase_api_key}"}, timeout=settings.upcdatabase_timeout_seconds)
            r.raise_for_status(); data = r.json()
            plan = ((data.get("api_subscription") or {}).get("name") if isinstance(data, dict) else None) or "connected"
            print(f"[PASS] UPCDatabase account API connected ({plan}).")
        except Exception as exc:
            failures += 1; print(f"[FAIL] UPCDatabase: {exc}")

    if settings.serper_api_key:
        try:
            r = requests.post("https://google.serper.dev/search", json={"q":"site:walmart.ca milk", "gl":"ca", "hl":"en", "num":1}, headers={"X-API-KEY":settings.serper_api_key,"Content-Type":"application/json"}, timeout=14)
            r.raise_for_status(); count = len((r.json().get("organic") or []))
            print(f"[PASS] Serper returned {count} result(s). This consumed one query.")
        except Exception as exc:
            failures += 1; print(f"[FAIL] Serper: {exc}")

    if instacart_is_configured():
        try:
            retailers = instacart_nearby_retailers(args.postal_code, "CA")
            print(f"[PASS] Instacart returned {len(retailers)} nearby retailer banner(s).")
        except Exception as exc:
            failures += 1; print(f"[FAIL] Instacart: {exc}")

    if settings.apify_api_token:
        try:
            r = requests.get("https://api.apify.com/v2/users/me", headers={"Authorization": f"Bearer {settings.apify_api_token}"}, timeout=12)
            r.raise_for_status(); print("[PASS] Apify account API connected.")
        except Exception as exc:
            failures += 1; print(f"[FAIL] Apify: {exc}")

    if settings.tabscanner_api_key:
        try:
            r = requests.get("https://api.tabscanner.com/api/credit", headers={"apikey": settings.tabscanner_api_key}, timeout=12)
            r.raise_for_status(); value = r.json()
            print(f"[PASS] Tabscanner connected; remaining credit={value if isinstance(value, (int,float)) else 'unknown'}.")
        except Exception as exc:
            failures += 1; print(f"[FAIL] Tabscanner: {exc}")

    if settings.aws_textract_enabled:
        try:
            import boto3
            kwargs = {"region_name": settings.aws_region}
            if settings.aws_access_key_id and settings.aws_secret_access_key:
                kwargs.update(aws_access_key_id=settings.aws_access_key_id, aws_secret_access_key=settings.aws_secret_access_key)
                if settings.aws_session_token:
                    kwargs["aws_session_token"] = settings.aws_session_token
            # Validate credentials without consuming an AnalyzeExpense call.
            # The actual Textract permission/quality is verified when a receipt is scanned.
            sts_kwargs = {k: v for k, v in kwargs.items() if k != "region_name"}
            boto3.client("sts", region_name=settings.aws_region, **sts_kwargs).get_caller_identity()
            print("[PASS] AWS credentials are valid. AnalyzeExpense permission is verified on the first receipt test.")
        except Exception as exc:
            failures += 1; print(f"[FAIL] AWS Textract credential check: {exc}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
