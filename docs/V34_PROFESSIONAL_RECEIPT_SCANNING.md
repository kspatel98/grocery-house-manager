# v34 Professional Receipt Scanning

This version replaces the old “OCR assisted” receipt behavior with a safer and more professional scan → review → save workflow.

## What changed

- Receipt uploads no longer auto-update product prices immediately.
- The backend can call Veryfi Receipts/Invoices API when configured.
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

## Required `.env` for Veryfi

```env
RECEIPT_OCR_PROVIDER=veryfi
RECEIPT_SCAN_REVIEW_REQUIRED=true
RECEIPT_UPLOAD_MAX_MB=20
VERYFI_CLIENT_ID=your_client_id
VERYFI_USERNAME=your_username
VERYFI_API_KEY=your_api_key
VERYFI_API_URL=https://api.veryfi.com/api/v8/partner/documents
VERYFI_TIMEOUT_SECONDS=60
```

If Veryfi is not configured, the app falls back to a basic local scan and clearly tells the user to review manually.

## Plan access

- Free Starter: manual receipt entry only
- Basic Home: 10 professional scans/month
- Family Plus: 50 professional scans/month
- Household Pro: 150 professional scans/month

The scan limit is counted per user per house per calendar month.

## Test Veryfi from backend container

```bash
docker compose exec backend python -m app.scripts.test_veryfi /app/public/uploads/sample-receipt.jpg
```

## Why review is required

Even professional receipt extraction can make mistakes on faded receipts, long thermal receipts, cropped totals, shortened grocery product names, loyalty discounts, and weighted produce items. The app therefore never trusts scan results silently.
