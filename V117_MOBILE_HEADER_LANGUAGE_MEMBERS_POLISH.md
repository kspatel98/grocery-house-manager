# GHM V117 — mobile header, preferences, receipt readability, members polish

## What changed
- Moved language and light/dark toggle controls from the desktop sidebar footer into the header/topbar.
- Kept only the profile card at the bottom of the desktop main menu.
- Improved desktop sidebar navigation space so the main menu is easier to use and Tools stays contained.
- Added a cleaner mobile header with compact language, theme, notification, and profile controls.
- Refined action buttons for Quick add, Ask GHM, and Scan receipt.
- Replaced the voice button icon in Tell GHM with the provided mic image and made it dark-mode safe.
- Improved mobile dialog/sheet sizing so close buttons stay visible and cards do not open off-screen.
- Polished receipt scan dark mode, including the receipt preview/paper and step/top sections.
- Improved members section spacing and added an easy Invite someone action in the member bar.
- Language options now display as: English, ગુજરાતી, हिंदी, Français.

## Tell GHM vs Household Intelligence
- **Tell GHM** = quick capture / quick routing.
  - Best for fast actions like: “we are out of milk”, “scan a receipt”, “add an expense”, “find food tonight”.
  - It can route you directly to the right page or give a short answer.
- **GHM Household Intelligence** = deeper reasoning.
  - Best for analysis and advice like: “what should we buy this week?”, “why is spending higher?”, “what should we use first?”, “which store usually saves more?”
  - It is for explanation, forecasting, and more thoughtful recommendations.

## Files updated
- `frontend/src/components/AppFrame.tsx`
- `frontend/src/components/UniversalCapture.tsx`
- `frontend/src/components/HouseInfoPanels.tsx`
- `frontend/src/pages/HousePage.tsx`
- `frontend/src/i18n.tsx`
- `frontend/src/localizationCatalog.ts`
- `frontend/src/main.tsx`
- `frontend/src/theme-v117.css`
- `frontend/public/brand/mic-symbol.png`
