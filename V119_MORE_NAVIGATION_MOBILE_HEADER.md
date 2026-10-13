# GHM V119 — More navigation, mobile header, receipt contrast

## Navigation
- Desktop sidebar is intentionally simple: **Home / Plan / Shop / Scan / More**.
- Removed the expandable Tools section from the sidebar.
- Added a dedicated `/more` workspace with secondary features grouped as cards:
  - Home, food & routines
  - Receipts & money
  - GHM Intelligence
  - Account & app
- Mobile bottom navigation now opens the same More workspace instead of an overlay sheet.
- More remains highlighted when a secondary tool is open.

## Header
- Language control is icon-only in authenticated headers; the native selector still exposes English, ગુજરાતી, हिंदी, Français.
- Added an icon-only Ask GHM shortcut to the mobile header.
- Kept light/dark toggle and notifications in the mobile header.
- Removed the profile avatar from the narrow mobile header to protect the product name; Profile is available in More.
- Improved product-name wrapping so `Grocery House Manager` remains fully readable on narrow phones.

## Receipt Scan
- Fixed the active `Upload & scan` step in dark mode.
- Fixed all receipt workflow step text/background contrast.
- Fixed extra-scan credit badge visibility and pricing link contrast.
- Kept all four receipt steps visible on mobile with compact readable labels.

## Localization
- Added translations for the new More workspace headings, explanatory copy, and card descriptions in Gujarati, Hindi and French.
- Language option names remain self-named: English, ગુજરાતી, हिंदी, Français.

## Validation
- Frontend TypeScript/TSX syntax transpilation checked for all source files (excluding declaration-only `vite-env.d.ts`).
- Backend Python compile check completed.
