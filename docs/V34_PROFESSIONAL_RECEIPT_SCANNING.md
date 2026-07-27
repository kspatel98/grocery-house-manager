# Professional Receipt Scanning

This version replaces the old basic receipt behavior with a safer and more professional scan → review → save workflow.

## What changed

- Receipt uploads no longer auto-update product prices immediately.
- The backend can call Tabscanner by default, or Veryfi as an optional backup, when configured.
- The receipt review screen shows:
  - store/vendor name
  - receipt date
  - receipt number
  - payment label
  - subtotal
  - discounts
  - tax
  - total
  - each extracted product line
  - quantity, unit price, line total, discount
  - matched inventory product
- Users review/edit rows, then click **Save reviewed receipt to price history**.
- Only selected reviewed product rows update `product_store_prices` and product latest price.
- The database stores receipt line items in `receipt_line_items`.

## Supported upload formats

The recommended Tabscanner provider supports **JPG, JPEG, and PNG receipt images only**. The app blocks PDFs, WEBP, HEIC, and unsupported file types in both the frontend and backend.

## Required `.env` for Tabscanner

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

If Tabscanner is not configured, the app falls back to a basic local scan and clearly tells the user to review manually.

## Optional Veryfi backup

Set `RECEIPT_OCR_PROVIDER=veryfi` and fill Veryfi credentials only if you decide to use Veryfi instead of Tabscanner.

## Plan access

- Free Starter: manual receipt entry only
- Basic Home: 10 professional scans/month
- Family Plus: 50 professional scans/month
- Household Pro: 150 professional scans/month

The scan limit is counted per user per house per calendar month.

## Test receipt scanner from backend container

```bash
docker compose exec backend python -m app.scripts.test_tabscanner /app/public/uploads/sample-receipt.jpg
```

## Why review is required

Even professional receipt extraction can make mistakes on faded receipts, long thermal receipts, cropped totals, shortened grocery product names, loyalty discounts, and weighted produce items. The app therefore never trusts scan results silently.
