# Grocery House Manager v79 — Focused Workflows, Visual Meals, Shared Expenses & Receipt Reconciliation

## 1. Viewport-native dialogs

Inventory Add/Edit, flyer details, recipe details, activity, members, mobile More, shared-expense dialogs and other modal surfaces are rendered through a document-body portal. Opening a dialog now freezes the exact page position the user is currently viewing. The background cannot scroll until the dialog closes.

Long dialogs use their own internal scrolling area, while their title/close controls and important actions stay accessible. Mobile dialogs use the full visual viewport (`100dvh`) with safe-area padding.

## 2. Visual Meals & Recipes

Built-in recipes are now shown as visual cards with local recipe artwork. Opening a recipe reveals the serving-aware ingredient list, household inventory availability, shortage calculation, grocery-list actions and the full step-by-step method.

An optional TheMealDB-backed discovery search was added for additional recipes and meal images. Configure `THEMEALDB_API_KEY` on the backend. External recipe quantities are presented as supplied by the source and are intentionally not treated as inventory-safe scalable quantities unless they are converted into a structured Grocery House Manager recipe later.

## 3. Shared household expenses

A new Expenses area provides Splitwise/Tricount-style household cost tracking:

- Add grocery or household expenses.
- Choose who paid.
- Split equally or enter custom shares.
- Link an expense to a saved receipt.
- See each member's net balance.
- See suggested payments to settle the house efficiently.
- Record settlements.

The feature is house-aware and available from the House dashboard and More navigation.

## 4. Shopping list → receipt verification

A selected grocery list now offers **Finish with receipt**. The receipt scanner is linked to that shopping trip and compares OCR results against the list before inventory is finalized.

- Matched list items are handled automatically.
- A list item missing from the receipt must be confirmed as **Bought anyway** or **Not bought**.
- A receipt item not present on the shopping list must be confirmed as **Add to inventory** or **Receipt only**.
- Extra receipt items are never silently added to inventory.
- Standalone receipt scanning remains available and unchanged as a separate path.
- After saving a receipt, users can immediately split that receipt as a shared expense.

## 5. Search-result / favicon brand refresh

The public site now points its favicon, Apple touch icon, PWA icons, Open Graph image and structured-data logo to the current Grocery House Manager brand assets. Search engines can continue showing a previously cached icon until the site is recrawled.

## 6. Navigation and localization

Expenses is integrated into house navigation. New receipt reconciliation, expense, recipe discovery and overlay labels are included in the existing English, Gujarati, Hindi and French localization system. User-entered content and external-provider recipe text remain in their original form instead of being inaccurately machine-translated.

## New backend environment variables

```env
# Optional additional recipe discovery
THEMEALDB_API_KEY=
THEMEALDB_TIMEOUT_SECONDS=15
```

No API key is required for the built-in recipe library.

## Database additions

Development migration support adds:

- `receipts.shopping_list_id`
- `house_expenses`
- `expense_shares`
- `expense_settlements`

Existing data is preserved.

## Validation completed for this release

- Python backend compilation
- TypeScript/TSX syntax transpilation scan
- localization duplicate-key scan
- CSS brace/balance validation
- final ZIP integrity validation

Run the full frontend production build in your normal local/server environment before deployment:

```bash
cd frontend
npm ci
npm run build
```
