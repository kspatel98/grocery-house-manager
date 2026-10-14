# GHM V126 — Ask GHM bottom dock + detailed Cook from Home recipes

## Ask GHM
- Converted the Ask GHM workspace to a true chat layout instead of using a sticky panel that could float over answer text.
- Desktop: the Ask GHM shell fills the visible main workspace, the transcript scrolls independently, and the composer owns the bottom edge.
- Mobile: the Ask GHM shell fills the usable screen above the bottom navigation; the transcript scrolls and the composer stays directly above the navigation.
- The composer is no longer positioned over answer text, so the last response remains fully visible.
- Ask GHM continues to use the same microphone artwork as Tell GHM.

## Cook from Home recipes
- All 61 built-in recipes already have detailed step-by-step methods; V126 now presents them in a more structured recipe view.
- Added Recipe at a glance information: servings, ingredient count, step count and inventory readiness.
- Added a clear Ingredients & quantities section before the inventory comparison table.
- Added optional pantry seasoning details to built-in recipes so ingredient lists feel complete rather than minimal.
- Pantry seasonings are marked optional so they do not incorrectly lower meal readiness or automatically create shopping-list shortages.
- Added dish-specific pantry details such as pav bhaji masala, chole masala, kasuri methi, sambar powder and other relevant seasonings.
- Kept serving-based quantity scaling and inventory comparison behavior.

## Localization
- All new V126 recipe UI labels are included in English, Gujarati, Hindi and French.
- New pantry ingredient names have Gujarati, Hindi and French translations.
- Built-in recipe names remain translated in all four languages.
- All 61 built-in detailed methods still have English/Gujarati/Hindi/French step sets.

## Validation
- Changed TS/TSX files parse successfully with TypeScript transpilation.
- 76 frontend TS/TSX files scanned with zero duplicate object-literal keys.
- 61 built-in recipes / 61 detailed method sets / 0 missing detailed methods.
- V126 CSS brace validation passed.
