# Grocery market API features

This update adds a Canada-first grocery market toolkit to Grocery House Manager.

## What was added

### Frontend

- New main navigation item: **Prices**
- New page: `/market`
- Product lookup tool using Open Food Facts
- Canadian grocery price comparison tool using the Apify actor when configured
- Shopping list panel now has a **Compare live prices** button
- Mobile-friendly layout and result cards/tables

### Backend

New endpoints:

- `GET /market/capabilities`
- `GET /market/houses/{house_id}/product-lookup?barcode=...&query=...`
- `POST /market/houses/{house_id}/price-compare`

New backend utility:

- `app/utils/market_data.py`

New database table:

- `external_price_cache`

The cache stores external price comparison responses for `APIFY_PRICE_CACHE_HOURS` hours to reduce cost and avoid calling Apify on every user click.

## Plan access

- **Free Starter**: can use shared house features only when invited, based on the owner's plan.
- **Basic Home+**: product/barcode lookup with Open Food Facts.
- **Family Plus+**: Canadian grocery price comparison for supported retailers.
- **Household Pro**: keeps existing smart nearby store suggestions and also gets live Canadian price comparison.

## Required configuration

Open Food Facts product lookup works without an API key.

For Canadian live price comparison, add this to `backend/.env`:

```env
APIFY_API_TOKEN=your_apify_token_here
APIFY_CANADA_PRICE_ACTOR_ID=sunny_eternity/canada-grocery-price-comparison
APIFY_PRICE_OUTPUT_MODE=comparison
APIFY_PRICE_CACHE_HOURS=12
APIFY_PRICE_TIMEOUT_SECONDS=90
MARKET_MAX_COMPARE_ITEMS=12
```

## Supported Canadian retailers

- `loblaws`
- `superstore`
- `nofrills`
- `saveonfoods`
- `pricesmart`
- `tnt`

## Important wording for users

Do not promise “100% real-time cheapest price.” The UI says:

> Showing latest available Canadian grocery price results. Prices may vary by store, location, loyalty offers, and availability.

This is safer and more accurate because grocery prices can vary by postal code, store branch, online vs in-store channel, and loyalty promotions.

## Deploy

```bash
docker compose down
docker compose up -d --build
```

Then visit:

```text
/market is in the nav as Prices
```

