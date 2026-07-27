# v35 — Tabscanner receipt scanning + JPG/PNG-only uploads

This version switches the recommended smart receipt scanner from Veryfi to **Tabscanner** and makes receipt uploads stricter and clearer for users.

## Why this changed

Tabscanner's receipt API is focused on receipt images and uses a process → result polling workflow. Its documentation says supported upload formats are **JPG and PNG**, so the app now blocks PDFs, WEBP, HEIC, and other file types before upload.

## User-facing changes

- Receipt Studio now asks users to upload **JPG or PNG receipt photos only**.
- The file picker accepts only `.jpg`, `.jpeg`, and `.png`.
- The frontend shows a friendly error if users select PDF, WEBP, HEIC, or another unsupported file.
- The backend also enforces the same restriction so unsupported files cannot bypass the UI.
- Public/support/legal wording was updated to avoid saying PDF receipts are supported.

## Backend changes

- New provider value: `RECEIPT_OCR_PROVIDER=tabscanner`
- Added Tabscanner settings:
  - `TABSCANNER_API_KEY`
  - `TABSCANNER_PROCESS_URL`
  - `TABSCANNER_RESULT_URL`
  - `TABSCANNER_REGION`
  - `TABSCANNER_DOCUMENT_TYPE`
  - `TABSCANNER_DEFAULT_DATE_PARSING`
  - `TABSCANNER_POLL_INTERVAL_SECONDS`
  - `TABSCANNER_TIMEOUT_SECONDS`
  - `TABSCANNER_TOTAL_TIMEOUT_SECONDS`
- Added provider router: `scan_receipt(...)`
- Kept Veryfi as optional backup with `RECEIPT_OCR_PROVIDER=veryfi`
- Kept local OCR fallback for development or missing API keys

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

## Recommended user guidance

Tell users:

> Upload a clear JPG or PNG photo. Keep the receipt flat, well-lit, fully visible, and make sure totals are not cropped.

## Review-before-save still required

The scan can extract store, items, prices, discounts, taxes, subtotal, and total, but users must still review the extracted data before saving it to receipt history and product price history.
