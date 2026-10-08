# V113 — House navigation, House Chat, Money integrity & visual polish

V113 builds on V112 and preserves the V111 WebSocket/SQLAlchemy pool-exhaustion fix and V112 reviews/QA tooling.

## Household navigation

- `/houses` is the signed-in app Home / household switchboard.
- Public **Open app** continues to enter at `/houses`.
- Global signed-in navigation is now **Home · Plan · Shop · Scan · More** instead of duplicating Today.
- A selected house keeps its own four focused views: **Today · Home · Money · Activity**.
- Fixed the house-level Today tab: it now uses an explicit `?tab=today` URL instead of falling back to Home.
- Improved contrast and spacing for the four house-view buttons in light and dark modes.

## Shopping

- New-list creation now has a clear **Cancel** action at the top and bottom.
- The quick-create/manual product area is responsive to its actual column width so quantity/unit/price inputs no longer get cut off.
- Shopping-list actions wrap cleanly on smaller widths.
- A shopping list can be shared directly to House Chat.

## Inventory & meals

- Inventory product cards are denser and medium-sized rather than oversized.
- Mobile inventory cards become compact two-column / horizontal layouts where appropriate.
- Recipe cards, inventory readiness %, diet chips, serving controls and recipe steps now use explicit high-contrast theme tokens.
- Dark mode no longer uses white serving / recipe-step surfaces with pale text.
- Recipe details can be shared directly to House Chat and opened again from the shared card.

## House Chat

House Chat remains household-scoped and now supports:

- delete **only your own** messages (enforced server-side),
- reply to a specific message,
- emoji reactions (👍 ❤️ 😂 😮 😢 🙏 🎉),
- rich GHM attachment cards,
- share active shopping lists, recent receipts and saved recipes from the chat composer,
- direct share actions from Shopping, Recipes and Food Tonight / restaurant results,
- attachment links back to the relevant GHM workspace.

Reactions and reply lookups are batched to avoid N+1 database request patterns.

## Money calculation hardening

Money accounting now treats integer cents as the source of truth for splits and settlement planning.

- Equal splits distribute every remainder cent deterministically.
- Custom splits must equal the expense total **exactly to the cent** in both frontend and backend.
- Reimbursements are validated to exact cents and cannot exceed the current allowed amount.
- Suggested reimbursement plans are emitted only for valid zero-sum ledgers and are independently verified to settle the ledger exactly.
- A Money account cannot mix currencies; mixed-currency arithmetic is rejected instead of silently producing a misleading balance.
- Pending reimbursements reduce payment suggestions without incorrectly changing the underlying accounting balance before confirmation.

Automated tests include the historical four-person reimbursement regression, exact-cent edge cases and randomized invariant checks. The release was additionally fuzzed with 20,000 randomized settlement/split cases.

## Receipt Scan & visual system

- Receipt Scan now uses a medium-width workspace with consistent page gutters.
- Upload, trip-details and preview columns use one visual surface language in light and dark mode.
- The upload drop-zone is shorter and less dominant.
- Dark mode no longer renders the Smart Receipt Workspace as a bright white panel with near-white/mint text.
- Receipt preview remains paper-like in light mode and becomes a readable elevated surface in dark mode.

## Landing page, Flyers & Kitchen Vision

- Landing page sections use reliable left/right gutters on desktop and mobile.
- Closed-loop feature labels and the “why pay monthly”/value card use explicit readable foregrounds.
- “Available flyer stores for this postal code” filter area and retailer chips use explicit high-contrast surfaces.
- Kitchen Vision file picker is themed rather than appearing as an unrelated white browser control in dark mode.
- House Leave action is now a deliberate rounded semantic-danger button.

## Mobile

- Layout rules are container-aware rather than desktop layouts squeezed onto phones.
- Forms, ingredient information, shopping creation and House Chat composer collapse to native-feeling one-column arrangements.
- Horizontal overflow is prevented at the app shell and component level.

## Validation

- Backend project tests: 12 passed.
- Python application compilation: passed.
- Frontend TypeScript/TSX syntax parse: 68 files, 0 syntax errors.
- `theme-v113.css`: 0 CSS parse errors.
- Money fuzz validation: 20,000 randomized invariants passed.

A full Vite production compilation still runs during the normal Docker build because release ZIPs do not include `node_modules`.
