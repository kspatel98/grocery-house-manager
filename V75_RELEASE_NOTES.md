# Grocery House Manager v75 — Weekly Flyer Intelligence

## New
- Postal-code-aware Canadian weekly flyer search in the Prices/Market area.
- Structured flyer deals with merchant, item, price, validity dates, images, and price-change badges where available.
- PostgreSQL-backed flyer cache using the existing `external_price_cache` table to avoid duplicate provider calls for the same area/store filter.
- Optional merchant filters for common Canadian grocery chains.
- Whole-list comparison now considers sources in this order: supported current Canadian prices, active weekly flyer prices, recent receipt prices, then older saved household prices.
- Grocery-list shopping suggestions can use active flyer deals when a full postal code is available.
- Multi-product flyer tiles are displayed as offers but excluded from exact basket totals.
- Flyer package-size arithmetic supports common weight, volume, count, and multipack patterns so advertised package prices are not incorrectly treated as per-kg/per-L prices.
- Ambiguous weight/volume flyer rows are skipped from exact totals rather than guessed.
- Optional scheduler script: `backend/app/scripts/refresh_weekly_flyers.py`.

## Configuration
Reuse the existing `APIFY_API_TOKEN`, then optionally override:

```env
APIFY_FLYER_ACTOR_ID=scrapersdelight/flipp-flyer-digest
FLYER_CACHE_HOURS=36
FLYER_MERCHANT_CACHE_HOURS=168
FLYER_TIMEOUT_SECONDS=120
FLYER_MAX_MERCHANTS=15
FLYER_MAX_RESULTS=180
```

See `V75_WEEKLY_FLYER_INTELLIGENCE.md` for operational notes.
