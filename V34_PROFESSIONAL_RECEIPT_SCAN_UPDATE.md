# Grocery House Manager v34 — Professional Receipt Scan Update

This update upgrades receipts from basic OCR-assisted price matching to a professional receipt studio.

## Highlights

- Integrates optional Veryfi receipt extraction.
- Extracts store/vendor, date, receipt number, payment label, subtotal, discounts, tax, total, and product line items.
- Adds a review screen before saving any scanned prices.
- Stores extracted rows in `receipt_line_items`.
- Auto-matches receipt rows to existing inventory products, but does not update prices until the user confirms.
- Adds monthly receipt scan limits by plan:
  - Free Starter: manual only
  - Basic Home: 10 scans/month
  - Family Plus: 50 scans/month
  - Household Pro: 150 scans/month
- Updates pricing/support/legal wording from “OCR assisted” to professional scan/review language.

## Veryfi setup

Add to `backend/.env`:

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

## Test

```bash
docker compose down
docker compose up -d --build
docker compose exec backend python -m app.scripts.test_veryfi /app/public/uploads/sample-receipt.jpg
```

## User workflow

1. Open a house.
2. Go to **Receipts & store prices**.
3. Upload a receipt photo/PDF.
4. Review extracted store, totals, discounts, tax, and item rows.
5. Match rows to inventory products.
6. Click **Save reviewed receipt to price history**.

## Safety behavior

The app no longer silently trusts OCR. It saves raw scan data, stores extracted receipt rows, and only updates product price history after user review.
