# V38 Receipt Review, Inventory Update, and Reports Polish

This update improves the real receipt review workflow based on mobile testing with a Walmart grocery receipt.

## Receipt scanning and review

- Receipt rows now keep separate fields for:
  - Quantity
  - Unit (`pcs`, `kg`, `lb`, etc.)
  - Unit price / price per unit
  - Line total
  - Discount
- If the scanner does not return a quantity, product rows default to `1`.
- Scale/weight receipt lines such as `BANANAS 1.165 kg @ $1.50 /kg` are parsed so price history saves `$1.50/kg`, not the `$1.75` line total.
- Walmart coded item names are cleaned where possible, for example coded cheese rows are simplified to `CHEESE`.
- The review grid is more visual and easier to use on desktop/mobile.

## Create missing inventory items from a receipt

- Unmatched receipt rows can now create a new inventory product directly from the review screen.
- Users can choose the inventory section and unit before saving.
- Created items are matched to the receipt line and then included in price history.

## Inventory updates after receipt review

- When a reviewed receipt is saved, selected product rows update:
  - Store price history
  - Product last bought date
  - Product current price
  - Product quantity, if `Add` is checked in the review row
- Quantity is updated only on the first reviewed save, so clicking save again does not double-add inventory.

## Reports and export-ready insights

- Reports page now has visible export buttons:
  - Export price CSV
  - Export receipt insights
- Added a stronger report summary section and tracked receipt spend stat.
- Price reports now show prices with units, for example `$1.50 / kg`.

## Database change

Adds one new optional column:

```sql
ALTER TABLE receipt_line_items ADD COLUMN IF NOT EXISTS line_unit VARCHAR(32);
```

The existing dev migration helper adds this automatically on startup.
