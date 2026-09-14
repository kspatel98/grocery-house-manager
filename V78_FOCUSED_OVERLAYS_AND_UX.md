# v78 — Focused overlays and calmer navigation

## Focus mode for every modal/drawer
- Any rendered `role="dialog" aria-modal="true"` now freezes the page underneath at its exact scroll position.
- Closing the dialog restores the same page position and returns keyboard focus to the control that opened it when possible.
- Escape closes dialogs that expose an explicit close control.
- The page itself never scrolls behind Add/Edit Product, flyer details, members, activity, the mobile More sheet, or premium dialogs.
- Long forms scroll only inside the dialog viewport.
- Product Add/Edit keeps its header and Save/Cancel actions visible while the form content scrolls.
- Mobile product/flyer/activity dialogs use the full viewport.
- Members drawer now uses the full viewport height with no artificial scroll-to-top behavior.

## House dashboard cleanup
The former flat feature grid is grouped by intent:
1. Everyday — Inventory, Shopping, Meals
2. After shopping — Scan receipt, Receipt history
3. Insights — Prices & Flyers, Reports

Meals is now visible directly from the house dashboard instead of being discoverable only through navigation.

## Navigation cleanup
- Desktop primary navigation: Home, Inventory, Shopping, Meals, Prices.
- Smart Assistant moves into More with Scan Receipt, Receipt History, Reports, Plans, and Support.
- Mobile bottom navigation stays focused on Home, Inventory, Shopping, Meals, More.
- Meals now includes the active-house switcher.
- Inventory quick links now prioritize Shopping, Meals, Scan receipt, and Prices & Flyers.

## Localization
All new v78 dashboard labels and descriptions are included in English, Gujarati, Hindi, and French through the existing global localization bridge.
