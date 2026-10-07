# V108 — Account-scoped money + shopping completion + mobile polish

V108 is built directly on **V107 PgBouncer reliability**. It keeps the V107 database/PgBouncer reliability work and refines the signed-in product experience without removing existing GHM features.

## Money / expense accounts

- Reimbursements, balances, pending transfers, settlement history and expense activity now live inside the selected expense account instead of appearing as one house-wide money feed.
- Each account opens in its own focused route: `/houses/{house_id}/expenses/{YYYY-MM}`.
- The main Expenses screen is now for:
  - account creation mode,
  - account list,
  - cross-account statistics and insights.
- Account creation mode remains:
  - **Automatic** — GHM makes the current calendar-month account available when the household next loads Expenses after the month changes.
  - **Custom** — GHM creates nothing until an owner/admin creates the account.
- Accounts can be renamed, including names such as `HariDarshan Atmiya Trip`; the accounting period is retained for sorting and cross-account insights.
- Each account has an **Included people** setting.
  - Only included people can be selected as payer/share participants on **new** expenses in that account.
  - Owners/admins can edit the included people later.
  - A temporarily absent member can be deselected and added back when they return.
  - Removing a member never rewrites historical expenses.
  - Historical balances/reimbursements remain valid even if a member is temporarily removed from future expense entry.
- Owner-only account locking remains enforced by the backend.

## Shopping list completion

Removed the permanent “Bought these groceries? / Finish with receipt” banner from the Shopping page.

`Shopping done` now asks at the moment it matters:

1. **Scan receipt & finish** (recommended)
   - opens Receipt Scan with the shopping-list ID attached,
   - the receipt review compares the list to the receipt,
   - missing/extra items require confirmation,
   - confirmed purchase data is applied to inventory,
   - the shopping list is completed from the verified receipt flow.
2. **Finish without receipt**
   - uses the existing direct Shopping Done flow and updates inventory normally.

This avoids double-counting inventory and keeps the page cleaner.

## House Chat access

- A small persistent **House Chat** button now sits beside **Tell GHM** on house screens.
- Desktop shows the Chat label; mobile uses a compact circular chat action so it does not crowd the viewport.
- The existing More → House Chat route remains available.

## One-scroll app shell

- Removed page-level nested vertical scrolling from the signed-in shell so the browser/document owns the primary vertical scroll.
- Desktop navigation stays in the same document flow instead of creating a confusing second vertical scrollbar.
- Horizontal scrolling is retained only where it is intentionally useful, such as compact mobile list tabs.
- Chat history also follows the page scroll instead of creating another vertical scroll region.

## Visual consistency and dark mode

- Rounded previously square/harsh containers such as shopping-list tabs, shopping surfaces, Autopilot controls, expense-account surfaces and contextual food cards.
- Fixed dark-mode contrast for:
  - active shopping-list cards (including custom list names such as HariDarshan),
  - Shopping surfaces,
  - “Don’t feel like cooking?” / contextual food cards,
  - Autopilot household-control surfaces,
  - account/member surfaces.
- Dark cards use controlled lighter navy surfaces with bright headings and readable muted text instead of white-card/light-text collisions.

## Mobile-specific composition

V108 does not simply squeeze desktop layouts into a phone:

- tighter but consistent page/card spacing,
- horizontal shopping-list selector,
- compact 3-value shopping glance,
- sticky To Buy / In Cart stage controls,
- stacked Shopping Done action area,
- 2-column compact expense account KPIs,
- single-column participant editor,
- smaller Household Control / 100 score treatment in Plan,
- contextual food card reflow,
- compact Chat + Tell GHM floating actions with bottom-navigation safe space.

## Database changes

V108 adds:

- `expense_month_participants`
  - maps allowed/current participants to an expense account;
- `expense_settlements.expense_month`
  - scopes reimbursements to the account they belong to.

Existing accounts are backfilled with current house members. Existing reimbursements are assigned to their historical calendar month during the migration. The migration order also supports a fresh database install.

## V107 reliability retained

V108 keeps the V107 PgBouncer/database reliability configuration, including bounded SQLAlchemy pooling, pre-ping, recycle, TCP keepalive, real DB readiness checks, stale-pool disposal, 503 + Retry-After behavior and the 15-second browser API timeout.

## Build verification

After deployment, verify:

```bash
cat frontend/public/version.json
```

or from the running frontend container:

```bash
docker compose exec frontend sh -lc 'cat dist/version.json'
```

Expected build:

```text
V108
```

The More area also displays `GHM design build V108`.
