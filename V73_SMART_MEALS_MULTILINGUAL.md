# V73 — Smart Meals, Recipe Inventory Gaps & Multilingual Shell

## New Meals feature
- New house-aware route: `/houses/:houseId/meals`.
- Seeded Gujarati recipe library covering the requested breads, meals, shaak, farsan/snacks, sweets and drinks, plus sample general recipes.
- Categories: proper meal, light munching, breakfast, dessert and drinks.
- Diet filters: Jain, Swaminarayan/no onion-no garlic, vegetarian, vegan and non-vegetarian.
- Any positive serving count can be entered; ingredient quantities scale from each recipe's base servings.
- Required quantities can also be edited manually on the dish card.
- Inventory matching checks actual quantity and compatible g/kg or ml/l units, not only product existence.
- Availability score shows what can be cooked now from the active house inventory.
- Shortage logic computes `required - available` and never suggests buying stock already available.

## Grocery list actions
- Add shortages only: buys only the quantity gap.
- Add selected: users tick individual ingredients and can edit required quantities first.
- Add full recipe: adds the complete required recipe quantities regardless of inventory.
- Grocery items carry recipe tags such as `Recipe shortage · Vanilla Cake · 2 kg`.
- If a recipe ingredient does not exist in inventory, a zero-stock inventory product is created because the current shopping-list data model requires a Product relationship.
- Existing active grocery list is reused; if none exists, a Recipe shopping list is created subject to the user's plan limits.

## Custom dishes
- Users can add a dish name and any number of ingredient rows.
- Ingredient quantity and unit can be edited and rows can be removed.
- Custom cards are persisted in browser localStorage and can then use the same serving scaling, inventory gap and grocery-list workflow.

## Languages
- Persistent top-right language picker: English, Gujarati, Hindi and French.
- App language is stored in `ghm_language` and applied to the document language.
- Authenticated primary navigation and the Meals experience are localized.
- Recipe names include all four languages; common ingredients have localized display names.
- The LanguageProvider is now the site-wide localization foundation. Existing legacy long-form page body copy that predates V73 still falls back to English until those individual strings are migrated into the translation catalog.

## Backend
- Added `RecipeShoppingIngredientIn`, `RecipeShoppingAddIn` and `RecipeShoppingAddOut` schemas.
- Added `POST /insights/houses/{house_id}/recipes/add-shopping` for quantity-aware recipe shopping actions.
- Existing recipe-missing endpoint remains untouched for backwards compatibility with Smart Assistant.

## Verification
- Python backend `compileall` passes.
- New and edited TypeScript/TSX files pass TypeScript syntax/transpile validation.
- A full Vite build could not be completed in this execution environment because the dependency installation timed out before all `@types/*` packages were available; the project lockfile remains unchanged.
