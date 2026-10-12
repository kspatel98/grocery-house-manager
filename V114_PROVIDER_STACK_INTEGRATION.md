# GHM V114 — Provider Stack Integration

V114 builds on V113 and keeps the V111 WebSocket/SQLAlchemy pool fix, V112 review/QA system, and V113 navigation/chat/money/UI improvements.

## Purpose

V114 improves the quality and resilience of GHM's real-world data without making any single third-party vendor a single point of failure. All new services are optional and server-side. If a key is absent, GHM continues to use the providers it already had.

## What was added

### Nearby Stores — Geoapify
- Google Places remains supported when configured.
- Geoapify is now the lower-cost exact-place fallback/replacement.
- Used for nearby supermarkets, reverse postal-code lookup, and flyer-store location resolution.
- Generic city-chain fallback is used only after exact providers return no result.

### Product Lookup — UPCDatabase
- Open Food Facts remains the first universal product source.
- UPCDatabase is queried only when Open Food Facts has no useful result.
- Barcode and text search are normalized into the existing Product Lookup UI.
- Existing cache is retained so repeated lookups do not repeatedly consume provider quota.

### Official retailer search — Serper
- The existing Serper implementation is now actually wired into the official-store lookup chain.
- Provider order is Serper -> Google CSE -> Google HTML last resort.
- Existing retailer-page verification rules remain.

### Instacart Developer Platform
- Nearby Canadian retailer banners can supplement Smart Nearby Stores when a postal code is available.
- An unchanged GHM shopping list can be sent to an Instacart-hosted shopping page using the official `products_link` flow.
- UPC, brand and measurement hints are included when GHM knows them.
- Generated Instacart URLs are cached by shopping-list content and regenerated only when the list changes.
- GHM never claims an Instacart match/price is guaranteed; users confirm retailer, package, price and availability on Instacart.

### Receipt OCR — AWS Textract fallback
- Tabscanner remains the default primary scanner.
- AWS Textract AnalyzeExpense can be enabled as an optional fallback or benchmark.
- Fallback is OFF by default so no surprise AWS cost is incurred.
- AWS output is normalized into the existing review-first receipt workflow.
- Users still review lines/totals before inventory, price history or Money is updated.

### Provider diagnostics
New command:

```bash
python -m app.scripts.provider_connectivity_check
```

For small live calls:

```bash
python -m app.scripts.provider_connectivity_check --live --postal-code L9C3M4
```

The live check does not scan a receipt. It can consume one Serper query if Serper is configured.

## Environment variables

See `backend/.env.example`. New variables include:

- `SERPER_API_KEY`
- `UPCDATABASE_API_KEY`
- `GEOAPIFY_API_KEY`
- `INSTACART_API_KEY`
- `INSTACART_ENVIRONMENT`
- `RECEIPT_OCR_FALLBACK_PROVIDER`
- `AWS_TEXTRACT_ENABLED`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Never commit `backend/.env`.

## Validation

- Existing backend tests retained.
- Provider adapter unit tests cover UPCDatabase, Geoapify and Instacart normalization/request payloads without spending real provider quota.
- Production provider connectivity can be checked with the command above after secrets are configured.
