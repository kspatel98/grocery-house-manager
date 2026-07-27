from __future__ import annotations

import sys
from pathlib import Path

from app.utils.receipt_ocr import scan_receipt, SUPPORTED_RECEIPT_IMAGE_SUFFIXES


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.test_tabscanner /path/to/receipt.jpg")
        return 2
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        return 2
    if path.suffix.lower() not in SUPPORTED_RECEIPT_IMAGE_SUFFIXES:
        print("Unsupported file. Upload JPG, JPEG, or PNG only.")
        return 2
    result = scan_receipt(path, path.name)
    print("Provider:", result.get("provider"))
    print("Status:", result.get("status"))
    print("Store:", result.get("store_name"))
    print("Date:", result.get("receipt_date"))
    print("Subtotal:", result.get("subtotal_amount"))
    print("Tax:", result.get("tax_amount"))
    print("Discount:", result.get("discount_amount"))
    print("Total:", result.get("total_amount"))
    print("Line items:", len(result.get("line_items") or []))
    print("Message:", result.get("message"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
