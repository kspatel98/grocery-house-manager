# V74 — Smart recipe grocery actions + detailed methods

## Grocery action semantics

- **Add only missing quantities** (recommended): compares the scaled recipe requirement against the active house inventory and adds only the shortage. Example: recipe needs 3 kg flour, inventory has 1 kg, shopping list gets 2 kg.
- **Add checked ingredients**: only checked rows are added, using the editable quantity shown in the ingredient table. This is the only automatic-recipe action that may add household water when the user explicitly checks it.
- **Add all recipe quantities**: adds every required, non-optional recipe quantity regardless of current inventory. Household water and optional rows are excluded.

## Fixes

- Household/tap/warm water is classified as manual-only and ignored by automatic grocery actions and meal-availability scoring.
- Added a backend safeguard so stale clients cannot auto-add water through shortage/full-recipe actions.
- Replaced ASCII-only ingredient normalization with Unicode-aware matching.
- Removed unsafe broad substring matching that could make `Whole wheat flour` match a generic `Flour` product or an unrelated product.
- Added explicit aliases for whole wheat flour / atta / ઘઉંનો લોટ / गेहूं का आटा and other common Gujarati pantry terms.
- Fixed unit selection when a same-name inventory product uses an incompatible unit.
- Refreshes inventory and active shopping list immediately after recipe additions.

## Recipe clarity

- Every built-in recipe now has a multi-step cooking method rather than a one-line summary.
- The method is rendered as numbered step cards below the ingredient/inventory table.
- Serving count remains adjustable and ingredient quantities continue to scale automatically.
- Grocery buttons now contain short explanations directly in the UI.
