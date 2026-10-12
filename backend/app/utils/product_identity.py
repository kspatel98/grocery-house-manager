from __future__ import annotations

import html
import re
from difflib import SequenceMatcher
from typing import Iterable

from app.core.config import settings
from app.schemas import ProductLookupResultOut
from app.utils.market_data import _search_with_serper_api

_UNIT_MAP = {
    "litre": "l", "litres": "l", "liter": "l", "liters": "l", "l": "l",
    "millilitre": "ml", "millilitres": "ml", "milliliter": "ml", "milliliters": "ml", "ml": "ml",
    "kilogram": "kg", "kilograms": "kg", "kg": "kg",
    "gram": "g", "grams": "g", "g": "g",
    "ounce": "oz", "ounces": "oz", "oz": "oz",
    "pound": "lb", "pounds": "lb", "lb": "lb", "lbs": "lb",
}
_STOP_WORDS = {"canada", "grocery", "groceries", "product", "products", "food", "foods", "barcode", "upc", "gtin", "buy", "online"}
_SIZE_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|g|grams?|kg|kilograms?|oz|ounces?|lb|lbs|pounds?)\b", re.I)
_PACK_RE = re.compile(r"\b(\d+)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz|lb)\b", re.I)


def normalize_barcode(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def normalize_text(value: str | None) -> str:
    clean = html.unescape(value or "").casefold().replace("&", " and ")
    clean = re.sub(r"[^a-z0-9%]+", " ", clean)
    tokens = [token for token in clean.split() if token and token not in _STOP_WORDS]
    return " ".join(tokens)


def normalize_quantity(value: str | None) -> str | None:
    if not value:
        return None
    raw = html.unescape(value).casefold().replace("×", "x")
    pack = _PACK_RE.search(raw)
    if pack:
        count, number, unit = pack.groups()
        number = number.replace(",", ".")
        if "." in number:
            number = number.rstrip("0").rstrip(".")
        return f"{int(count)}x{number}{_UNIT_MAP.get(unit, unit)}"
    match = _SIZE_RE.search(raw)
    if not match:
        return None
    number, unit = match.groups()
    number = number.replace(",", ".")
    number = number.rstrip("0").rstrip(".") if "." in number else number
    return f"{number}{_UNIT_MAP.get(unit.casefold(), unit.casefold())}"


def _quantity_from_text(value: str | None) -> str | None:
    return normalize_quantity(value)


def _identity_key(item: ProductLookupResultOut) -> str:
    barcode = normalize_barcode(item.barcode)
    if barcode:
        return f"barcode:{barcode}"
    return "text:" + "|".join(filter(None, [normalize_text(item.brand), normalize_text(item.name), normalize_quantity(item.quantity)]))


def _similar(a: ProductLookupResultOut, b: ProductLookupResultOut) -> bool:
    a_code, b_code = normalize_barcode(a.barcode), normalize_barcode(b.barcode)
    if a_code and b_code and a_code == b_code:
        return True
    a_name = " ".join(filter(None, [normalize_text(a.brand), normalize_text(a.name)]))
    b_name = " ".join(filter(None, [normalize_text(b.brand), normalize_text(b.name)]))
    if not a_name or not b_name:
        return False
    score = SequenceMatcher(None, a_name, b_name).ratio()
    a_qty, b_qty = normalize_quantity(a.quantity), normalize_quantity(b.quantity)
    return score >= 0.82 and (not a_qty or not b_qty or a_qty == b_qty)


def _base_score(item: ProductLookupResultOut, *, barcode: str | None, query: str | None) -> int:
    score = 0
    requested_code = normalize_barcode(barcode)
    item_code = normalize_barcode(item.barcode)
    if requested_code and item_code == requested_code:
        score += 35
    if item.name and len(normalize_text(item.name)) >= 3:
        score += 20
    if item.brand and len(normalize_text(item.brand)) >= 2:
        score += 14
    if normalize_quantity(item.quantity) or _quantity_from_text(item.name):
        score += 14
    if item.image_url:
        score += 4
    if item.categories:
        score += 4
    if query:
        q_tokens = set(normalize_text(query).split())
        candidate_tokens = set(normalize_text(" ".join(filter(None, [item.brand, item.name, item.quantity]))).split())
        if q_tokens:
            score += round(9 * len(q_tokens & candidate_tokens) / len(q_tokens))
    # A single external source should be "high confidence" at most; corroboration
    # is what promotes the identity to Verified.
    return min(score, 88)


def _label(score: int) -> str:
    if score >= 90:
        return "Verified"
    if score >= 75:
        return "High confidence"
    if score >= 60:
        return "Possible"
    return "Unconfirmed"


def rank_and_merge_identity_results(
    rows: Iterable[ProductLookupResultOut], *, barcode: str | None = None, query: str | None = None, limit: int = 8
) -> list[ProductLookupResultOut]:
    candidates = list(rows)
    if not candidates:
        return []

    groups: list[list[ProductLookupResultOut]] = []
    for item in candidates:
        for group in groups:
            if _similar(item, group[0]):
                group.append(item)
                break
        else:
            groups.append([item])

    ranked: list[ProductLookupResultOut] = []
    for group in groups:
        def richness(item: ProductLookupResultOut) -> tuple[int, int]:
            fields = [item.brand, item.quantity, item.image_url, item.product_url]
            return (sum(bool(value) for value in fields) + len(item.categories or []), _base_score(item, barcode=barcode, query=query))

        best = max(group, key=richness)
        sources = sorted({item.source for item in group if item.source})
        score = max(_base_score(item, barcode=barcode, query=query) for item in group)
        if len(sources) >= 2:
            score = min(100, score + 12)
        if len(sources) >= 3:
            score = min(100, score + 5)

        quantity = best.quantity or _quantity_from_text(best.name)
        update = best.model_dump()
        update.update({
            "normalized_name": " ".join(filter(None, [normalize_text(best.brand), normalize_text(best.name)])) or normalize_text(best.name),
            "normalized_quantity": normalize_quantity(quantity),
            "identity_confidence": score,
            "identity_label": _label(score),
            "evidence_sources": sources,
            "quantity": quantity,
        })
        ranked.append(ProductLookupResultOut(**update))

    ranked.sort(key=lambda item: (item.identity_confidence or 0, bool(item.brand), bool(item.quantity)), reverse=True)
    return ranked[: max(1, limit)]


def lookup_serper_product_identity(barcode: str, *, limit: int = 5) -> list[ProductLookupResultOut]:
    code = normalize_barcode(barcode)
    if not code or not settings.serper_api_key:
        return []
    try:
        hits = _search_with_serper_api(f'"{code}" product Canada', min(max(limit, 1), 8))
    except Exception:
        return []

    results: list[ProductLookupResultOut] = []
    for hit in hits:
        title = html.unescape(str(hit.get("title") or "")).strip()
        snippet = html.unescape(str(hit.get("snippet") or "")).strip()
        if not title:
            continue
        # Remove common search-result suffixes while preserving the actual product title.
        name = re.split(r"\s+[|–—-]\s+(?:Walmart|Costco|Loblaws|No Frills|Metro|FreshCo|Food Basics|Amazon|Instacart)\b", title, maxsplit=1, flags=re.I)[0].strip()
        if not name:
            continue
        quantity = _quantity_from_text(f"{title} {snippet}")
        visible_digits = re.sub(r"\D", "", f"{title} {snippet}")
        results.append(ProductLookupResultOut(
            source="serper_identity",
            barcode=code if code in visible_digits else None,
            name=name[:220],
            image_url=str(hit.get("image_url") or "").strip() or None,
            quantity=quantity,
            product_url=str(hit.get("url") or "").strip() or None,
            store_name=None,
            lookup_note="Indexed web evidence used only as a fallback identity candidate. Confirm the package before saving.",
            found=True,
        ))
    return results[:limit]
