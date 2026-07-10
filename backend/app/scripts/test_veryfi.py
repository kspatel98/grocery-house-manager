from pathlib import Path
import sys
from app.utils.receipt_ocr import veryfi_is_configured, veryfi_receipt_scan


def main() -> int:
    if not veryfi_is_configured():
        print("Veryfi is not configured. Set RECEIPT_OCR_PROVIDER=veryfi, VERYFI_CLIENT_ID, VERYFI_USERNAME, and VERYFI_API_KEY.")
        return 2
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.test_veryfi /path/to/receipt.jpg")
        return 2
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        return 2
    result = veryfi_receipt_scan(path, path.name)
    print(f"Provider: {result.get('provider')}")
    print(f"Status: {result.get('status')}")
    print(f"Store: {result.get('store_name')}")
    print(f"Date: {result.get('receipt_date')}")
    print(f"Subtotal: {result.get('subtotal_amount')}")
    print(f"Tax: {result.get('tax_amount')}")
    print(f"Discount: {result.get('discount_amount')}")
    print(f"Total: {result.get('total_amount')}")
    print(f"Line items: {len(result.get('line_items') or [])}")
    for item in (result.get('line_items') or [])[:10]:
        print(f"- {item.get('description')} | qty={item.get('quantity')} unit={item.get('unit_price')} total={item.get('line_total')} discount={item.get('discount_amount')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
