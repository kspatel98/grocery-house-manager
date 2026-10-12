from __future__ import annotations

from typing import Any
from urllib.parse import quote_plus

import requests

from app.core.config import settings
from app.schemas import NearbyStoreOut, ProductLookupResultOut


def upcdatabase_is_configured() -> bool:
    return bool((settings.upcdatabase_api_key or "").strip())


def _upc_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.upcdatabase_api_key}", "Accept": "application/json"}


def _upc_product_to_result(row: dict[str, Any], barcode: str | None = None) -> ProductLookupResultOut | None:
    title = str(row.get("title") or row.get("alias") or "").strip()
    if not title:
        return None
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    images = row.get("images") if isinstance(row.get("images"), list) else []
    categories = []
    category = str(row.get("category") or "").strip()
    if category:
        categories = [category]
    quantity_bits = []
    for key in ("quantity", "size", "weight"):
        value = str(metadata.get(key) or "").strip()
        if value and value not in quantity_bits:
            quantity_bits.append(value)
    return ProductLookupResultOut(
        source="upcdatabase",
        barcode=str(row.get("barcode") or barcode or "").strip() or None,
        name=title,
        brand=str(row.get("brand") or "").strip() or None,
        image_url=str(images[0]).strip() if images else None,
        categories=categories,
        quantity=" • ".join(quantity_bits) or None,
        store_name="UPCDatabase",
        lookup_note="Fallback product identity from UPCDatabase. Review brand and package size before saving.",
        found=True,
    )


def lookup_upcdatabase(*, barcode: str | None = None, query: str | None = None, limit: int = 8) -> list[ProductLookupResultOut]:
    if not upcdatabase_is_configured():
        return []
    base = (settings.upcdatabase_base_url or "https://api.upcdatabase.org").rstrip("/")
    timeout = max(3, int(settings.upcdatabase_timeout_seconds or 12))
    try:
        if barcode:
            response = requests.get(f"{base}/product/{quote_plus(str(barcode).strip())}", headers=_upc_headers(), timeout=timeout)
            if response.status_code == 404:
                return []
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict) and payload.get("success") is False:
                return []
            result = _upc_product_to_result(payload if isinstance(payload, dict) else {}, barcode=barcode)
            return [result] if result else []
        if not query or len(query.strip()) < 3:
            return []
        response = requests.get(
            f"{base}/search/",
            params={"query": query.strip(), "page": 1},
            headers=_upc_headers(),
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
        items = payload.get("items") if isinstance(payload, dict) else []
        results: list[ProductLookupResultOut] = []
        for row in items or []:
            if not isinstance(row, dict):
                continue
            result = _upc_product_to_result(row)
            if result:
                results.append(result)
            if len(results) >= limit:
                break
        return results
    except Exception:
        return []


def geoapify_is_configured() -> bool:
    return bool((settings.geoapify_api_key or "").strip())


def _geoapify_geocode(text: str) -> tuple[float, float] | None:
    if not geoapify_is_configured() or not text.strip():
        return None
    base = (settings.geoapify_base_url or "https://api.geoapify.com").rstrip("/")
    response = requests.get(
        f"{base}/v1/geocode/search",
        params={"text": text, "format": "json", "limit": 1, "apiKey": settings.geoapify_api_key},
        timeout=max(3, int(settings.geoapify_timeout_seconds or 10)),
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("results") if isinstance(payload, dict) else []
    if not rows:
        return None
    row = rows[0]
    return float(row["lat"]), float(row["lon"])


def geoapify_nearby_stores(*, city: str | None, country: str | None, lat: float | None, lng: float | None, limit: int | None = None) -> list[NearbyStoreOut]:
    if not geoapify_is_configured():
        return []
    if lat is None or lng is None:
        label = ", ".join(part for part in [city, country] if part)
        try:
            point = _geoapify_geocode(label)
        except Exception:
            point = None
        if point:
            lat, lng = point
    if lat is None or lng is None:
        return []
    base = (settings.geoapify_base_url or "https://api.geoapify.com").rstrip("/")
    desired = min(max(1, int(limit or settings.geoapify_max_results or 12)), 20)
    try:
        response = requests.get(
            f"{base}/v2/places",
            params={
                "categories": "commercial.supermarket",
                "filter": f"circle:{float(lng)},{float(lat)},{int(settings.geoapify_radius_meters or 8000)}",
                "bias": f"proximity:{float(lng)},{float(lat)}",
                "limit": desired,
                "lang": "en",
                "apiKey": settings.geoapify_api_key,
            },
            timeout=max(3, int(settings.geoapify_timeout_seconds or 10)),
        )
        response.raise_for_status()
        payload = response.json()
        stores: list[NearbyStoreOut] = []
        seen: set[str] = set()
        for feature in payload.get("features") or []:
            props = feature.get("properties") if isinstance(feature, dict) else None
            if not isinstance(props, dict):
                continue
            name = str(props.get("name") or props.get("address_line1") or "Grocery store").strip()
            address = str(props.get("formatted") or props.get("address_line2") or "").strip() or None
            plat = props.get("lat")
            plon = props.get("lon")
            key = f"{name.casefold()}|{address or ''}"
            if key in seen:
                continue
            seen.add(key)
            maps_url = None
            if plat is not None and plon is not None:
                maps_url = f"https://www.openstreetmap.org/?mlat={plat}&mlon={plon}#map=17/{plat}/{plon}"
            stores.append(NearbyStoreOut(name=name, address=address, maps_url=maps_url, source="geoapify"))
        return stores[:desired]
    except Exception:
        return []


def instacart_is_configured() -> bool:
    return bool((settings.instacart_api_key or "").strip())


def _instacart_base_url() -> str:
    env = (settings.instacart_environment or "development").strip().lower()
    return "https://connect.instacart.com" if env == "production" else "https://connect.dev.instacart.tools"


def _instacart_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.instacart_api_key}",
        "Accept": "application/json",
        "Accept-Language": "en-CA",
        "Content-Type": "application/json",
    }


def instacart_nearby_retailers(postal_code: str, country_code: str = "CA") -> list[dict[str, str]]:
    if not instacart_is_configured() or not postal_code.strip():
        return []
    response = requests.get(
        f"{_instacart_base_url()}/idp/v1/retailers",
        params={"postal_code": postal_code.replace(" ", ""), "country_code": (country_code or "CA").upper()},
        headers=_instacart_headers(),
        timeout=max(4, int(settings.instacart_timeout_seconds or 15)),
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("retailers") if isinstance(payload, dict) else []
    return [
        {
            "retailer_key": str(row.get("retailer_key") or ""),
            "name": str(row.get("name") or ""),
            "retailer_logo_url": str(row.get("retailer_logo_url") or ""),
        }
        for row in (rows or []) if isinstance(row, dict) and row.get("name")
    ]


def create_instacart_shopping_list_link(*, title: str, items: list[dict[str, Any]], linkback_url: str | None = None, expires_in_days: int = 30) -> str | None:
    if not instacart_is_configured() or not items:
        return None
    line_items: list[dict[str, Any]] = []
    seen_upcs: set[str] = set()
    for item in items:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        quantity = float(item.get("quantity") or 1)
        unit = str(item.get("unit") or "each").strip().lower()
        unit_aliases = {
            "pcs": "each", "pc": "each", "piece": "each", "pieces": "each", "ea": "each",
            "g": "gram", "grams": "gram", "kg": "kilogram", "kgs": "kilogram", "kilograms": "kilogram",
            "ml": "milliliter", "milliliters": "milliliter", "l": "liter", "litres": "liter", "liters": "liter",
            "oz": "ounce", "ounces": "ounce", "lb": "pound", "lbs": "pound", "pounds": "pound",
            "pkg": "package", "pack": "package", "packs": "package", "pk": "package",
        }
        unit = unit_aliases.get(unit, unit)
        supported_units = {
            "each", "package", "gram", "kilogram", "milliliter", "liter", "ounce", "pound",
            "tablespoon", "teaspoon", "cup", "pint", "quart", "gallon", "fluid ounce",
        }
        if unit not in supported_units:
            unit = "each"
        row: dict[str, Any] = {
            "name": name,
            "display_text": str(item.get("display_text") or name),
            "line_item_measurements": [{"quantity": quantity, "unit": unit}],
        }
        barcode = str(item.get("barcode") or "").strip()
        # Instacart rejects duplicate UPCs across line items. Use UPC only once and
        # let name/brand matching handle any repeated product rows.
        if barcode and barcode not in seen_upcs:
            row["upcs"] = [barcode]
            seen_upcs.add(barcode)
        brand = str(item.get("brand") or "").strip()
        if brand:
            row["filters"] = {"brand_filters": [brand]}
        line_items.append(row)
    if not line_items:
        return None
    payload: dict[str, Any] = {
        "title": title[:180] or "Grocery House Manager shopping list",
        "link_type": "shopping_list",
        "expires_in": max(1, min(int(expires_in_days), 365)),
        "line_items": line_items,
    }
    if linkback_url:
        payload["landing_page_configuration"] = {
            "partner_linkback_url": linkback_url,
        }
    response = requests.post(
        f"{_instacart_base_url()}/idp/v1/products/products_link",
        json=payload,
        headers=_instacart_headers(),
        timeout=max(5, int(settings.instacart_timeout_seconds or 15)),
    )
    response.raise_for_status()
    data = response.json()
    return str(data.get("products_link_url") or data.get("url") or "").strip() or None


def geoapify_find_store(merchant: str, postal_code: str) -> NearbyStoreOut | None:
    if not geoapify_is_configured() or not merchant.strip() or not postal_code.strip():
        return None
    base = (settings.geoapify_base_url or "https://api.geoapify.com").rstrip("/")
    try:
        response = requests.get(
            f"{base}/v1/geocode/search",
            params={
                "text": f"{merchant}, {postal_code}, Canada",
                "format": "json",
                "limit": 3,
                "filter": "countrycode:ca",
                "apiKey": settings.geoapify_api_key,
            },
            timeout=max(3, int(settings.geoapify_timeout_seconds or 10)),
        )
        response.raise_for_status()
        rows = response.json().get("results") or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or row.get("address_line1") or merchant).strip()
            formatted = str(row.get("formatted") or row.get("address_line2") or "").strip() or None
            lat, lon = row.get("lat"), row.get("lon")
            maps_url = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=17/{lat}/{lon}" if lat is not None and lon is not None else None
            return NearbyStoreOut(name=name, address=formatted, maps_url=maps_url, source="geoapify")
    except Exception:
        return None
    return None


def geoapify_reverse_postal(lat: float, lng: float) -> tuple[str | None, str | None, str | None]:
    if not geoapify_is_configured():
        return None, None, None
    base = (settings.geoapify_base_url or "https://api.geoapify.com").rstrip("/")
    try:
        response = requests.get(
            f"{base}/v1/geocode/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "limit": 1, "apiKey": settings.geoapify_api_key},
            timeout=max(3, int(settings.geoapify_timeout_seconds or 10)),
        )
        response.raise_for_status()
        rows = response.json().get("results") or []
        if not rows:
            return None, None, None
        row = rows[0]
        return str(row.get("postcode") or "").strip() or None, str(row.get("city") or row.get("municipality") or "").strip() or None, str(row.get("country") or "").strip() or None
    except Exception:
        return None, None, None
