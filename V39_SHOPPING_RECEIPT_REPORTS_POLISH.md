# V39 Shopping, Receipt Review, Inventory, and Reports Polish

This update focuses on the real receipt and shopping-list issues found during testing.

## Receipt review and inventory updates

- Receipt scan rows now default missing or zero quantity to `1`.
- Weighted receipt rows such as `BANANAS 1.165 kg @ $1.50/kg` keep:
  - quantity: `1.165`
  - unit: `kg`
  - price per unit: `$1.50/kg`
  - line total: `$1.75`
- Duplicate receipt lines are combined before saving. If the same product appears twice and no quantity is detected, each row counts as `1`, so the combined quantity becomes `2`.
- Before creating a product from receipt review, the backend searches existing house inventory and reuses an existing matching product to avoid duplicates.
- Creating a new product from receipt review now smartly guesses the category/section from the product name. Users can edit later.
- Saving a reviewed receipt updates inventory quantity and store price history only after user review.

## Shopping list improvements

- Shopping lists are grouped by product category with expandable/collapsible sections.
- Product cards show out-of-stock, expired, and low-stock badges clearly.
- Suggested store price badges are shown in the grocery list when available.
- Suggested prices prefer recent receipt prices from the last 21 days, then live comparison prices, then saved prices.
- The full live comparison stays available through the Compare Live Prices button, but opens in a separate scrollable popup instead of cluttering the page.
- Users can create a product directly from the shopping-list product picker. The app checks for an existing product first, then creates and selects it.

## Inventory status fixes

- Quantity `0` now shows **Out of stock** instead of low stock.
- Expired products are marked **Expired** when expiry date has passed.
- Low stock is only shown when quantity is above zero but below threshold.

## Reports UI

- Reports page layout has responsive CSS for mobile and narrow screens.
- Export buttons are kept visible and stack cleanly on mobile.
- Reports support price-per-unit display such as `$1.50 / kg`.

## Build notes

- Backend Python compile check passed.
- The frontend production build could not be re-run in this sandbox because npm installation was blocked/timed out by the sandbox package registry. The lockfile was normalized to public npm registry URLs for normal Docker deployment.
