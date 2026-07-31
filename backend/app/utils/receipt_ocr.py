from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any
import json
import logging
import re
import time

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

PRICE_PATTERN = re.compile(r"(?P<name>[A-Za-z][A-Za-z0-9 '&.,/#-]{2,}?)\s+\$?(?P<price>\d{1,4}[.,]\d{2})\s*$")
SUPPORTED_RECEIPT_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
SUPPORTED_RECEIPT_IMAGE_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}


def _provider() -> str:
    return (settings.receipt_ocr_provider or "local").strip().lower()


def tabscanner_is_configured() -> bool:
    return bool(_provider() == "tabscanner" and settings.tabscanner_api_key)


def veryfi_is_configured() -> bool:
    return bool(
        _provider() == "veryfi"
        and settings.veryfi_client_id
        and settings.veryfi_username
        and settings.veryfi_api_key
    )


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _as_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _string(value: Any) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _vendor_name(payload: dict[str, Any]) -> str | None:
    vendor = payload.get("vendor")
    if isinstance(vendor, dict):
        for key in ("name", "raw_name", "vendor_name"):
            if vendor.get(key):
                return _string(vendor.get(key))
    for key in ("vendor_name", "merchant_name", "supplier_name", "store_name", "establishment"):
        if payload.get(key):
            return _string(payload.get(key))
    return None


def _payment_method(payload: dict[str, Any]) -> str | None:
    payments = payload.get("payment") or payload.get("payments")
    if isinstance(payments, list) and payments:
        payment = payments[0]
        if isinstance(payment, dict):
            return _string(payment.get("type") or payment.get("card_type") or payment.get("display_name"))
    if isinstance(payments, dict):
        return _string(payments.get("type") or payments.get("card_type") or payments.get("display_name"))
    return _string(payload.get("payment_method") or payload.get("paymentMethod"))


def _line_type(line: dict[str, Any]) -> str:
    value = str(line.get("type") or line.get("line_type") or line.get("lineType") or "product").lower().strip()
    if any(token in value for token in ["discount", "coupon", "promo"]):
        return "discount"
    if "tax" in value:
        return "tax"
    if "payment" in value or "cash" in value or "change" in value:
        return "payment"
    if "refund" in value:
        return "refund"
    if "subtotal" in value or "total" in value or "servicecharge" in value or "tip" in value:
        return "summary"
    return "product"


UNIT_ALIASES = {
    "kgs": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "grams": "g",
    "gram": "g",
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    "litre": "l",
    "liter": "l",
    "litres": "l",
    "liters": "l",
    "each": "each",
    "ea": "each",
    "pc": "pcs",
    "piece": "pcs",
    "pieces": "pcs",
}


def _normalize_unit(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip().lower().replace(".", "")
    if not raw:
        return None
    return UNIT_ALIASES.get(raw, raw[:32])


def _receipt_description_name(description: str) -> str:
    text = " ".join((description or "").replace("$", " ").split()).strip(" -:.;")
    # Walmart grocery receipts often include codes before the actual name, e.g.
    # "OP # 009062 TE # CHEESE # 009C". Extract the readable name where possible.
    coded_match = re.search(r"TE\s*#\s*(?P<name>[A-Z][A-Z0-9 '&/-]{2,}?)(?:\s*#|$)", text, re.I)
    if coded_match:
        return coded_match.group("name").strip(" -:#")[:220]
    # Remove scale/weight details from the display name. The quantity/unit/price
    # are stored separately so Bananas can be saved as $1.50/kg instead of $1.75.
    text = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|lb|lbs|l|ml)\s*@\s*\$?\s*\d+(?:[.,]\d+)?(?:\s*/\s*(?:kg|g|lb|l|ml|ea|each))?", "", text, flags=re.I)
    text = re.sub(r"\s{2,}", " ", text).strip(" -:.;")
    return text[:220] or (description or "Receipt item")[:220]


def _parse_line_measurement(description: str) -> dict[str, Any]:
    text = " ".join((description or "").replace(",", ".").split())
    # Examples: "BANANAS 1.165 kg @ $1.50 /kg", "1.165 kg @ $ 1.50 /"
    match = re.search(
        r"(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>kg|kgs|g|lb|lbs|l|ml|ea|each|pc|pcs)\s*@\s*\$?\s*(?P<unit_price>\d+(?:\.\d+)?)(?:\s*/\s*(?P<price_unit>kg|kgs|g|lb|lbs|l|ml|ea|each|pc|pcs))?",
        text,
        flags=re.I,
    )
    if match:
        unit = _normalize_unit(match.group("price_unit") or match.group("unit"))
        return {
            "quantity": _as_float(match.group("qty")),
            "line_unit": unit,
            "unit_price": _as_float(match.group("unit_price")),
        }
    # Examples: "2 @ 3.99" with no unit. Treat as pieces.
    match = re.search(r"(?P<qty>\d+(?:\.\d+)?)\s*@\s*\$?\s*(?P<unit_price>\d+(?:\.\d+)?)", text, flags=re.I)
    if match:
        return {"quantity": _as_float(match.group("qty")), "line_unit": "pcs", "unit_price": _as_float(match.group("unit_price"))}
    return {"quantity": None, "line_unit": None, "unit_price": None}


def _normalize_line(line: dict[str, Any], index: int) -> dict[str, Any]:
    raw_description = _string(
        line.get("description")
        or line.get("descClean")
        or line.get("desc")
        or line.get("text")
        or line.get("name")
        or line.get("item")
        or line.get("raw_text")
        or f"Receipt item {index + 1}"
    ) or f"Receipt item {index + 1}"
    measurement = _parse_line_measurement(raw_description)
    description = _receipt_description_name(raw_description)
    quantity = _as_float(line.get("quantity") or line.get("qty") or line.get("itemQty") or line.get("itemQuantity"))
    line_unit = _normalize_unit(line.get("unit") or line.get("measure") or line.get("uom") or line.get("quantity_unit") or line.get("unitOfMeasure"))
    unit_price = _as_float(line.get("unit_price") or line.get("unitPrice") or line.get("price_per_unit") or line.get("pricePerUnit"))
    total = _as_float(line.get("total") or line.get("line_total") or line.get("lineTotal") or line.get("subtotal"))
    discount = _as_float(line.get("discount") or line.get("discount_amount") or line.get("discountAmount"))
    tax = _as_float(line.get("tax") or line.get("tax_amount") or line.get("taxAmount"))
    confidence = _as_float(line.get("confidence") or line.get("ocr_confidence") or line.get("score"))

    if quantity is None or quantity <= 0:
        quantity = measurement.get("quantity")
    if line_unit is None:
        line_unit = measurement.get("line_unit")
    if unit_price is None or unit_price <= 0:
        unit_price = measurement.get("unit_price")

    line_type = _line_type(line)
    if line_type == "product" and (quantity is None or quantity <= 0):
        quantity = 1.0
    if line_type == "product" and line_unit is None:
        line_unit = "pcs"
    if total is None and unit_price is not None:
        total = round(unit_price * (quantity or 1), 2)
    if unit_price is None and total is not None and quantity and quantity > 0:
        # If a receipt only gives a line total, calculate the best unit price we can.
        # For scale items like bananas, parsed quantity makes this become $/kg.
        unit_price = round(max((float(total) - float(discount or 0)) / float(quantity), 0), 2)

    return {
        "line_type": line_type,
        "description": description,
        "normalized_name": description[:220],
        "sku": _string(line.get("sku") or line.get("item_id") or line.get("productCode")),
        "upc": _string(line.get("upc") or line.get("barcode")),
        "quantity": quantity,
        "line_unit": line_unit,
        "unit_price": unit_price,
        "discount_amount": discount,
        "tax_amount": tax,
        "line_total": total,
        "confidence": confidence,
        "needs_review": (confidence is None or confidence < 0.85 or total is None or line_type != "product"),
        "sort_order": index,
    }


def _fallback_lines(text: str) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for index, raw in enumerate((text or "").splitlines()):
        line = " ".join(raw.strip().split())
        if not line or len(line) < 5:
            continue
        match = PRICE_PATTERN.search(line)
        if not match:
            continue
        name = match.group("name").strip(" -:.")
        price = _as_float(match.group("price"))
        if price is None:
            continue
        lines.append({
            "line_type": "product",
            "description": name,
            "normalized_name": name[:220],
            "sku": None,
            "upc": None,
            "quantity": 1,
            "line_unit": "pcs",
            "unit_price": price,
            "discount_amount": None,
            "tax_amount": None,
            "line_total": price,
            "confidence": 0.45,
            "needs_review": True,
            "sort_order": index,
        })
    return lines[:80]


def extract_local_text(path: Path) -> str:
    if path.suffix.lower() not in SUPPORTED_RECEIPT_IMAGE_SUFFIXES:
        return ""
    try:
        from PIL import Image
        import pytesseract
        return pytesseract.image_to_string(Image.open(path)) or ""
    except Exception:
        return ""


def local_receipt_scan(path: Path, manual_text: str | None = None) -> dict[str, Any]:
    text = (manual_text or "").strip() or extract_local_text(path).strip()
    return {
        "provider": "local",
        "status": "needs_manual_review",
        "store_name": None,
        "receipt_date": None,
        "currency": "CAD",
        "subtotal_amount": None,
        "tax_amount": None,
        "discount_amount": None,
        "total_amount": None,
        "receipt_number": None,
        "payment_method": None,
        "confidence": 0.35 if text else None,
        "raw_text": text,
        "raw_json": None,
        "line_items": _fallback_lines(text),
        "message": "Receipt uploaded. Smart receipt scanning is not configured yet, so we used a basic local scan. Review carefully before saving.",
    }


def _tabscanner_receipt_number(payload: dict[str, Any]) -> str | None:
    custom_fields = payload.get("customFields")
    custom_receipt_number = None
    if isinstance(custom_fields, dict):
        custom_receipt_number = (
            custom_fields.get("ReceiptNumber")
            or custom_fields.get("Receipt Number")
            or custom_fields.get("receipt_number")
        )
    return _string(
        payload.get("receiptNumber")
        or payload.get("ReceiptNumber")
        or payload.get("documentNumber")
        or custom_receipt_number
    )


def _tabscanner_headers() -> dict[str, str]:
    return {"apikey": settings.tabscanner_api_key or "", "Accept": "application/json"}


def _tabscanner_process(path: Path, filename: str) -> str:
    with path.open("rb") as fh:
        files = {"file": (filename, fh, "image/png" if path.suffix.lower() == ".png" else "image/jpeg")}
        data = {
            "documentType": settings.tabscanner_document_type or "receipt",
            "region": settings.tabscanner_region or "ca",
            "defaultDateParsing": settings.tabscanner_default_date_parsing or "m/d",
        }
        response = requests.post(
            settings.tabscanner_process_url,
            headers=_tabscanner_headers(),
            files=files,
            data=data,
            timeout=settings.tabscanner_timeout_seconds,
        )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("token") or payload.get("duplicateToken")
    if not token:
        raise RuntimeError(f"Tabscanner did not return a result token: {payload}")
    return str(token)


def _tabscanner_result(token: str) -> dict[str, Any]:
    deadline = time.time() + max(settings.tabscanner_total_timeout_seconds, 15)
    wait_seconds = max(settings.tabscanner_poll_interval_seconds, 1)
    last_payload: dict[str, Any] = {}
    while time.time() < deadline:
        response = requests.get(
            f"{settings.tabscanner_result_url.rstrip('/')}/{token}",
            headers=_tabscanner_headers(),
            timeout=settings.tabscanner_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        last_payload = payload if isinstance(payload, dict) else {}
        status = str(last_payload.get("status") or "").lower()
        code = int(last_payload.get("code") or last_payload.get("status_code") or 0)
        if status == "done" or code == 202 or last_payload.get("result"):
            result = last_payload.get("result")
            return result if isinstance(result, dict) else last_payload
        if status == "failed":
            raise RuntimeError(f"Tabscanner processing failed: {last_payload}")
        time.sleep(wait_seconds)
    raise TimeoutError(f"Tabscanner result was not ready before timeout. Last response: {last_payload}")


def tabscanner_receipt_scan(path: Path, filename: str, manual_text: str | None = None) -> dict[str, Any]:
    if not tabscanner_is_configured():
        return local_receipt_scan(path, manual_text)
    if path.suffix.lower() not in SUPPORTED_RECEIPT_IMAGE_SUFFIXES:
        fallback = local_receipt_scan(path, manual_text)
        fallback["status"] = "unsupported_file"
        fallback["message"] = "Please upload a JPG or PNG receipt image for smart receipt scanning."
        return fallback
    try:
        token = _tabscanner_process(path, filename)
        payload = _tabscanner_result(token)
    except Exception as error:
        logger.exception("Tabscanner receipt scan failed: %s", error)
        fallback = local_receipt_scan(path, manual_text)
        fallback["status"] = "scan_failed"
        fallback["message"] = "Receipt uploaded, but the smart scanner could not process it right now. You can still review/edit items manually."
        return fallback

    line_items = payload.get("lineItems") if isinstance(payload.get("lineItems"), list) else []
    normalized_lines = [_normalize_line(line, index) for index, line in enumerate(line_items) if isinstance(line, dict)]
    total_confidence = _as_float(payload.get("totalConfidence"))
    subtotal_confidence = _as_float(payload.get("subTotalConfidence"))
    establishment_confidence = _as_float(payload.get("establishmentConfidence"))
    confidence_values = [value for value in [total_confidence, subtotal_confidence, establishment_confidence] if value is not None]
    confidence = round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else None
    status = "review_ready" if normalized_lines else "needs_manual_review"
    raw_text = _string(payload.get("text") or payload.get("ocrText") or payload.get("rawText"))
    return {
        "provider": "tabscanner",
        "status": status,
        "store_name": _vendor_name(payload),
        "receipt_date": _as_date(payload.get("dateISO") or payload.get("date")),
        "currency": _string(payload.get("currency") or "CAD"),
        "subtotal_amount": _as_float(payload.get("subTotal") or payload.get("subtotal")),
        "tax_amount": _as_float(payload.get("tax")),
        "discount_amount": _as_float(payload.get("discount")),
        "total_amount": _as_float(payload.get("total")),
        "receipt_number": _tabscanner_receipt_number(payload),
        "payment_method": _payment_method(payload),
        "confidence": confidence,
        "raw_text": raw_text,
        "raw_json": json.dumps(payload, default=str)[:250000],
        "line_items": normalized_lines[:150],
        "message": "Receipt scanned. Review the store, item rows, prices, discounts, taxes, and total before saving to price history.",
    }


def veryfi_receipt_scan(path: Path, filename: str, manual_text: str | None = None) -> dict[str, Any]:
    if not veryfi_is_configured():
        return local_receipt_scan(path, manual_text)
    headers = {
        "CLIENT-ID": settings.veryfi_client_id or "",
        "AUTHORIZATION": f"apikey {settings.veryfi_username}:{settings.veryfi_api_key}",
        "Accept": "application/json",
    }
    try:
        with path.open("rb") as fh:
            files = {"file": (filename, fh)}
            data = {"file_name": filename}
            response = requests.post(
                settings.veryfi_api_url,
                headers=headers,
                files=files,
                data=data,
                timeout=settings.veryfi_timeout_seconds,
            )
        response.raise_for_status()
        payload = response.json()
    except Exception as error:
        logger.exception("Veryfi receipt scan failed: %s", error)
        fallback = local_receipt_scan(path, manual_text)
        fallback["status"] = "scan_failed"
        fallback["message"] = "Receipt uploaded, but the smart scanner could not process it right now. You can still review/edit items manually."
        return fallback

    raw_text = _string(payload.get("ocr_text") or payload.get("img_text") or payload.get("text"))
    line_items = payload.get("line_items") if isinstance(payload.get("line_items"), list) else []
    normalized_lines = [_normalize_line(line, index) for index, line in enumerate(line_items) if isinstance(line, dict)]
    confidence = _as_float(payload.get("confidence") or payload.get("ocr_confidence") or payload.get("average_ocr_score"))
    status = "review_ready" if normalized_lines else "needs_manual_review"
    return {
        "provider": "veryfi",
        "status": status,
        "store_name": _vendor_name(payload),
        "receipt_date": _as_date(payload.get("date") or payload.get("transaction_date") or payload.get("invoice_date")),
        "currency": _string(payload.get("currency_code") or payload.get("currency") or "CAD"),
        "subtotal_amount": _as_float(payload.get("subtotal")),
        "tax_amount": _as_float(payload.get("tax") or payload.get("tax_amount")),
        "discount_amount": _as_float(payload.get("discount") or payload.get("discount_amount")),
        "total_amount": _as_float(payload.get("total")),
        "receipt_number": _string(payload.get("invoice_number") or payload.get("document_reference_number") or payload.get("receipt_number")),
        "payment_method": _payment_method(payload),
        "confidence": confidence,
        "raw_text": raw_text,
        "raw_json": json.dumps(payload, default=str)[:250000],
        "line_items": normalized_lines[:150],
        "message": "Receipt scanned. Review the store, totals, discounts, and item rows before saving to price history.",
    }


def scan_receipt(path: Path, filename: str, manual_text: str | None = None) -> dict[str, Any]:
    provider = _provider()
    if provider == "tabscanner":
        return tabscanner_receipt_scan(path, filename, manual_text)
    if provider == "veryfi":
        return veryfi_receipt_scan(path, filename, manual_text)
    return local_receipt_scan(path, manual_text)
