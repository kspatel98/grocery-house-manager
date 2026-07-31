# V42 Receipt History + Creative Polish

## What changed

- Added a dedicated house-level receipt history page:
  - `/houses/:houseId/receipts`
  - Shows saved receipt photos, receipt date, upload date, store name, totals, discounts, tax, payment, receipt number, notes, and extracted item rows.
  - Search receipts by store, date, product, payment, receipt number, or notes.
  - Separate receipt library list and detailed receipt viewer.

- Added receipt history access inside each house:
  - Topbar button: `Receipt history`
  - Separate receipt library teaser card beside the receipt scanner.
  - Receipt scanner now keeps only scanning/review/manual entry, while old receipts live in their own page.

- Added stronger visual polish:
  - Sticky always-accessible header.
  - Mobile-safe horizontal navigation.
  - Animated cards and subtle hover motion.
  - More creative receipt-history visuals.
  - Graphical receipt/live/saved badges.
  - Responsive receipt detail cards that do not overflow on mobile.

- Cleaned user-facing feel:
  - Less technical language.
  - More business-ready layout.
  - Receipt history focused on what users care about: store, date, receipt photo, products, price, discounts, and totals.

## Deploy

```bash
docker compose down
docker compose up -d --build
```

## Test checklist

- Open a house on mobile.
- Confirm header remains accessible while scrolling.
- Tap `Receipt history` from the house dashboard.
- Search receipts by store/product.
- Open a receipt and confirm the uploaded photo and extracted rows are visible.
- Confirm no receipt/detail table pushes the page sideways on mobile.
