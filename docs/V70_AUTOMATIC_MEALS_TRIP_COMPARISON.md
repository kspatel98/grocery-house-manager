# V70 — Automatic Meal Ideas + Automatic Whole-List Trip Comparison

This release focuses on removing setup work and developer-style language from the V69 Smart Assistant and whole-list comparison flows.

## Whole-list comparison

- Comparison now starts automatically when an existing shopping list is selected/opened.
- Price-source priority is automatic:
  1. live Canadian retailer results when `APIFY_API_TOKEN` is configured;
  2. recent receipt-derived prices;
  3. older saved household price history.
- Missing store prices are **never synthesized**. V69's conservative 5% fill-in has been removed.
- Incomplete stores display a supported/known subtotal plus the exact number and names of missing products.
- A store is described as the best complete basket only when every active shopping-list item has a supported price at that store.
- Two-store recommendations are calculated only when the pair can price every active item. The UI also evaluates whether the extra stop is likely worthwhile (minimum roughly CAD $5 or 5% of the best complete single-store basket).
- Source labels explain whether the result contains live, recent receipt, or saved household data.
- A Canadian postal code is optional. The app remembers one on the current device and reuses it automatically. When absent, the user's saved profile city/country is used instead.
- The separate side-panel live-comparison workflow was removed to avoid asking users to run two versions of the same comparison. The side panel now focuses on nearby stores.

## Meal ideas

- Replaced the tiny exact-word recipe matcher with a broader local ingredient-normalization engine.
- Examples of understood aliases include basmati/jasmine rice → rice, spaghetti/penne → pasta, mozzarella/cheddar → cheese, chicken breast/thigh → chicken, Greek yogurt → yogurt, dal/daal → lentils, tortillas/wraps → tortilla, and common produce variants.
- Expanded the built-in meal library to practical household meals including fried rice, rice bowls, pasta, omelettes, grilled cheese, French toast, yogurt/oat bowls, sandwiches, quesadillas, dal rice, paneer rice, potato egg hash, salads, and fish/potatoes.
- Suggestions are split into:
  - **Can make now** — all required ingredient groups are available.
  - **Almost ready** — exactly one required ingredient group is missing.
- Expired products are excluded from meal matching.
- Meals using products expiring in the next five days are prioritized and marked as a "use soon" opportunity.
- Missing ingredients can be added in one tap. If the grocery doesn't exist in inventory, the backend creates an out-of-stock product automatically, then adds it to the active list. If no active list exists, a `Meal ideas shopping` list is created automatically (subject to plan limits).

## Smart Assistant UX

- Removed the duplicate full whole-list comparison card from Smart Assistant.
- Smart Assistant now gives a short next-trip handoff and sends the user to the Shopping page, where the automatic comparison is the single source of truth.
- Removed customer-facing "Build coverage" language.
- Empty meal states explain that no configuration is required; normal inventory/receipt use gradually creates useful suggestions.

## Deployment

No new third-party API is required for the meal feature.

For live Canadian whole-list pricing, keep the existing backend setting configured:

`APIFY_API_TOKEN=...`

Without it, whole-list comparison still runs automatically from receipt and saved household price history and clearly explains that live pricing is not connected.
