from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ExternalPriceCache
from app.schemas import LivePriceResultOut, ProductLookupResultOut

SUPPORTED_CANADA_RETAILERS = ["loblaws", "superstore", "nofrills", "saveonfoods", "pricesmart", "tnt"]


def _headers() -> dict[str, str]:
    return {"User-Agent": settings.open_food_facts_user_agent or "GroceryHouseManager/1.0"}


def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        raw = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _clean_categories(product: dict[str, Any]) -> list[str]:
    tags = product.get("categories_tags") or []
    if not isinstance(tags, list):
        tags = []
    cleaned = []
    for tag in tags[:8]:
        text = str(tag).replace("en:", "").replace("-", " ").strip().title()
        if text and text not in cleaned:
            cleaned.append(text)
    if not cleaned and product.get("categories"):
        cleaned = [part.strip() for part in str(product.get("categories")).split(",")[:8] if part.strip()]
    return cleaned


def _product_from_off(product: dict[str, Any], barcode: str | None = None) -> ProductLookupResultOut | None:
    name = (product.get("product_name") or product.get("generic_name") or "").strip()
    if not name:
        return None
    return ProductLookupResultOut(
        barcode=str(product.get("code") or barcode or "") or None,
        name=name,
        brand=(product.get("brands") or "").strip() or None,
        image_url=product.get("image_front_small_url") or product.get("image_front_url") or product.get("image_url"),
        categories=_clean_categories(product),
        nutrition_grade=(product.get("nutrition_grades") or product.get("nutriscore_grade") or None),
        quantity=(product.get("quantity") or None),
        found=True,
    )


def lookup_open_food_facts(*, barcode: str | None = None, query: str | None = None, limit: int = 8) -> list[ProductLookupResultOut]:
    base_url = (settings.open_food_facts_base_url or "https://world.openfoodfacts.org").rstrip("/")
    fields = "code,product_name,generic_name,brands,image_front_small_url,image_front_url,image_url,categories,categories_tags,nutrition_grades,nutriscore_grade,quantity"
    try:
        if barcode:
            response = requests.get(f"{base_url}/api/v2/product/{barcode}", params={"fields": fields}, headers=_headers(), timeout=10)
            response.raise_for_status()
            data = response.json()
            if int(data.get("status") or 0) != 1:
                return []
            result = _product_from_off(data.get("product") or {}, barcode=barcode)
            return [result] if result else []

        if not query:
            return []
        response = requests.get(
            f"{base_url}/cgi/search.pl",
            params={
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": max(1, min(limit, 20)),
                "fields": fields,
            },
            headers=_headers(),
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
        results: list[ProductLookupResultOut] = []
        for product in data.get("products") or []:
            parsed = _product_from_off(product)
            if parsed:
                results.append(parsed)
        return results[:limit]
    except Exception:
        return []


def _make_cache_key(items: list[str], location: str | None, retailers: list[str]) -> str:
    normalized = {
        "items": sorted([item.strip().lower() for item in items if item.strip()]),
        "location": (location or "").strip().lower(),
        "retailers": sorted([retailer.strip().lower() for retailer in retailers if retailer.strip()]),
        "actor": settings.apify_canada_price_actor_id,
        "mode": settings.apify_price_output_mode,
    }
    raw = json.dumps(normalized, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalize_retailers(retailers: list[str] | None) -> list[str]:
    if not retailers:
        return []
    normalized = []
    aliases = {
        "saveon": "saveonfoods",
        "save-on-foods": "saveonfoods",
        "save on foods": "saveonfoods",
        "no frills": "nofrills",
        "real canadian superstore": "superstore",
        "price smart": "pricesmart",
        "price smart foods": "pricesmart",
        "t&t": "tnt",
        "t and t": "tnt",
    }
    for retailer in retailers:
        key = str(retailer).strip().lower()
        key = aliases.get(key, key)
        if key in SUPPORTED_CANADA_RETAILERS and key not in normalized:
            normalized.append(key)
    return normalized


def normalize_price_row(row: dict[str, Any]) -> LivePriceResultOut:
    item = row.get("item") or row.get("query") or row.get("search_term") or row.get("input") or "Grocery item"
    retailer = row.get("retailer") or row.get("retailer_key") or row.get("source")
    banner = row.get("banner") or row.get("store_banner") or row.get("retailer_name")
    store_name = row.get("store_name") or row.get("store") or row.get("location_name")
    matched = row.get("matched_product") or row.get("matched_product_name") or row.get("product_name") or row.get("name") or row.get("title")
    return LivePriceResultOut(
        item=str(item),
        retailer=str(retailer) if retailer else None,
        banner=str(banner) if banner else None,
        store_name=str(store_name) if store_name else None,
        matched_product_name=str(matched) if matched else None,
        brand=str(row.get("brand")) if row.get("brand") else None,
        price=_safe_float(row.get("price")),
        sale_price=_safe_float(row.get("sale_price") or row.get("salePrice")),
        unit_price=str(row.get("unit_price") or row.get("unitPrice") or row.get("normalized_unit_price") or "") or None,
        package_size=str(row.get("package_size") or row.get("size") or row.get("package") or "") or None,
        availability=str(row.get("availability") or row.get("stock_status") or "") or None,
        is_on_sale=bool(row.get("is_on_sale")) if row.get("is_on_sale") is not None else None,
        match_confidence=str(row.get("match_confidence") or row.get("confidence") or "") or None,
        source_url=str(row.get("source_url") or row.get("product_url") or row.get("url") or "") or None,
        scraped_at=_parse_datetime(row.get("scraped_at") or row.get("fetched_at") or row.get("updated_at")),
    )


def _flatten_apify_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("results"), list):
            for child in item["results"]:
                if isinstance(child, dict):
                    rows.append({**child, "item": child.get("item") or item.get("item") or item.get("query")})
            continue
        if isinstance(item.get("comparison"), list):
            for child in item["comparison"]:
                if isinstance(child, dict):
                    rows.append({**child, "item": child.get("item") or item.get("item") or item.get("query")})
            continue
        rows.append(item)
    return rows


def get_cached_price_rows(db: Session, items: list[str], location: str | None, retailers: list[str]) -> tuple[bool, list[LivePriceResultOut]]:
    key = _make_cache_key(items, location, retailers)
    now = datetime.now(timezone.utc)
    cached = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key, ExternalPriceCache.expires_at > now).first()
    if not cached:
        return False, []
    try:
        payload = json.loads(cached.payload_json)
        rows = _flatten_apify_items(payload if isinstance(payload, list) else [])
        return True, [normalize_price_row(row) for row in rows]
    except Exception:
        return False, []


def compare_canadian_grocery_prices(
    db: Session,
    *,
    items: list[str],
    location: str | None,
    retailers: list[str] | None = None,
    force_refresh: bool = False,
) -> tuple[bool, list[LivePriceResultOut]]:
    clean_items = [item.strip() for item in items if item and item.strip()]
    clean_items = clean_items[: max(1, settings.market_max_compare_items)]
    clean_retailers = _normalize_retailers(retailers)
    if not clean_items:
        return False, []

    if not force_refresh:
        cached, rows = get_cached_price_rows(db, clean_items, location, clean_retailers)
        if cached:
            return True, rows

    if not settings.apify_api_token:
        return False, []

    actor_id = (settings.apify_canada_price_actor_id or "sunny_eternity/canada-grocery-price-comparison").replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    payload: dict[str, Any] = {
        "items": clean_items,
        "location": location or "Canada",
        "mode": settings.apify_price_output_mode or "comparison",
    }
    if clean_retailers:
        payload["retailers"] = clean_retailers

    response = requests.post(
        url,
        params={"token": settings.apify_api_token},
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=max(20, settings.apify_price_timeout_seconds),
    )
    response.raise_for_status()
    raw_items = response.json()
    if not isinstance(raw_items, list):
        raw_items = []
    rows = _flatten_apify_items(raw_items)
    normalized = [normalize_price_row(row) for row in rows]

    key = _make_cache_key(clean_items, location, clean_retailers)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=max(1, settings.apify_price_cache_hours))
    existing = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key).first()
    if existing:
        existing.payload_json = json.dumps(raw_items, default=str)
        existing.query = ", ".join(clean_items)
        existing.location = location
        existing.retailers = ",".join(clean_retailers) if clean_retailers else None
        existing.fetched_at = now
        existing.expires_at = expires
    else:
        db.add(ExternalPriceCache(
            cache_key=key,
            source="apify_canada",
            query=", ".join(clean_items),
            location=location,
            retailers=",".join(clean_retailers) if clean_retailers else None,
            payload_json=json.dumps(raw_items, default=str),
            fetched_at=now,
            expires_at=expires,
        ))
    db.commit()
    return False, normalized
