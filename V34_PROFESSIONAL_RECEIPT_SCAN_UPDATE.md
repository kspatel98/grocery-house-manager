# Grocery House Manager — Professional Receipt Scan Update

This update upgrades receipts from basic OCR-assisted price matching to a professional receipt studio.

## Highlights

- Integrates Tabscanner receipt extraction by default, with Veryfi kept as a backup provider.
- Extracts store/vendor, date, receipt number, payment label, subtotal, discounts, tax, total, and product line items.
- Accepts JPG/JPEG/PNG receipt images only.
- Adds a review screen before saving any scanned prices.
- Stores extracted rows in `receipt_line_items`.
- Auto-matches receipt rows to existing inventory products, but does not update prices until the user confirms.
- Adds monthly receipt scan limits by plan:
  - Free Starter: manual only
  - Basic Home: 5 Smart Receipt Scans/month
  - Family Plus: 20 Smart Receipt Scans/month
  - Household Pro: 50 Smart Receipt Scans/month

## Tabscanner setup

Add to `backend/.env`:

```env
RECEIPT_OCR_PROVIDER=tabscanner
RECEIPT_SCAN_REVIEW_REQUIRED=true
RECEIPT_UPLOAD_MAX_MB=20
TABSCANNER_API_KEY=your_tabscanner_api_key_here
TABSCANNER_REGION=ca
TABSCANNER_DOCUMENT_TYPE=receipt
TABSCANNER_DEFAULT_DATE_PARSING=m/d
TABSCANNER_POLL_INTERVAL_SECONDS=1
TABSCANNER_TIMEOUT_SECONDS=30
TABSCANNER_TOTAL_TIMEOUT_SECONDS=75
```

## Test

```bash
docker compose down
docker compose up -d --build
docker compose exec backend python -m app.scripts.test_tabscanner /app/public/uploads/sample-receipt.jpg
```

## User workflow

1. Open a house.
2. Go to **Receipts & store prices**.
3. Upload a clear JPG or PNG receipt photo.
4. Review extracted store, totals, discounts, tax, and item rows.
5. Match rows to inventory products.
6. Click **Save reviewed receipt to price history**.

## Safety behavior

The app no longer silently trusts scan results. It saves raw scan data, stores extracted receipt rows, and only updates product price history after user review.
