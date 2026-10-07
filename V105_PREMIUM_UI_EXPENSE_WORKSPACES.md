# V105 — Premium UI System, Expense Workspaces & Household Coordination

V105 is a refinement release. It intentionally keeps GHM's mature specialist features and concentrates on making the product calmer, more consistent, more readable, and more premium on mobile and desktop.

## 1. One visual system across GHM

V105 introduces a shared spacing, radius, typography, touch-target, surface and contrast system in `frontend/src/theme-v105.css`.

Key changes:
- consistent page edge spacing and card padding;
- consistent section gaps and 44 px minimum touch targets;
- calmer card shadows/borders and fewer competing surface styles;
- mobile bottom navigation and floating capture controls reserve their own safe area;
- desktop sidebar/topbar are cleaner, quieter and more deliberate;
- signed-in app screens no longer compete with public-site marketing chrome;
- modals use a consistent desktop dialog and mobile bottom-sheet pattern.

## 2. Proper dark mode + appearance chooser

`/appearance` now lets the user choose:

**Appearance**
- System
- Light
- Dark

**GHM visual style**
- Classic GHM
- Calm
- Vibrant

Dark mode uses its own semantic surface hierarchy (page, surface, raised surface, field, border, primary/secondary text) instead of inheriting light-mode colors. Success/warning/error meanings stay consistent across visual styles.

## 3. Why dialogs are shorter and readable

The repeated “Benefit first. Details when you need them.” panel has been removed.

The new pattern is:
1. Why GHM does this
2. Why this helps
3. How it works
4. Example (when useful)
5. Got it / How GHM helps

The benefit block now uses explicit high-contrast foreground/background colors, and mobile dialogs have correct margins, padding, close controls and safe-area spacing.

## 4. Expenses are now organized as workspaces

The default Expenses screen no longer shows every detailed module at once.

It has four focused views:
- Overview
- Balances & reimbursements
- Insights
- Activity

### Separate monthly expense-book views

Every monthly book opens its own focused URL/view:

`/houses/:houseId/expenses?month=YYYY-MM`

The month view contains only that month's:
- house spend;
- user's share;
- amount paid by the user;
- expense activity;
- category breakdown;
- month status and owner lock controls.

The existing flexible month behavior is preserved: a household can keep September as its active posting month after October begins, then intentionally switch later. The house owner can lock a completed month to prevent accidental additions/edits/deletions.

Reimbursements remain house-level and live in the dedicated Balances & reimbursements view rather than being mixed into every month page.

## 5. Desktop refinement

Desktop now gets the same intentional product design as mobile:
- 272 px premium sidebar with clearer groups and active states;
- restrained sticky topbar;
- Quick add, Ask GHM, Receipt Scan and Appearance actions close to the user;
- wider content canvas with consistent max width and gutters;
- less unnecessary marketing/footer chrome inside the signed-in workspace;
- modal sizes and content density optimized for desktop instead of stretching mobile layouts.

## 6. Universal Quick Capture

The existing capture experience is formalized into a consistent quick-action surface for:
- Tell GHM
- Inventory
- Shopping
- Receipt Scan
- Expense
- Meal

Desktop can open the same capture experience from the topbar.

## 7. Weekly Household Report

Reports now include a simple seven-day household summary built from data GHM already owns:
- receipts scanned;
- household expenses;
- completed shopping trips;
- low-stock / use-soon attention;
- house chat / household activity;
- estimated savings.

This is deliberately a summary layer, not a new data-entry feature.

## 8. Focused House Chat

V105 adds a lightweight House Chat at:

`/houses/:houseId/chat`

The goal is household coordination around GHM, not a general social messenger.

It supports:
- persistent household text messages;
- member attribution;
- deletion by the author or house owner/admin;
- quick links into Shopping, Meals, Receipts and Expenses;
- desktop and mobile layouts;
- chat activity included in the weekly household report.

Generic activity feeds exclude chat messages so conversation does not flood normal household activity history.

## 9. Cache / deployment verification

The service-worker shell is now:

`ghm-shell-v105`

Mobile More and the household switchboard show `GHM design build V105` so the deployed frontend can be verified visually.

Recommended deployment:

```bash
docker compose down
docker compose build --no-cache frontend backend
docker compose up -d
docker compose ps
```

## Validation performed for this release

- Python backend compilation: PASS
- Backend automated tests: 9/9 PASS
- Modified TypeScript / TSX syntax diagnostics: PASS
- V105 CSS parsing / brace validation: PASS

A complete production `npm run build` still requires the project's normal npm dependencies (`node_modules`) in the deployment/build environment.
