from __future__ import annotations

import argparse
import json

from app.core.config import settings
from app.utils.market_data import lookup_store_product, store_lookup_search_status


def main() -> None:
    parser = argparse.ArgumentParser(description="Test official store product lookup from backend env/settings.")
    parser.add_argument("--store", default="Costco", help="Store name, e.g. Costco or Walmart")
    parser.add_argument("--item", default=None, help="Store item number / barcode / UPC")
    parser.add_argument("--query", default=None, help="Product search text")
    args = parser.parse_args()

    key, display, results, details = lookup_store_product(store_name=args.store, product_id=args.item, query=args.query, limit=5)
    payload = {
        "store_key": key,
        "store_name": display,
        "settings": {
            "STORE_LOOKUP_WEB_SEARCH_ENABLED": settings.store_lookup_web_search_enabled,
            "GOOGLE_SEARCH_API_KEY_SET": bool(settings.google_search_api_key),
            "GOOGLE_SEARCH_CX_SET": bool(settings.google_search_cx),
        },
        "status": store_lookup_search_status(),
        "details": details,
        "results": [r.model_dump(mode="json") for r in results],
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
