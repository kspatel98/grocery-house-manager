# Grocery House Manager v84

This release focuses on making every important action easy to reach on every device while expanding the Meals experience.

## Expenses
- Existing shared expenses can be edited from Expense history.
- Edit opens the same guided form with amount, category, payer, date, receipt, notes, participants and split amounts prefilled.
- Saving recalculates the house ledger, reimbursement suggestions, monthly books and insights immediately.
- Mobile has an always-visible Add expense action above the bottom navigation.

## Device-safe cards and forms
- Important dialogs are rendered as viewport-bounded focus surfaces on laptop, iPad/tablet and phone.
- The page behind stays fixed; long forms scroll inside their own card.
- On phones the key forms/details use the full visible viewport with safe-area padding.
- Header and mobile bottom navigation reserve space so they do not cover page actions/content.

## Navigation
- Desktop More uses a calm static ellipsis rather than a moving/bouncing arrow.
- Mobile More opens as a clean viewport-safe sheet above the bottom navigation.

## Meals
- Cook from Home is no longer sticky, so Discover more recipes cannot scroll over it.
- Added cuisine browsing: Gujarati, Punjabi, South Indian, Maharashtrian, Rajasthani, North Indian and International.
- 61 built-in recipes are available, including 18+ additional regional Indian dishes.
- Highlighted dishes use local real food photography; other built-in dishes lazily try TheMealDB for a confident real-photo match and safely fall back if none exists.
- Detailed recipe view, inventory awareness, serving scaling and grocery-shortage actions remain intact.

## Validation
- 50 TS/TSX source files passed TypeScript syntax/transpile validation.
- Backend Python compilation passed.
- Reimbursement math tests: 3/3 passed.
- 61 recipe IDs are unique.
- localizationCatalog has zero duplicate keys.
- CSS brace structure is balanced.
- A full npm/Vite production build could not be completed in the packaging environment because npm dependency installation timed out; run `npm ci && npm run build` locally as the final production check.
