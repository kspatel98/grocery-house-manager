from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ExternalPriceCache
from app.schemas import FlyerDealOut
from app.utils.market_data import normalize_canadian_postal_code


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _parse_valid_to(value: Any) -> datetime | None:
    """Parse flyer end dates as inclusive. Date-only values remain valid through local end-of-day.

    Flipp-style feeds often send YYYY-MM-DD. Treating that as midnight would expire a flyer
    almost a full day early, causing unnecessary paid refreshes.
    """
    if value in (None, ""):
        return None
    text = str(value).strip()
    parsed = _parse_datetime(value)
    if parsed is None:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed


def _flyer_cache_expiry(rows: list[dict[str, Any]], now: datetime) -> datetime:
    """Keep a postal-code flyer fetch until the first active flyer actually expires.

    This minimizes duplicate Apify calls while ensuring a mixed-store cache refreshes as soon
    as one merchant's current flyer rolls over. If the feed has no usable validity dates, keep
    the data for the configured fallback (default seven days in v76).
    """
    future_ends: list[datetime] = []
    for row in rows:
        end = _parse_valid_to(row.get("validTo") or row.get("valid_to") or row.get("flyerValidTo"))
        if end and end > now:
            future_ends.append(end)
    if future_ends:
        return min(future_ends)
    return now + timedelta(hours=max(24, settings.flyer_cache_hours))


def _safe_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _normalize_categories(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in re.split(r"[,;|]", value) if part.strip()]
    return []


def normalize_flyer_row(row: dict[str, Any]) -> FlyerDealOut:
    merchant = row.get("merchant") or row.get("merchantName") or row.get("store") or "Store"
    name = row.get("name") or row.get("title") or row.get("productName") or "Flyer item"
    postal = normalize_canadian_postal_code(row.get("postalCode") or row.get("postal_code"))
    return FlyerDealOut(
        merchant=str(merchant),
        merchant_id=str(row.get("merchantId") or row.get("merchant_id") or "") or None,
        item_id=str(row.get("itemId") or row.get("item_id") or "") or None,
        name=str(name),
        brand=str(row.get("brand")) if row.get("brand") else None,
        price=_safe_float(row.get("price")),
        price_raw=str(row.get("priceRaw") or row.get("price_raw") or "") or None,
        discount=str(row.get("discount")) if row.get("discount") not in (None, "") else None,
        valid_from=_parse_datetime(row.get("validFrom") or row.get("valid_from") or row.get("flyerValidFrom")),
        valid_to=_parse_valid_to(row.get("validTo") or row.get("valid_to") or row.get("flyerValidTo")),
        image_url=str(row.get("imageUrl") or row.get("image_url") or "") or None,
        categories=_normalize_categories(row.get("categories")),
        flyer_id=str(row.get("flyerId") or row.get("flyer_id") or "") or None,
        postal_code=postal,
        locale=str(row.get("locale") or "en-ca"),
        scraped_at=_parse_datetime(row.get("scrapedAt") or row.get("scraped_at")),
        change_type=str(row.get("changeType") or row.get("change_type") or "") or None,
        previous_price=_safe_float(row.get("previousPrice") or row.get("previous_price")),
        price_delta=_safe_float(row.get("priceDelta") or row.get("price_delta")),
        is_multi_product_bundle=bool(row.get("isMultiProductBundle") or row.get("is_multi_product_bundle") or False),
        source="weekly_flyer",
    )


def _cache_key(postal_code: str, merchants: list[str]) -> str:
    payload = "|".join([postal_code.replace(" ", ""), *sorted(item.casefold().strip() for item in merchants if item.strip())])
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"weekly_flyers:{digest}"


def _clean_merchants(merchants: list[str] | None) -> list[str]:
    result: list[str] = []
    for merchant in merchants or []:
        value = " ".join(str(merchant).split()).strip()
        if value and value.casefold() not in {item.casefold() for item in result}:
            result.append(value)
    return result[: max(1, settings.flyer_max_merchants)]


def _cache_row(db: Session, postal_code: str, merchants: list[str]) -> ExternalPriceCache | None:
    return db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == _cache_key(postal_code, merchants)).first()


def get_weekly_flyer_deals(
    db: Session,
    *,
    postal_code: str,
    merchants: list[str] | None = None,
    force_refresh: bool = False,
) -> tuple[bool, datetime | None, list[FlyerDealOut]]:
    clean_postal = normalize_canadian_postal_code(postal_code)
    if not clean_postal or len(clean_postal.replace(" ", "")) != 6:
        raise ValueError("Enter a complete Canadian postal code, for example L8P 1A1.")

    clean_merchants = _clean_merchants(merchants)
    now = datetime.now(timezone.utc)
    existing = _cache_row(db, clean_postal, clean_merchants)
    if existing and not force_refresh:
        expires = existing.expires_at if existing.expires_at.tzinfo else existing.expires_at.replace(tzinfo=timezone.utc)
        if expires > now:
            try:
                raw = json.loads(existing.payload_json)
                rows = raw if isinstance(raw, list) else []
                return True, existing.fetched_at, [normalize_flyer_row(row) for row in rows if isinstance(row, dict)]
            except Exception:
                pass

    if not settings.apify_api_token:
        return False, existing.fetched_at if existing else None, []

    actor_id = (settings.apify_flyer_actor_id or "scrapersdelight/flipp-flyer-digest").replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    payload: dict[str, Any] = {
        "postalCode": clean_postal.replace(" ", ""),
        "listMerchantsOnly": False,
        "locale": "en-ca",
        "maxMerchants": max(1, settings.flyer_max_merchants),
        "categories": ["Groceries"],
        "trackChanges": True,
        "onlyChanges": False,
        "includeMarkdown": False,
    }
    if clean_merchants:
        payload["merchants"] = clean_merchants

    response = requests.post(
        url,
        params={"token": settings.apify_api_token, "timeout": max(30, settings.flyer_timeout_seconds)},
        json=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=max(45, settings.flyer_timeout_seconds + 20),
    )
    response.raise_for_status()
    raw_items = response.json()
    if isinstance(raw_items, dict):
        for key in ("items", "results", "data"):
            if isinstance(raw_items.get(key), list):
                raw_items = raw_items[key]
                break
        else:
            raw_items = [raw_items]
    if not isinstance(raw_items, list):
        raw_items = []
    raw_items = [row for row in raw_items if isinstance(row, dict)]

    expires = _flyer_cache_expiry(raw_items, now)
    if existing:
        existing.source = "apify_flipp_flyer"
        existing.query = "weekly flyers"
        existing.location = clean_postal
        existing.retailers = ",".join(clean_merchants) if clean_merchants else None
        existing.payload_json = json.dumps(raw_items, default=str)
        existing.fetched_at = now
        existing.expires_at = expires
    else:
        db.add(
            ExternalPriceCache(
                cache_key=_cache_key(clean_postal, clean_merchants),
                source="apify_flipp_flyer",
                query="weekly flyers",
                location=clean_postal,
                retailers=",".join(clean_merchants) if clean_merchants else None,
                payload_json=json.dumps(raw_items, default=str),
                fetched_at=now,
                expires_at=expires,
            )
        )
    db.commit()
    return False, now, [normalize_flyer_row(row) for row in raw_items]


def discover_weekly_flyer_merchants(
    db: Session,
    *,
    postal_code: str,
    force_refresh: bool = False,
) -> tuple[bool, datetime | None, list[dict[str, Any]]]:
    clean_postal = normalize_canadian_postal_code(postal_code)
    if not clean_postal or len(clean_postal.replace(" ", "")) != 6:
        raise ValueError("Enter a complete Canadian postal code, for example L8P 1A1.")
    cache_key = f"weekly_flyer_merchants:{clean_postal.replace(' ', '')}"
    now = datetime.now(timezone.utc)
    existing = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == cache_key).first()
    if existing and not force_refresh:
        expires = existing.expires_at if existing.expires_at.tzinfo else existing.expires_at.replace(tzinfo=timezone.utc)
        if expires > now:
            try:
                data = json.loads(existing.payload_json)
                return True, existing.fetched_at, data if isinstance(data, list) else []
            except Exception:
                pass
    if not settings.apify_api_token:
        return False, existing.fetched_at if existing else None, []

    actor_id = (settings.apify_flyer_actor_id or "scrapersdelight/flipp-flyer-digest").replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    response = requests.post(
        url,
        params={"token": settings.apify_api_token, "timeout": max(30, settings.flyer_timeout_seconds)},
        json={"postalCode": clean_postal.replace(" ", ""), "listMerchantsOnly": True, "locale": "en-ca", "categories": ["Groceries"]},
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=max(45, settings.flyer_timeout_seconds + 20),
    )
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict):
        for key in ("items", "results", "data"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            data = [data]
    if not isinstance(data, list):
        data = []
    data = [row for row in data if isinstance(row, dict)]
    expires = now + timedelta(hours=max(6, settings.flyer_merchant_cache_hours))
    if existing:
        existing.source = "apify_flipp_flyer_merchants"
        existing.payload_json = json.dumps(data, default=str)
        existing.fetched_at = now
        existing.expires_at = expires
        existing.location = clean_postal
    else:
        db.add(ExternalPriceCache(
            cache_key=cache_key,
            source="apify_flipp_flyer_merchants",
            query="flyer merchants",
            location=clean_postal,
            payload_json=json.dumps(data, default=str),
            fetched_at=now,
            expires_at=expires,
        ))
    db.commit()
    return False, now, data
