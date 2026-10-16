# V134 — Smart Grocery UX & Cost-Safe Trip Check

V134 is a coordinated polish/intelligence pass on top of V133. It focuses on predictable editing, realistic grocery purchasing, provider-cost control, inventory categorization/media, quieter background work, and mobile chat ergonomics.

## Automatic Trip Check

- Opening a grocery list is now **cache-first** and is not allowed to start a new paid provider run.
- GHM immediately reuses valid shared live-price shards, flyer cache, receipt history, and saved household prices.
- A paid refresh only happens after the user explicitly chooses **Refresh / Resume price check**, and only for products whose shared result is missing or expired.
- Valid V132 product + regional-area caches remain reusable across households and basket combinations.
- Nearby-store discovery is also on-demand instead of running just because a list was opened.
- Editing a list marks the previous comparison **List changed / Price check paused**. No comparison is fired on each keystroke.
- Quantity/store/price/message edits are drafts until **Save changes** is pressed.
- Numeric fields may be temporarily blank while editing; required/positive quantity validation happens on save.

## Retail package intelligence

Recipe need and store purchase quantity are treated as two different concepts.

- GHM preserves the recipe amount needed for inventory/meal reasoning.
- Live/flyer basket pricing uses real package sizes when available.
- Package shelf price is preferred over informational unit-price math when a package size is known.
- For tiny requirements, GHM prefers the smallest known retailer package that covers the need within the same live/flyer source tier, then price as the tie-breaker.
- Variable/weighted produce can still use true $/kg, $/100 g, $/L, etc. when no fixed package applies.
- The result includes a short **Retail package fit** explanation, e.g. “need 10 ml; retailer sells 500 ml, so GHM prices 1 × 500 ml.”
- Unsafe or implausible quantity/price combinations remain blocked instead of producing fake basket totals.

## Recipe → shopping intelligence

- Mass-based oil recipe amounts are normalized to volume (g → approximate ml) before grocery shopping.
- Flour, oil, salt, cumin, turmeric, spices and other pantry ingredients remain real grocery items instead of being skipped.
- Semantic category assignment is used when recipe-created products are missing categories.
- Earlier recipe-created products that incorrectly landed in Fruits are repaired automatically when inventory is loaded, without overriding categories the user intentionally chose for ordinary products.

## Inventory categories

- Smart category selection no longer falls back to the first category.
- Known products such as oil/flour and pantry seasonings (cumin, turmeric, masala, coriander powder, etc.) are assigned to Pantry rather than Fruits/Vegetables.
- Unknown products use/create **Other** instead of silently becoming Fruits.
- Product creation/editing includes the Category selector directly.
- `+ Add category` opens a compact category form and selects the new category after saving.
- The old full vertical Section/Category manager was removed from the inventory page.
- Smart unit hints now prefer ml for oils and g for common dry pantry goods.

## Inventory product images

- Add/replace/remove product photo from both create and edit product forms.
- Normal phone images are resized client-side before saving; users do not need to crop to GHM dimensions.
- Product cards crop safely with `object-fit: cover`.
- Desktop media uses two intentional halves: product image/visual + GHM brand panel.
- Mobile cards show only the product image/visual so the logo does not replace the useful product photo.

## Background work UX

- Long work starts with a centered, non-blocking status notice.
- After about 2.6 seconds it animates into a compact rounded stripe near the top.
- No repetitive Stay / Explore decision buttons.
- The stripe explains that the user can continue elsewhere and will be notified when the result is ready.
- Completed/ready/failed task events remove the temporary status UI correctly.

## Chat/mobile polish

- Own messages have stronger contrast in light mode.
- Ask GHM / House Chat continue to hide the global floating Chat and Tell GHM buttons so they do not cover conversation controls.
- On normal mobile pages, Chat and Tell GHM are stacked on the right (Chat above Tell GHM).
- Mobile chat workspace bottom spacing now matches the actual bottom-nav height + safe-area inset, eliminating the artificial gap above the nav.

## Why dialogs & duplicated education cards

- Existing `Why?` dialogs use polished backdrop/dialog entrance animation.
- Duplicate large “Why this exists” cards are removed on pages that already expose the compact `Why?` link.

## Validation performed

- Backend Python source compilation passed.
- All 76 TS/TSX files parsed successfully with TypeScript's parser.
- Duplicate object-literal key scan: 0 duplicates.
- V134 stylesheet structural/braces validation passed.
- Full local `npm run build` could not be completed because the inherited project artifact contains incomplete placeholder `node_modules/@types/*` directories. GitHub Actions installs the real dependencies with `npm ci` before type-checking.

No database migration is required for V134.
