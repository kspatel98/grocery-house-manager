# V95 — Calm Household OS

V95 is a product-structure release. It deliberately adds very little visible complexity. The goal is to make the existing depth feel calm, premium, understandable and worth returning to.

## 1. Four primary mental models

Authenticated navigation is consolidated around:

- **Today** — what matters now
- **Plan** — weekly meals, household planning and Autopilot
- **Shop** — the active grocery trip
- **Home** — household health, people, receipts and access to deeper tools

Inventory, Meals, Receipt Scan, Receipt History, Expenses, Prices/Flyers, Templates, Reports, Plans, Support, Privacy and Terms remain available under **Tools / More** instead of competing for permanent navigation space.

## 2. New household decision cockpit

The previous large dashboard is replaced by a focused household operating view with four tabs:

- **Today**
- **Home**
- **Money**
- **Activity**

### Today
Shows only:
- one primary action;
- next-trip count;
- use-before-expiry count;
- expired-item count with explicit review/discard language;
- verified savings;
- three next-step shortcuts;
- a conservative value-proof card.

### Home
Shows:
- inventory health;
- connected household members;
- latest receipt;
- invite action;
- a collapsed specialist-tools drawer;
- protected house access controls.

### Money
Shows:
- current month household spending;
- the current user's share/paid/position;
- verified savings;
- open opportunities;
- direct links to expenses, reports, shopping intelligence and prices.

### Activity
Shows shared household activity in one focused view.

## 3. Autopilot workspaces instead of one endless page

Autopilot is split into five workspaces:

- **Today** — next action and predictive restock
- **Intelligence** — Digital Twin + Ask GHM
- **Plan** — weekly plan, meals and budget
- **Shop smarter** — choice-aware trip options, price intelligence and savings ledger
- **Protect** — Receipt Guardian, recalls and Kitchen Vision

Only the selected workspace is rendered visually, while all existing features remain available.

## 4. Simpler language

High-complexity labels were reduced where possible:
- "Household Grocery CFO" UI language becomes **Smart Spending** where appropriate.
- Digital Twin remains visible as the technical foundation, but the user-facing section is **Household Intelligence**.
- The Agent action is simply **Ask GHM**.
- Weekly planning is presented as **This week · meals + budget**.

## 5. Luxury app-shell cleanup

- Authenticated pages no longer repeat the large marketing/footer blocks after every workflow.
- Desktop top navigation is removed when the full sidebar is available.
- Specialist tools are collapsed by default.
- Current workspaces use stronger spacing, hierarchy and high-contrast cards.
- Mobile remains a five-item navigation: Today / Plan / Shop / Home / More.
- New V95 dark-mode surfaces use the established dark green premium palette rather than isolated white cards.

## 6. Performance

All route pages are now loaded with `React.lazy()` and `Suspense`, reducing the amount of page code that must be loaded up front.

## 7. Business product-health analytics

V95 begins collecting **privacy-light product events** for business health rather than relying on registration counts alone.

Tracked event categories include:
- page view (deduplicated per route for ten minutes);
- shopping completed;
- receipt saved;
- meal plan built;
- Kitchen Vision changes applied;
- review submitted;
- template applied.

It does **not** store message contents, receipt contents, grocery-list contents or AI conversation text.

Admin now shows:
- active users: 1 day / 7 days / 30 days;
- new users in 30 days;
- 24-hour activation rate;
- D1 / D7 / D30 retention when cohorts are old enough;
- successful product actions in the last 30 days.

The Privacy Policy was updated accordingly.

## 8. Release quality gate

A GitHub Actions workflow was added at:

`.github/workflows/quality.yml`

It runs:
- Python compilation;
- backend unit tests;
- frontend dependency installation;
- TypeScript/Vite production build.

A local helper is also included:

`./scripts_validate_release.sh`

## 9. Safety retained

- Expired food remains excluded from meal readiness and should be reviewed/discarded, not suggested for consumption.
- Use-soon food means food that is still within its expiry date.
- Savings continue to distinguish verified value from potential opportunities.
- Kitchen Vision remains review-before-apply.
- Price/receipt/recall signals remain decision support rather than unsupported guarantees.

## Validation performed in this workspace

- Backend Python modules compile successfully.
- Existing backend tests: **3 passed**.
- SQLAlchemy metadata successfully creates **28 tables** in an in-memory database, including V95 `product_events`.
- **53 TS/TSX source files** passed syntax/transpile validation.
- CSS parsed with **0 top-level structural errors** and balanced braces.
- A full npm production build could not be completed in this workspace because dependency installation timed out and left incomplete `node_modules`; the CI workflow will run the authoritative `npm ci && npm run build` in a normal networked environment.
- Full FastAPI import in this host environment is blocked by missing host-level `google-auth`; the project already declares `google-auth==2.37.0` in `backend/requirements.txt`, so Docker/CI installs it normally.
