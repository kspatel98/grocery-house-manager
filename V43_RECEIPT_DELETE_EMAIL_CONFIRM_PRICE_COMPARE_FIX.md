# v43 Receipt Delete, Email Confirmation, and Price Compare Fix

## What changed

### Receipt deletion
- Added a delete action on the house receipt history page.
- Deleting a receipt removes the receipt record, extracted line items, price entries created from that receipt, and the uploaded receipt image file when stored under `/uploads`.
- Inventory rollback is applied for reviewed receipt rows that had updated inventory.
- If a product was created from that receipt and its quantity becomes `0` after rollback, the product is deleted from inventory. Otherwise, the product stays.

### Safer inventory tracking for future receipts
- Receipt line items now store whether inventory was updated, how much quantity was applied, what unit was used, and whether the product was created from the receipt.

### Email confirmation before account creation
- Email/password registration now sends a confirmation code first.
- The account is created only after the user enters the correct code.
- Google sign-in still works separately.

### Canadian price comparison fixes
- Save-On-Foods now uses the actor-friendly `saveon` retailer key.
- Price comparison now sends `items`, `queries`, `location`, and region/postal-code hints.
- Output parsing now handles more Apify result shapes.

## Deploy

```bash
docker compose down
docker compose up -d --build
```

## Backend env reminder

```env
APIFY_API_TOKEN=your_token
APIFY_CANADA_PRICE_ACTOR_ID=sunny_eternity/canada-grocery-price-comparison
APIFY_PRICE_OUTPUT_MODE=comparison
APIFY_PRICE_CACHE_HOURS=12
APIFY_PRICE_TIMEOUT_SECONDS=90
```

Supported retailer keys: `loblaws`, `superstore`, `nofrills`, `saveon`, `pricesmart`, `tnt`.
