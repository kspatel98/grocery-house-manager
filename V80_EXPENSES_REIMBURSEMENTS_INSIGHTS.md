# Grocery House Manager v80 — Expenses, Reimbursements & Receipt-to-Expense UX

## Expense home redesigned

The Expenses page is now organized around the decisions a household actually needs to make:

1. **Your position** — immediately shows whether you owe money, are owed money, or are settled.
2. **Suggested reimbursements** — a personal view first, plus a separate whole-house view.
3. **Expense insights** — switch between category and monthly spending.
4. **Expense history** — a quieter, visual history with category icons.

The confusing global **Record payment** action has been removed from the customer UI.

## Reimbursements instead of manual payment recording

Suggested settlements are presented as reimbursement cards with payer/receiver avatars, direction, amount, and context. A user involved in a suggested reimbursement can confirm a full or partial reimbursement. Existing backend settlement records continue to power balances, but the customer-facing language is now reimbursement-focused.

## Smarter custom splits

Switching from Equal to Custom no longer creates blank amount fields.

- Every selected member starts with an equal share.
- When a user edits one member's amount, that amount becomes manually locked.
- The remaining amount is redistributed only among selected members whose amounts have not been manually changed.
- Editing another member locks that value too.
- Manually entered values are never overwritten by later automatic redistribution.
- A live total confirms whether the split matches the expense amount.
- **Reset equally** clears manual locks and restores an equal split.

## Visual expense categories

Built-in categories are graphical tiles instead of a plain select:

- Groceries
- Household
- Dining
- Utilities
- Transport
- Rent
- Health
- Entertainment
- Other

House members can create a custom category directly inside the expense form, choose an icon, and reuse it later. Custom categories are stored in the new `expense_categories` table.

## Expense insights

Users can choose:

- **By category** — spend, percentage and number of expenses per category.
- **By month** — month-by-month spend bars.

The insight range can be switched between 6 months, 12 months and all time. KPI cards show tracked house spend, the top category and monthly average.

## Receipt → shared expense handoff

After a scanned receipt is reviewed and saved, Grocery House Manager now asks:

**Add this receipt to shared expenses?**

If the user chooses yes, the expense form opens with:

- receipt linked,
- receipt total prefilled when available,
- receipt date/store context,
- Grocery category,
- the receipt uploader selected as payer (when still a house member),
- all current house members selected,
- equal split ready to review.

The user can edit everything before adding the expense. Choosing **Not now** finishes the receipt flow with no expense created.

A receipt can only be linked to one shared expense, preventing accidental duplicate expense entries.

## Database addition

`expense_categories` is created automatically by the existing SQLAlchemy `Base.metadata.create_all()` startup behavior.

## Deployment validation

- Backend Python compilation passes.
- All frontend TS/TSX files pass TypeScript parser syntax validation.
- Localization catalog duplicate-key scan passes.
- CSS structure is checked before packaging.
- Full npm dependency installation still depends on registry availability, so run `npm ci && npm run build` in your normal local/server environment before production deployment.
