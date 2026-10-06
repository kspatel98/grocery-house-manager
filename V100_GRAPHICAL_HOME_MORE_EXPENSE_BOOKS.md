# V100 — Graphical Home, Richer More Hub & Flexible Expense Books

V100 keeps the existing detailed GHM workspaces and business logic intact. It applies the newer graphical direction only where it improves discovery and at-a-glance understanding, while adding a new expense-month bookkeeping workflow requested for real households.

## 1. Graphical Home without hiding information

- Adds a blue / cream / orange household overview to the authenticated **Home** tab.
- Inventory, shopping, receipts, and members remain visible in their own dedicated statistic grid.
- Decorative home/grocery artwork lives in a separate grid column, so it cannot overlap or cover statistics on desktop, tablet, or mobile.
- Existing Inventory Health, Household, Latest Receipt, tools, house access, Today, Money, and Activity functionality is preserved below it.

## 2. More is now a real mobile control centre

The mobile **More** sheet is grouped into graphical sections instead of a flat list:

- Household: Inventory, Kitchen Vision, Meals, Food Tonight, Templates
- Receipts & money: Receipt Scan, Receipt History, Expenses / Money
- Smart shopping: Prices & Flyers, Reports
- Account & app: Plans, Support, Privacy, Terms, Admin (when applicable)
- Theme, Language, and Profile remain directly accessible at the top.

No specialist workspace was replaced by the prototype version. The links still open the existing detailed GHM pages. Today, Plan, Shop, and Home stay in the persistent bottom navigation, while More is reserved for the specialist tools.

## 3. Flexible expense months

Expense **purchase date** and **accounting month** are now separate.

Example:

- On October 3, a household can still keep its active expense book on **September 2026** and add expenses there.
- When the household is ready, each user can switch their active posting month to **October 2026**.
- The active posting month is remembered per house on that user's device.
- Monthly cards group expenses by accounting month instead of forcing the month from the purchase date.

This lets a household close a month when it is actually ready, rather than exactly at midnight on the first day of the next month.

## 4. Owner month lock

House owners can **Lock month** / **Unlock month** from Monthly Books.

When a month is locked:

- members cannot add an expense to that month;
- existing expenses in that month cannot be edited;
- existing expenses in that month cannot be deleted;
- the locked state is enforced by the backend, not only the UI;
- reimbursements remain available because settlements may happen after a month is closed.

Only the house owner can lock or unlock an expense month. If a correction is needed later, the owner can temporarily unlock the month, make the correction, and lock it again.

## Database compatibility

V100 adds:

- `house_expenses.expense_month` (`YYYY-MM`)
- `expense_month_locks`

The existing compatibility migration backfills legacy expenses from `expense_date` and creates the required indexes. This is additive; existing expense, reimbursement, receipt-link, split, and insight data is not removed.

## Validation performed for this package

- Python compile checks passed for the modified backend modules.
- Existing backend test suite passed: **5 passed**.
- Modified TypeScript / TSX files passed TypeScript syntax transpilation checks.
- A complete `npm run build` could not be executed inside the artifact environment because the source ZIP does not include `node_modules` and the environment cannot resolve the public npm registry. Run the normal production frontend build during deployment (`npm ci && npm run build`) where registry access is available.
