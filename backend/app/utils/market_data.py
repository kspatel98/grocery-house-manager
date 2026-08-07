from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote_plus

import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ExternalPriceCache
from app.schemas import LivePriceResultOut, ProductLookupResultOut

SUPPORTED_CANADA_RETAILERS = ["loblaws", "superstore", "nofrills", "saveon", "pricesmart", "tnt"]
WALMART_ALIASES = {"walmart", "walmart canada", "walmart ca", "wal-mart"}


def _headers() -> dict[str, str]:
    return {
        "User-Agent": settings.open_food_facts_user_agent or "GroceryHouseManager/1.0",
        "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9",
    }


def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        value = value.get("value") or value.get("price") or value.get("amount")
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
        source="open_food_facts",
        barcode=str(product.get("code") or barcode or "") or None,
        name=name,
        brand=(product.get("brands") or "").strip() or None,
        image_url=product.get("image_front_small_url") or product.get("image_front_url") or product.get("image_url"),
        categories=_clean_categories(product),
        nutrition_grade=(product.get("nutrition_grades") or product.get("nutriscore_grade") or None),
        quantity=(product.get("quantity") or None),
        store_name="Universal product database",
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


def _walk_json(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _first(value: Any, *keys: str) -> Any:
    if not isinstance(value, dict):
        return None
    for key in keys:
        found = value.get(key)
        if found not in (None, "", []):
            return found
    return None


def _image_from_value(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return str(_first(first, "url", "src", "thumbnailUrl") or "") or None
    if isinstance(value, dict):
        return str(_first(value, "url", "src", "thumbnailUrl") or "") or None
    return None


def _walmart_result_from_dict(data: dict[str, Any], product_id: str | None = None) -> ProductLookupResultOut | None:
    raw_name = _first(data, "name", "productName", "title", "displayName")
    if not raw_name:
        return None
    name = str(raw_name).strip()
    if len(name) < 2 or name.lower() in {"walmart", "search"}:
        return None
    brand = _first(data, "brand", "brandName")
    if isinstance(brand, dict):
        brand = _first(brand, "name", "brandName")
    price = _safe_float(_first(data, "price", "currentPrice", "salePrice", "priceInfo"))
    product_url = _first(data, "url", "canonicalUrl", "productUrl")
    if product_url and str(product_url).startswith("/"):
        product_url = f"https://www.walmart.ca{product_url}"
    image_url = _image_from_value(_first(data, "image", "imageUrl", "thumbnailUrl", "images"))
    quantity = _first(data, "size", "packageSize", "netContent", "weight", "quantity")
    barcode = _first(data, "upc", "gtin13", "gtin", "sku", "itemId", "productId") or product_id
    return ProductLookupResultOut(
        source="walmart_ca",
        barcode=str(barcode) if barcode else None,
        name=name[:180],
        brand=str(brand).strip() if brand else None,
        image_url=image_url,
        categories=["Walmart Canada"],
        quantity=str(quantity).strip() if quantity else None,
        store_name="Walmart",
        product_url=str(product_url) if product_url else None,
        price=price,
        found=True,
    )


def lookup_walmart_canada_product(*, product_id: str | None = None, query: str | None = None, limit: int = 8) -> list[ProductLookupResultOut]:
    """Best-effort Walmart Canada lookup for item/product numbers and search text.

    Walmart Canada does not expose a public app API in this project. This uses the public
    product/search pages and extracts structured JSON when Walmart returns it. If Walmart
    blocks or changes the page, the UI explains that store-specific lookup is unavailable.
    """
    term = (product_id or query or "").strip()
    if not term:
        return []
    candidates = [f"https://www.walmart.ca/search?q={quote_plus(term)}"]
    if re.fullmatch(r"[A-Za-z0-9_-]{5,40}", term):
        candidates.append(f"https://www.walmart.ca/en/ip/{quote_plus(term)}")

    results: list[ProductLookupResultOut] = []
    seen: set[str] = set()
    for url in candidates:
        try:
            response = requests.get(url, headers={**_headers(), "User-Agent": "Mozilla/5.0 GroceryHouseManager/1.0"}, timeout=14)
            response.raise_for_status()
            html = response.text
        except Exception:
            continue

        # JSON-LD product cards are the cleanest when available.
        for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, flags=re.I | re.S):
            try:
                payload = json.loads(match.group(1).strip())
            except Exception:
                continue
            for node in _walk_json(payload):
                kind = node.get("@type")
                if kind == "Product" or (isinstance(kind, list) and "Product" in kind):
                    parsed = _walmart_result_from_dict(node, product_id=term)
                    if parsed and parsed.name.lower() not in seen:
                        seen.add(parsed.name.lower())
                        results.append(parsed)
                        if len(results) >= limit:
                            return results

        # Walmart pages often include a large __NEXT_DATA__ JSON block.
        next_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, flags=re.S)
        if next_match:
            try:
                payload = json.loads(next_match.group(1))
            except Exception:
                payload = None
            if payload:
                for node in _walk_json(payload):
                    if not isinstance(node, dict):
                        continue
                    if not (_first(node, "name", "productName", "title") and (_first(node, "price", "currentPrice", "priceInfo") or _first(node, "imageUrl", "image", "thumbnailUrl"))):
                        continue
                    parsed = _walmart_result_from_dict(node, product_id=term)
                    if parsed and parsed.name.lower() not in seen:
                        seen.add(parsed.name.lower())
                        results.append(parsed)
                        if len(results) >= limit:
                            return results
    return results[:limit]



CANADIAN_STORE_LOOKUP_PROFILES: dict[str, dict[str, Any]] = {
    "walmart": {
        "display": "Walmart",
        "aliases": {"walmart", "walmart canada", "walmart ca", "wal-mart"},
        "source": "walmart_ca",
        "search_urls": ["https://www.walmart.ca/search?q={term}"],
    },
    "nofrills": {
        "display": "No Frills",
        "aliases": {"nofrills", "no frills", "no-frills"},
        "source": "nofrills_website",
        "search_urls": ["https://www.nofrills.ca/search?search-bar={term}", "https://www.nofrills.ca/en/search?search-bar={term}"],
    },
    "superstore": {
        "display": "Real Canadian Superstore",
        "aliases": {"superstore", "real canadian superstore", "rcss"},
        "source": "superstore_website",
        "search_urls": ["https://www.realcanadiansuperstore.ca/search?search-bar={term}", "https://www.realcanadiansuperstore.ca/en/search?search-bar={term}"],
    },
    "loblaws": {
        "display": "Loblaws",
        "aliases": {"loblaws", "loblaw"},
        "source": "loblaws_website",
        "search_urls": ["https://www.loblaws.ca/search?search-bar={term}", "https://www.loblaws.ca/en/search?search-bar={term}"],
    },
    "saveon": {
        "display": "Save-On-Foods",
        "aliases": {"saveon", "save on foods", "save-on-foods", "saveonfoods"},
        "source": "saveonfoods_website",
        "search_urls": ["https://www.saveonfoods.com/search?search_term={term}", "https://www.saveonfoods.com/sm/planning/rsid/1982/results?q={term}"],
    },
    "metro": {
        "display": "Metro",
        "aliases": {"metro", "metro canada"},
        "source": "metro_website",
        "search_urls": ["https://www.metro.ca/en/online-grocery/search?filter={term}"],
    },
    "foodbasics": {
        "display": "Food Basics",
        "aliases": {"food basics", "foodbasics"},
        "source": "foodbasics_website",
        "search_urls": ["https://www.foodbasics.ca/search?filter={term}"],
    },
    "freshco": {
        "display": "FreshCo",
        "aliases": {"freshco", "fresh co", "fresh-co"},
        "source": "freshco_website",
        "search_urls": ["https://voila.ca/search?search={term}", "https://www.freshco.com/search?search={term}"],
    },
    "costco": {
        "display": "Costco Canada",
        "aliases": {"costco", "costco canada"},
        "source": "costco_website",
        "search_urls": ["https://www.costco.ca/CatalogSearch?keyword={term}", "https://www.costco.ca/s?keyword={term}"],
    },
}


def normalize_store_lookup_key(store_name: str | None) -> str | None:
    clean = re.sub(r"[^a-z0-9]+", " ", (store_name or "").lower()).strip()
    if not clean:
        return None
    for key, profile in CANADIAN_STORE_LOOKUP_PROFILES.items():
        aliases = profile.get("aliases") or set()
        if clean in aliases or clean == key:
            return key
    compact = clean.replace(" ", "")
    for key, profile in CANADIAN_STORE_LOOKUP_PROFILES.items():
        aliases = {str(alias).replace(" ", "") for alias in (profile.get("aliases") or set())}
        if compact in aliases:
            return key
    return None


def supported_product_lookup_stores() -> list[str]:
    return [str(profile["display"]) for profile in CANADIAN_STORE_LOOKUP_PROFILES.values()]


def _category_texts_from_dict(data: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("category", "categoryName", "categoryPath", "categories", "breadcrumbs", "department", "aisle"):
        value = data.get(key)
        if not value:
            continue
        if isinstance(value, str):
            values.extend([part.strip() for part in re.split(r"[>/,|]", value) if part.strip()])
        elif isinstance(value, list):
            for child in value[:8]:
                if isinstance(child, str) and child.strip():
                    values.append(child.strip())
                elif isinstance(child, dict):
                    found = _first(child, "name", "label", "title", "categoryName")
                    if found:
                        values.append(str(found).strip())
        elif isinstance(value, dict):
            found = _first(value, "name", "label", "title", "categoryName")
            if found:
                values.append(str(found).strip())
    cleaned: list[str] = []
    for item in values:
        item = re.sub(r"\s+", " ", item).strip()
        if item and item.lower() not in {"grocery", "search", "products", "home"} and item not in cleaned:
            cleaned.append(item[:80])
    return cleaned[:6]


def _term_tokens(term: str) -> set[str]:
    return {token for token in re.sub(r"[^a-z0-9]+", " ", term.lower()).split() if len(token) >= 3 and not token.isdigit()}


def _looks_relevant_name(name: str, term: str) -> bool:
    tokens = _term_tokens(term)
    if not tokens:
        return True
    clean_name = re.sub(r"[^a-z0-9]+", " ", name.lower())
    return any(token in clean_name for token in tokens)


def _generic_store_result_from_dict(data: dict[str, Any], *, profile: dict[str, Any], term: str, source_url: str | None = None) -> ProductLookupResultOut | None:
    raw_name = _first(data, "name", "productName", "title", "displayName", "description")
    if not raw_name:
        return None
    name = re.sub(r"\s+", " ", str(raw_name)).strip()
    if len(name) < 2 or len(name) > 220 or name.lower() in {"search", "products", str(profile.get("display", "")).lower()}:
        return None
    if not _looks_relevant_name(name, term) and not re.search(re.escape(term), json.dumps(data, default=str), flags=re.I):
        return None

    brand = _first(data, "brand", "brandName", "manufacturer")
    if isinstance(brand, dict):
        brand = _first(brand, "name", "brandName")
    offers = data.get("offers") if isinstance(data.get("offers"), dict) else {}
    price = _safe_float(_first(data, "price", "currentPrice", "salePrice", "regularPrice", "priceInfo") or _first(offers, "price", "lowPrice", "highPrice"))
    product_url = _first(data, "url", "canonicalUrl", "productUrl", "pdpUrl", "link") or source_url
    if product_url and str(product_url).startswith("/"):
        base = str(source_url or "").split("/", 3)
        if len(base) >= 3:
            product_url = f"{base[0]}//{base[2]}{product_url}"
    image_url = _image_from_value(_first(data, "image", "imageUrl", "thumbnailUrl", "images", "smallImage"))
    quantity = _first(data, "size", "packageSize", "netContent", "weight", "quantity", "itemSize")
    barcode = _first(data, "upc", "gtin13", "gtin", "sku", "itemId", "productId", "articleNumber", "code")
    if not (price is not None or image_url or product_url):
        return None
    return ProductLookupResultOut(
        source=str(profile.get("source") or "store_website"),
        barcode=str(barcode) if barcode else (term if re.fullmatch(r"[A-Za-z0-9_-]{5,40}", term) else None),
        name=name[:180],
        brand=str(brand).strip() if brand else None,
        image_url=image_url,
        categories=_category_texts_from_dict(data) or [str(profile.get("display") or "Store website")],
        quantity=str(quantity).strip() if quantity else None,
        store_name=str(profile.get("display") or "Store"),
        product_url=str(product_url) if product_url else None,
        price=price,
        found=True,
    )


def _extract_json_blobs(html: str) -> list[Any]:
    payloads: list[Any] = []
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, flags=re.I | re.S):
        try:
            payloads.append(json.loads(match.group(1).strip()))
        except Exception:
            continue
    for pattern in [
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        r'<script[^>]+id=["\']ng-state["\'][^>]*>(.*?)</script>',
    ]:
        for match in re.finditer(pattern, html, flags=re.I | re.S):
            try:
                payloads.append(json.loads(match.group(1).strip()))
            except Exception:
                continue
    return payloads


def _meta_content(html: str, property_name: str) -> str | None:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(property_name)}["\']',
        rf'<meta[^>]+name=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.I)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()
    return None


def _meta_store_result(html: str, *, profile: dict[str, Any], term: str, source_url: str) -> ProductLookupResultOut | None:
    title = _meta_content(html, "og:title") or _meta_content(html, "twitter:title")
    if not title:
        return None
    title = re.sub(r"\s*[|-].*$", "", title).strip()
    if not _looks_relevant_name(title, term):
        return None
    image = _meta_content(html, "og:image") or _meta_content(html, "twitter:image")
    canonical = _meta_content(html, "og:url") or source_url
    return ProductLookupResultOut(
        source=str(profile.get("source") or "store_website"),
        barcode=term if re.fullmatch(r"[A-Za-z0-9_-]{5,40}", term) else None,
        name=title[:180],
        brand=None,
        image_url=image,
        categories=[str(profile.get("display") or "Store website")],
        quantity=None,
        store_name=str(profile.get("display") or "Store"),
        product_url=canonical,
        price=None,
        found=True,
    )


def _lookup_public_store_pages(*, profile: dict[str, Any], term: str, limit: int = 8) -> list[ProductLookupResultOut]:
    results: list[ProductLookupResultOut] = []
    seen: set[str] = set()
    encoded = quote_plus(term)
    for template in profile.get("search_urls") or []:
        url = str(template).format(term=encoded)
        try:
            response = requests.get(url, headers={**_headers(), "User-Agent": "Mozilla/5.0 (compatible; GroceryHouseManager/1.0; +https://grocery-house-manager.com)"}, timeout=16)
            response.raise_for_status()
            html = response.text
        except Exception:
            continue
        for payload in _extract_json_blobs(html):
            for node in _walk_json(payload):
                if not isinstance(node, dict):
                    continue
                if not (_first(node, "name", "productName", "title", "displayName") and (_first(node, "price", "currentPrice", "priceInfo", "imageUrl", "image", "thumbnailUrl", "url", "productUrl") or node.get("offers"))):
                    continue
                parsed = _generic_store_result_from_dict(node, profile=profile, term=term, source_url=url)
                if not parsed:
                    continue
                key = (parsed.name.lower(), parsed.barcode or "", parsed.product_url or "")
                if str(key) in seen:
                    continue
                seen.add(str(key))
                results.append(parsed)
                if len(results) >= limit:
                    return results
        if not results:
            meta_result = _meta_store_result(html, profile=profile, term=term, source_url=url)
            if meta_result:
                key = meta_result.name.lower()
                if key not in seen:
                    seen.add(key)
                    results.append(meta_result)
    return results[:limit]


def lookup_store_product(*, store_name: str | None, product_id: str | None = None, query: str | None = None, limit: int = 8) -> tuple[str | None, str | None, list[ProductLookupResultOut]]:
    """Best-effort public website product lookup for Canadian grocery stores.

    This is intentionally conservative: it only reads public store pages and parses structured
    data that the store page already returns. Some retailers block automated requests or render
    product cards in browser-only JavaScript, so callers should show a friendly fallback message.
    """
    key = normalize_store_lookup_key(store_name)
    if not key:
        return None, None, []
    profile = CANADIAN_STORE_LOOKUP_PROFILES[key]
    term = (product_id or query or "").strip()
    if not term:
        return key, str(profile["display"]), []
    if key == "walmart":
        # Keep the Walmart-specific parser first because it handles Walmart item numbers better.
        results = lookup_walmart_canada_product(product_id=product_id, query=query, limit=limit)
        if results:
            return key, str(profile["display"]), results
    results = _lookup_public_store_pages(profile=profile, term=term, limit=limit)
    return key, str(profile["display"]), results


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


def normalize_canadian_postal_code(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip().upper().replace("-", " ")
    compact = re.sub(r"[^A-Z0-9]", "", raw)
    if re.fullmatch(r"[A-Z]\d[A-Z]\d[A-Z]\d", compact):
        return f"{compact[:3]} {compact[3:]}"
    if re.fullmatch(r"[A-Z]\d[A-Z]", compact):
        return compact
    return None


def _normalize_retailers(retailers: list[str] | None) -> list[str]:
    if not retailers:
        return []
    normalized = []
    aliases = {
        "saveonfoods": "saveon",
        "saveon": "saveon",
        "save-on-foods": "saveon",
        "save on foods": "saveon",
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


def _confidence_explanation(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    low = raw.lower()
    numeric = _safe_float(raw)
    if numeric is not None:
        if numeric > 1:
            numeric = numeric / 100
        if numeric >= 0.8:
            return "High confidence: the store result closely matches your item name."
        if numeric >= 0.5:
            return "Medium confidence: review brand, size, and package before choosing it."
        return "Low confidence: this may be a similar item, not an exact match."
    if "high" in low or "exact" in low:
        return "High confidence: the result looks close to your grocery item."
    if "medium" in low or "moderate" in low:
        return "Medium confidence: review brand and size before using this price."
    if "low" in low or "weak" in low:
        return "Low confidence: check carefully before relying on this result."
    if "receipt" in low or "saved" in low:
        return "Saved household price: based on your own receipt or inventory history."
    return "Confidence shows how closely the returned product appears to match your requested item."


def normalize_price_row(row: dict[str, Any]) -> LivePriceResultOut:
    item = row.get("item") or row.get("query") or row.get("search_term") or row.get("input") or "Grocery item"
    retailer = row.get("retailer") or row.get("retailer_key") or row.get("source")
    banner = row.get("banner") or row.get("store_banner") or row.get("retailer_name")
    store_name = row.get("store_name") or row.get("store") or row.get("location_name")
    matched = row.get("matched_product") or row.get("matched_product_name") or row.get("product_name") or row.get("name") or row.get("title")
    store = row.get("store") if isinstance(row.get("store"), dict) else {}
    address = row.get("store_address") or row.get("address") or row.get("formatted_address") or row.get("location_address") or store.get("address")
    store_url = row.get("store_url") or row.get("maps_url") or row.get("location_url") or store.get("url")
    confidence = str(row.get("match_confidence") or row.get("confidence") or "") or None
    return LivePriceResultOut(
        item=str(item),
        retailer=str(retailer) if retailer else None,
        banner=str(banner) if banner else None,
        store_name=str(store_name) if store_name else None,
        store_address=str(address) if address else None,
        store_url=str(store_url) if store_url else None,
        matched_product_name=str(matched) if matched else None,
        brand=str(row.get("brand")) if row.get("brand") else None,
        price=_safe_float(row.get("price")),
        sale_price=_safe_float(row.get("sale_price") or row.get("salePrice")),
        unit_price=str(row.get("unit_price") or row.get("unitPrice") or row.get("normalized_unit_price") or "") or None,
        package_size=str(row.get("package_size") or row.get("size") or row.get("package") or "") or None,
        availability=str(row.get("availability") or row.get("stock_status") or "") or None,
        is_on_sale=bool(row.get("is_on_sale")) if row.get("is_on_sale") is not None else None,
        match_confidence=confidence,
        confidence_explanation=_confidence_explanation(confidence),
        source_url=str(row.get("source_url") or row.get("product_url") or row.get("url") or "") or None,
        scraped_at=_parse_datetime(row.get("scraped_at") or row.get("fetched_at") or row.get("updated_at")),
        raw_source=str(row.get("raw_source") or "apify_canada"),
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


def safe_market_error(exc: Exception) -> str:
    text = str(exc) or exc.__class__.__name__
    text = re.sub(r"token=[^&\s]+", "token=hidden", text, flags=re.I)
    text = re.sub(r"[A-Za-z0-9_\-]{28,}", "hidden", text)
    if "401" in text or "403" in text:
        return "The live-price connection is not authorized. Check the Apify API token."
    if "404" in text:
        return "The live-price service or actor was not found. Check the actor ID."
    if "timed out" in text.lower() or "timeout" in text.lower():
        return "The live-price service took too long to respond. Try fewer items or refresh again."
    if "402" in text or "payment" in text.lower() or "credit" in text.lower():
        return "The live-price provider may need credits or billing attention."
    return text[:220]


def compare_canadian_grocery_prices(
    db: Session,
    *,
    items: list[str],
    location: str | None,
    postal_code: str | None = None,
    retailers: list[str] | None = None,
    force_refresh: bool = False,
) -> tuple[bool, list[LivePriceResultOut]]:
    clean_items = [item.strip() for item in items if item and item.strip()]
    clean_items = clean_items[: max(1, settings.market_max_compare_items)]
    clean_retailers = _normalize_retailers(retailers)
    clean_postal = normalize_canadian_postal_code(postal_code or location)
    location_key = clean_postal or (location or "Canada").strip()
    if not clean_items:
        return False, []

    if not force_refresh:
        cached, rows = get_cached_price_rows(db, clean_items, location_key, clean_retailers)
        if cached:
            return True, rows

    if not settings.apify_api_token:
        return False, []

    actor_id = (settings.apify_canada_price_actor_id or "sunny_eternity/canada-grocery-price-comparison").replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    payload: dict[str, Any] = {
        "items": clean_items,
        "queries": clean_items,
        "mode": settings.apify_price_output_mode or "comparison",
        "output_mode": settings.apify_price_output_mode or "comparison",
    }
    if clean_postal:
        # The actor is most reliable with postal code. Send several common key styles
        # because actor input schemas sometimes use different casing.
        payload["postal_code"] = clean_postal
        payload["postalCode"] = clean_postal
        payload["location"] = clean_postal
    else:
        payload["location"] = location_key
        if location_key and location_key.lower() != "canada":
            payload["region"] = location_key
    if clean_retailers:
        payload["retailers"] = clean_retailers

    response = requests.post(
        url,
        params={"token": settings.apify_api_token, "timeout": max(20, settings.apify_price_timeout_seconds)},
        json=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=max(30, settings.apify_price_timeout_seconds + 15),
    )
    response.raise_for_status()
    raw_items = response.json()
    if isinstance(raw_items, dict):
        for key in ("items", "results", "comparison", "data"):
            if isinstance(raw_items.get(key), list):
                raw_items = raw_items[key]
                break
        else:
            raw_items = [raw_items]
    if not isinstance(raw_items, list):
        raw_items = []
    rows = _flatten_apify_items(raw_items)
    normalized = [normalize_price_row(row) for row in rows]

    key = _make_cache_key(clean_items, location_key, clean_retailers)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=max(1, settings.apify_price_cache_hours))
    existing = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key).first()
    if existing:
        existing.payload_json = json.dumps(raw_items, default=str)
        existing.query = ", ".join(clean_items)
        existing.location = location_key
        existing.retailers = ",".join(clean_retailers) if clean_retailers else None
        existing.fetched_at = now
        existing.expires_at = expires
    else:
        db.add(ExternalPriceCache(
            cache_key=key,
            source="apify_canada",
            query=", ".join(clean_items),
            location=location_key,
            retailers=",".join(clean_retailers) if clean_retailers else None,
            payload_json=json.dumps(raw_items, default=str),
            fetched_at=now,
            expires_at=expires,
        ))
    db.commit()
    return False, normalized
