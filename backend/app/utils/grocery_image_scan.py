"""One-image grocery recognition. Preview only: never writes inventory or shopping data."""
from __future__ import annotations

from io import BytesIO
import re

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.utils.digitalocean_ai import DigitalOceanAIError, image_data_uri, vision_configured, _json_from_text

MAX_SCAN_BYTES = 8 * 1024 * 1024
MAX_SCAN_ROWS = 60
SUPPORTED_IMAGES = {"image/jpeg", "image/png", "image/webp"}


def prepare_image(data: bytes, mime: str) -> bytes:
    if mime not in SUPPORTED_IMAGES:
        raise ValueError("Upload a JPG, PNG or WebP image.")
    if not data or len(data) > MAX_SCAN_BYTES:
        raise ValueError("Choose an image smaller than 8 MB.")
    try:
        with Image.open(BytesIO(data)) as original:
            if (original.format or "").upper() not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Unsupported image encoding. Use JPG, PNG or WebP.")
            if original.width * original.height > 25_000_000:
                raise ValueError("This photo is too large. Resize it before scanning.")
            original.verify()
        with Image.open(BytesIO(data)) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2000, 2000))
            buffer = BytesIO()
            image.save(buffer, format="JPEG", quality=85, optimize=True)
            return buffer.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("This image cannot be read. Try taking a clearer photo.") from exc


def normalize_recognized_rows(raw: dict, mode: str) -> dict:
    rows = raw.get("items") or []
    if not isinstance(rows, list):
        rows = []
    normalized = []
    allowed_categories = {"Fruits", "Vegetables", "Dairy", "Pantry", "Bakery", "Beverages", "Household", "Frozen", "Snacks", "Other"}
    warnings = raw.get("warnings") if isinstance(raw.get("warnings"), list) else []
    valid_units = {"pcs", "kg", "g", "L", "mL", "pack", "box", "bag", "bottle", "can", "loaf"}
    for item in rows[:MAX_SCAN_ROWS]:
        if not isinstance(item, dict):
            continue
        name = re.sub(r"\s+", " ", str(item.get("name") or "")).strip()[:180]
        if not name or name.lower() in {"unknown", "unreadable", "unclear", "?"}:
            continue
        try:
            confidence = max(0.0, min(1.0, float(item.get("confidence", 0))))
        except (ValueError, TypeError):
            confidence = 0
        try:
            count = float(item.get("quantity"))
            if not (0 < count <= 10000):
                raise ValueError
        except (TypeError, ValueError):
            count = 1.0
            quantity_missing = True
        else:
            quantity_missing = item.get("quantity") is None
        unit = str(item.get("unit") or "pcs").strip()
        if unit not in valid_units:
            unit = "pcs"
            quantity_missing = True
        requires_review = bool(item.get("needs_review")) or confidence < 0.8 or quantity_missing
        category = str(item.get("category") or "Other").strip().title()
        if category not in allowed_categories:
            category = "Other"
        normalized.append({
            "name": name, "category": category, "quantity": count, "unit": unit,
            "confidence": round(confidence, 2), "needs_review": requires_review,
            "notes": str(item.get("notes") or "")[:250],
        })
    return {
        "mode": mode, "items": normalized,
        "warnings": [str(v)[:200] for v in warnings[:8]],
        "message": "Review each name and quantity before saving. Nothing has been added yet.",
    }


def recognize_grocery_image(prepared_jpeg: bytes, mode: str) -> dict:
    if not vision_configured():
        raise DigitalOceanAIError("Grocery photo recognition is not configured. Set up the DigitalOcean vision provider first.")
    if mode not in {"products", "written_list"}:
        raise ValueError("Choose Products or Written List before scanning.")
    if mode == "products":
        mode_prompt = (
            "This is a PHOTO OF PHYSICAL PRODUCTS. Identify only groceries visible in the image, "
            "not suggested groceries or inferred unseen items. If multiple identical physical packages "
            "are clearly visible, count them accurately. If a package shows 2 L, this describes the "
            "package size; don't multiply it by package count without justification. Prefer a simple "
            "quantity expressed in pcs for countable containers and produce, or kg/L when clear. "
            "Do not claim exact brand, size or number if unreadable."
        )
    else:
        mode_prompt = (
            "This is a PHOTO OR SCREENSHOT OF A PRINTED OR HANDWRITTEN GROCERY LIST. "
            "Transcribe grocery entries in any language, preserving the language of each item. "
            "Parse quantity and units only when written clearly. Skip non-grocery instructions, "
            "prices, people, dates, ticks and headings. Never add items not on the list. "
            "Indicate uncertainty for ambiguous handwriting."
        )
    prompt = f"""You are GHM Smart Grocery Scan. {mode_prompt}
Return ONLY valid JSON with the following shape:
{{"items":[{{"name":"product name","quantity":1,"unit":"pcs","category":"Pantry","confidence":0.9,"needs_review":false,"notes":""}}],"warnings":[]}}
Rules:
- Maximum {MAX_SCAN_ROWS} distinct rows. No invented products.
- Use only these units: pcs, kg, g, L, mL, pack, box, bag, bottle, can, loaf.
- category must be one of Fruits, Vegetables, Dairy, Pantry, Bakery, Beverages, Household, Frozen, Snacks, Other.
- If quantity is absent or uncertain, set quantity to 1 and needs_review=true. If unit is uncertain use pcs and flag review.
- Do not convert 2 bottles of 1 L into 2 L if two bottles is a better representation.
- If handwriting is illegible, omit unknown words and explain briefly in warnings.
- If the image is not a grocery list (written_list mode) or does not show identifiable groceries (products mode), return an empty items array with a warning.
- Confidence reflects visual certainty, not user preference.
- Do not treat individual ingredients depicted on product labels as separate products.
"""
    payload = {
        "model": settings.digitalocean_vision_model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_data_uri(prepared_jpeg, "scan.jpg", "image/jpeg")}},
        ]}],
        "temperature": 0.0, "max_tokens": 3000,
    }
    try:
        response = requests.post(
            settings.digitalocean_inference_base_url.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {settings.digitalocean_inference_key}", "Content-Type": "application/json"},
            json=payload, timeout=settings.digitalocean_vision_timeout_seconds,
        )
        response.raise_for_status()
        result = response.json()["choices"][0]["message"]["content"]
        parsed = _json_from_text(result)
        if not isinstance(parsed, dict):
            raise ValueError("Expected an object")
        return normalize_recognized_rows(parsed, mode)
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
        raise DigitalOceanAIError("The image could not be recognized. Please try another photo.") from exc
