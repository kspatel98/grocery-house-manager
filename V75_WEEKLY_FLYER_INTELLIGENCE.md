# v75 — Weekly Flyer Intelligence

## What changed

- Added structured Canadian weekly-flyer ingestion through the configurable Apify flyer actor.
- Uses full Canadian postal codes and optional store filters.
- Stores flyer results in the existing PostgreSQL `external_price_cache` table so users in the same area can reuse cached data.
- Adds a Weekly Flyers section to **Prices** with product search, store filters, product images, current flyer price, price-drop badges and validity dates.
- Whole-list comparison now considers price sources in this order: current direct retailer results, current flyer deals, recent receipts, saved household history.
- Multi-product flyer bundles are shown to users but excluded from exact whole-list basket calculations.
- Household Pro smart store suggestions can use active flyer matches when a postal code has been saved.
- Added an optional server-side refresh script for scheduled weekly/daily flyer refreshes.

## Configuration

The flyer integration reuses `APIFY_API_TOKEN`.

```env
APIFY_API_TOKEN=your_token
APIFY_FLYER_ACTOR_ID=scrapersdelight/flipp-flyer-digest
FLYER_CACHE_HOURS=36
FLYER_MERCHANT_CACHE_HOURS=168
FLYER_TIMEOUT_SECONDS=120
FLYER_MAX_MERCHANTS=15
FLYER_MAX_RESULTS=180
```

The direct Canadian price-comparison actor remains separate (`APIFY_CANADA_PRICE_ACTOR_ID`).

## Optional scheduled refresh

Normal user requests automatically refresh stale flyer caches. For predictable refresh timing, run:

```bash
FLYER_POSTAL_CODES="L8P1A1,M5V3L9" \
FLYER_MERCHANTS="No Frills,FreshCo,Food Basics,Walmart,Fortinos" \
python -m app.scripts.refresh_weekly_flyers
```

Schedule it after flyers typically publish in the regions you support. Do not put the Apify token in source code.

## Data honesty

Flyer prices are promotional observations, not guaranteed real-time shelf prices. The UI labels them as weekly flyer prices and displays validity dates. Rows flagged by the upstream source as multi-product bundles are not used for exact basket totals. Package-size matching should still be reviewed by the shopper where the flyer title is ambiguous.
