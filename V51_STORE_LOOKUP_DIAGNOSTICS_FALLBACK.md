# V51 Store Lookup Diagnostics + Fallback

This version fixes store-specific product lookup visibility and makes the Google search flow more tolerant.

## What changed

- Google Programmable Search now tries multiple request shapes:
  - `site:store.ca "item"` inside the query
  - `siteSearch=store.ca`
  - broader query with the store domain
- Google searches no longer use a strict Canada-only country restriction that could remove valid `.ca` product pages.
- Search diagnostics are visible directly on the Product Lookup card instead of being hidden inside a collapsed detail panel.
- When product details cannot be read automatically, the app shows an official store search link instead of showing an empty result area.
- Fallback/search-link results cannot be added to inventory until the user confirms product details.
- Added backend test command:

```bash
docker compose exec backend python -m app.scripts.test_store_lookup --store Costco --item 1953954
```

## Required production values

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_CX=your_search_engine_id
```

The Google Programmable Search Engine must be able to search the target store domains such as `costco.ca` and `walmart.ca`. If the Search Engine ID is restricted only to your own website, Google will return zero store results even when the API key is correct.

## Test example

Product Lookup page:

- Store name: `Costco`
- Barcode or store item number: `1953954`
- Product name: leave blank

Expected: official Costco result if Google CSE can search `costco.ca`; otherwise an official Costco search link plus clear diagnostics.
