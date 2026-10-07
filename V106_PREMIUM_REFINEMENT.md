# GHM V106 — Premium Refinement

This release focuses on refinement, readability, organization and reliability rather than adding unrelated product features.

## Shopping list redesign

- The active list now starts with a compact glance strip: To Buy, In Cart and Total.
- To Buy and In Cart are separate stage views instead of two long lists stacked vertically.
- Shopping rows are compact by default. Quantity controls and the most useful price/stock signal stay visible; store, price, bought quantity and notes move behind **Details**.
- Categories behave as focused accordions, with one section open at a time, so long lists stay scannable.
- Shopping completion is a dedicated sticky action when viewing In Cart.
- Existing deep shopping behavior, inventory reconciliation, price suggestions and product creation remain available.

## Expense accounts — automatic or custom

The main Expenses workspace now controls **how monthly expense accounts are created**:

- **Automatic**: GHM ensures the new calendar-month account is available when the household opens Expenses after the month changes. The account can still be renamed and edited later.
- **Custom**: GHM does not create a new monthly account automatically. An owner/admin creates one only when the household is ready.
- The selected mode belongs to the house, not to one browser.
- Existing historical months are automatically upgraded into account records.

Each month opens as a dedicated route, for example:

`/houses/123/expenses/2026-09`

That view is intentionally focused on the selected account: account name/status, Add Expense, owner lock/unlock and that month’s transactions. Broader household balances, reimbursements and spending insights stay on the main Expenses workspace.

Expense dates and expense accounts remain separate. A household can keep posting October purchases into its open September account until it intentionally switches.

## Expense month protection

- Owners can lock a completed month.
- Locked accounts reject new expenses and prevent edits/deletes until the owner unlocks them.
- The account can be renamed without changing its underlying YYYY-MM accounting key.

## Readability and visual system

- Added `theme-v106.css` as the final style layer.
- Standardized mobile/desktop page padding, card padding, spacing, radii and touch targets.
- Reworked high-visibility legacy cards so dark mode no longer mixes light cards with light text.
- Dark surfaces are intentionally lighter than before, with brighter primary text and stronger field/card separation.
- Explicit fixes cover Quick Start, Working In, Shop/Grocery List, Premium Try, “Better on your phone”, Home cards and other mixed-generation components.
- Today’s **Value Proof** uses a controlled medium-blue surface with explicit white/light text in both light and dark modes.
- Why dialogs remain concise: **Why this helps → How it works → Example**. Repeated “benefit first/details when needed” filler has been removed.
- Desktop receives the same spacing/contrast system, with calmer content width, cleaner rows and denser-but-readable working surfaces.

## Login / household-loading reliability

- Login no longer blocks on a separate `/health/ready` check before attempting authentication.
- Transient login requests can retry with backoff on 502/503/504/network errors.
- API requests use a more realistic timeout for production connections.
- Account bootstrap data is cached locally and kept visible while background refreshes occur.
- Window-focus refreshes are throttled instead of repeatedly refetching the same household data.
- Houses and the house switcher reuse the latest account bootstrap cache during transient reconnects.
- The old large “Preparing your household/homes” panels are replaced by a delayed, compact loading state and are skipped when cached content is already usable.
- Auth boundaries clear the bootstrap cache so one user can never inherit another user’s cached household shell.

## Existing V105 direction retained

- Theme chooser: System / Light / Dark and Classic / Calm / Vibrant.
- Contextual House Chat.
- Weekly Household Report.
- Universal Quick Capture.
- Graphical Home and More hub.
- Premium Try and How GHM Helps education system.

## Build verification

The UI now displays **GHM design build V106** and the service-worker cache is `ghm-shell-v106`.

## Validation performed

- Python compile: passed.
- Backend tests: **9/9 passed**.
- All 66 frontend TS/TSX source files parsed successfully for syntax.
- V106 CSS parsed with `tinycss2` with **0 stylesheet errors**.
- A full Vite production build still requires the normal frontend dependency installation (`npm ci`) in the deployment environment.
