# Grocery House Manager V91 — GHM Autopilot / Household Grocery CFO

## Product direction

V91 consolidates Grocery House Manager around one premium intelligence layer: **GHM Autopilot**. It is intentionally not a collection of new menu items. Existing task pages stay focused:

- **Inventory** — what the household owns.
- **Meals** — what can be cooked, including My Recipes and Community Recipes.
- **Shopping** — the active list and Automatic Trip Check.
- **Receipts** — what was actually purchased and paid.
- **Expenses** — household spending, splits and reimbursements.
- **Reports / Savings Ledger** — evidence of value over time.
- **Autopilot** — connects the above and recommends the next useful action.

The old visible household momentum/leaderboard-style home treatment has been replaced by a professional Autopilot decision card. Automatic Trip Check remains inside Shopping, Community Recipes remain inside Meals, and evidence/history remains in Reports. This avoids navigation bloat while still making the intelligence easy to reach.

## New intelligence

### 1. GHM Autopilot Today

A graphical command centre now summarizes:

- evidence-backed savings this month;
- current potential savings opportunities;
- active-list size and likely restocks;
- receipt-review and recall signals;
- an explainable household control score; and
- the best next action based on the current household state.

The control score and recommendations are explicitly decision support rather than financial, refund, or food-safety guarantees.

### 2. Life-aware Weekly Planner + Budget Rescue

Family Plus and Household Pro users can create a 3-, 5-, or 7-day plan using:

- inventory already at home;
- food that should be used soon;
- days the household is away/eating out;
- household serving counts;
- an optional grocery budget;
- ingredients already on the active shopping list;
- saved price evidence when available; and
- My Recipes plus shared Community Recipes that are ready or nearly ready.

Unknown ingredient prices stay visibly unpriced instead of being invented. Missing ingredients can be moved to the grocery list in one action.

### 3. Receipt Guardian

Basic Home and above now include conservative receipt review for recent scanned receipts. It can flag:

- possible duplicate identical lines;
- line-total vs quantity/unit-price math worth checking; and
- unusual price jumps compared with recorded household history.

Every finding is worded as a **possible issue to verify**, never as an accusation that a retailer made an error. A neutral store inquiry can be copied from each finding.

### 4. Smart Stock-Up Intelligence

Family Plus and above can surface a stock-up suggestion only after sufficient real household history exists and the current saved price is meaningfully below that household's recorded median. Recommendations include:

- current vs typical recorded price;
- number of supporting observations;
- approximate purchase cadence when available;
- a conservative quantity recommendation;
- potential value; and
- a shelf-life/storage caution.

Fresh-food quantities are deliberately capped conservatively.

### 5. GHM Savings Ledger

The Savings Ledger separates **verified savings** from **open opportunities**.

Verified evidence currently includes reviewed receipt discounts and lower recorded prices actually chosen on completed shopping lists. Potential opportunities can include the strongest current trip comparison and eligible stock-up signals.

V91 avoids double-counting competing one-store/two-store strategies for the same trip, and it excludes stock-up opportunities for products already on the current optimized trip so the headline potential remains conservative.

Reports now includes the same evidence trail instead of presenting only abstract totals.

### 6. Food Recall Guardian

Recall screening remains available on the Free plan because important safety information should not be held behind a premium tier.

The app screens in-stock product information against the official Government of Canada food-alert feed and looks for conservative product/brand/barcode wording overlaps. A possible match always links to the official notice.

**Important:** a match is only a screening signal. Users must verify the exact product, UPC, lot/batch, size and other identifiers in the official recall notice before acting. Failure to find a match is not a guarantee that a product is safe.

### 7. Kitchen Check Beta

Household Pro adds a practical reconciliation beta using the OCR capability already installed in the backend.

Users can upload 1–4 fridge/freezer/pantry photos. The system reads visible package text and stored barcode text where possible, then compares those signals with expected inventory. It separates label-confirmed products from items that still need review.

This is intentionally **not presented as perfect computer vision**. An item not recognized in a photo is never automatically deleted and does not prove the item is gone.

### 8. Community Price Pulse

V91 introduces an opt-in local price network without silently making household receipts public.

- Sharing is **off by default**.
- Only the house owner can opt in/out.
- Only future **reviewed receipt prices** are contributed while sharing is enabled.
- Public signals contain product/store/price/date and coarse city/country context only.
- Other users never receive the contributing household ID or user identity.
- The internal source-house reference exists solely to support consent revocation.
- Turning sharing off deletes that household's prior contributions.
- Community prices are recent observations, not guaranteed current shelf prices.

Autopilot can use these observations to show local price evidence for products already on the active grocery list.

## Premium access in V91

### Free Starter
- Shared household essentials
- Basic inventory/list/meal workflows
- Community recipes
- Food Recall Guardian
- Savings Ledger / proof of value

### Basic Home
Everything in Free, plus:
- Receipt Guardian
- Receipt scans according to the existing plan limits
- Product lookup/private price memory

### Family Plus
Everything in Basic, plus:
- GHM Autopilot Weekly Planner
- Budget Rescue
- Automatic Trip Check / whole-trip intelligence
- Smart stock-up intelligence
- Family expense tools

### Household Pro
Everything in Family Plus, plus:
- Kitchen Check Beta
- Nearby-store / deeper household intelligence
- Higher receipt-scan allowance

Community Price Pulse contribution is a privacy choice, not a requirement to access the app.

## UX / visual consolidation

V91 keeps the professional V90 light/dark contrast system and extends it with a high-graphics Autopilot experience:

- command-centre hero and household control visualization;
- compact metric cards for value, opportunities, shopping and protection;
- weekly-plan editor designed around exceptions instead of repetitive data entry;
- graphical money/protection surfaces;
- full-width Community Price Pulse decision surface;
- premium lock states that explain the outcome being unlocked rather than simply showing disabled controls;
- a new house-home Autopilot summary card;
- public landing-page messaging centered on automation and measurable household value; and
- outcome-focused pricing descriptions.

The navigation label formerly exposed as Smart Assistant is now **Autopilot**, while the route remains compatible with existing links.

## Database / deployment

No new environment variable is required.

V91 adds:

- `houses.contribute_community_prices` (boolean, default false); and
- `community_price_observations` for privacy-protected contributed observations.

The existing startup table creation plus additive schema migration handles the new table/column for the project's PostgreSQL deployment flow.

Kitchen Check reuses the existing Tesseract/Pillow/pytesseract dependencies already declared in the backend image/requirements.

Normal deployment remains:

```bash
docker compose up -d --build
```

## Validation performed in this workspace

- 52 frontend `.ts`/`.tsx` source files passed TypeScript syntax/transpile validation.
- 44 backend Python modules passed `py_compile` validation.
- `frontend/src/styles.css` has balanced structure and parsed with zero top-level `tinycss2` errors.
- The final release ZIP is integrity-tested after packaging.

A complete local Vite/FastAPI runtime build could not be executed in this workspace because installed project dependencies (`node_modules` and Python `google-auth`) are not present here. Both are already declared in the project's lock/requirements files and are installed by the normal Docker/build process. This is an environment dependency limitation, not a hidden successful-runtime claim.
