# V84 — Device-safe UX, editable expenses, richer meals

## Expenses
- Existing shared expenses can now be edited from Expense activity.
- Edit opens the same guided expense form with amount, category, payer, date, receipt, notes, participants and split amounts prefilled.
- Saving an edit recalculates balances, reimbursements, monthly books and insights immediately.
- Receipt uniqueness remains protected when an expense is edited.
- Mobile now has an always-visible Add expense floating action above the bottom app navigation.

## Viewport-safe dialogs and forms
- Important modal surfaces are constrained to the active browser viewport on laptop, tablet and phone.
- Long forms scroll inside the focused card; the page behind stays fixed.
- Modal layers sit above the fixed mobile header and bottom navigation.
- On phone, important dialogs use the full visible screen so controls cannot be hidden above/below the viewport.
- Extra bottom safe-area padding prevents the mobile navigation from covering page actions.

## Navigation polish
- Desktop More now uses a static ellipsis instead of a moving/rotating arrow.
- Mobile More is a clean viewport-safe sheet and no longer competes with the bottom navigation.
- Scroll padding is reserved for the sticky/fixed header.

## Meals
- Cook from Home is no longer sticky, so Discover more recipes cannot scroll over it.
- Added a graphical cuisine strip: Gujarati, Punjabi, South Indian, Maharashtrian, Rajasthani, North Indian and International.
- Added 18+ regional recipes including Punjabi Chole, Rajma Masala, Dal Makhani, Paneer Butter Masala, Paneer Bhurji, Aloo Paratha, Idli Sambar, Masala Dosa, Vegetable Upma, Lemon Rice, Curd Rice, Kanda Poha, Pav Bhaji, Misal Pav, Dal Baati, Gatte ki Sabzi, Dal Tadka and Baingan Bharta.
- Added detailed step-by-step methods for the new catalogue items.
- Added real photographic recipe assets for highlighted dishes.
- Built-in cards without a local photo lazily try TheMealDB when they enter the viewport and use a real source image only when the meal-name match is strong enough; results are session-cached.
- Added aliases for new Indian pantry ingredients to improve inventory matching.
- Cuisine names and newly added ingredient names are localized for Gujarati, Hindi and French.

## Validation
- Backend Python compiles.
- Modified TS/TSX files pass TypeScript syntax parsing; unresolved package/type errors are expected without installed npm dependencies.
- CSS brace structure is balanced.
- 61 built-in recipes have unique IDs.
- The v83 exact-cent reimbursement scenario still settles correctly.
