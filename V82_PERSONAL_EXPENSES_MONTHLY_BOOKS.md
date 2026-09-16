# V82 — Personal Expenses, Monthly Books & Reimbursement History

V82 expands Shared Expenses into a clearer household finance dashboard.

## Automatic monthly books

Users do not create months manually. Every expense is grouped automatically by `expense_date` into a month such as `2026-09`.

Each month card shows:
- total house spend
- the signed-in user's share
- how much the signed-in user paid upfront
- number of expenses

Selecting a month filters the expense activity to that month. "All months" restores the complete history.

## Personal spending

"My expenses" is calculated from the user's `ExpenseShare.share_amount`, not from the full bill amount paid by that user. This avoids overstating personal spending when a user fronts a shared bill.

The current-month dashboard shows separately:
- House this month
- My share this month
- I paid this month
- My net position

## Insight ranges

Expense insights support:
- current month
- last 2 months
- last 4 months
- last 6 months
- last 12 months
- last 24 months
- all time

The user can switch between House expenses and My expenses, then view either category breakdown or month-by-month spending.

## Reimbursement history

Recorded reimbursements are shown as a permanent month-grouped timeline. Users can switch between reimbursements involving themselves and the full house history.

Reimbursements remain separate from expense analytics; they settle balances but do not count as household spending.
