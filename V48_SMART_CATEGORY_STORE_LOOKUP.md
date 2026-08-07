# v48 — Smart Category + Store Website Product Lookup

## What changed

- Inventory product creation now auto-selects the best category while the user types the product name.
- Product lookup add-to-inventory now uses smarter category, icon, and unit suggestions based on product name and returned category hints.
- Products created from shopping lists also use the same smarter category/icon/unit logic.
- Receipt-created products continue to use backend smart category selection, now with broader grocery categories.
- Store-specific product lookup now supports best-effort public website lookup for common Canadian grocery stores:
  - Walmart
  - No Frills
  - Real Canadian Superstore
  - Loblaws
  - Save-On-Foods
  - Metro
  - Food Basics
  - FreshCo
  - Costco Canada
- Walmart item/product numbers still use the Walmart-specific parser first, then fallback to the generic website parser.

## Important note

Store website lookup reads public store pages and extracts structured product data when the retailer returns it. Some retailers block automated requests or render product cards only after browser JavaScript loads, so the app shows a friendly message if a store lookup cannot return products.

## Checks

- Backend Python compile check passed.
- Frontend full production build was not completed in the sandbox because npm package downloads were unavailable from the sandbox registry.
