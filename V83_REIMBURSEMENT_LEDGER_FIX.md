# V83 — Correct Reimbursement Ledger

## Why the screenshot showed $40.83 / $1.67 / $8.75

From the four visible expenses alone the correct balances are:

- Kartik: +$58.75 (should receive)
- Devil: +$8.75 (should receive)
- Nainesh: -$16.25 (owes)
- Jay: -$51.25 (owes)

The screenshot's balances are exactly what the ledger becomes after a **confirmed net reimbursement of $17.92 from Nainesh to Kartik** is applied:

- Kartik: $58.75 - $17.92 = $40.83
- Nainesh: -$16.25 + $17.92 = +$1.67
- Devil: +$8.75
- Jay: -$51.25

V83 therefore fixes two things: exact reimbursement math and transparency around previously recorded reimbursements.

## Exact-cent accounting

All balance and reimbursement calculations now use integer cents. The ledger formula is:

`net = amount paid for house - personal shares + confirmed reimbursements sent - confirmed reimbursements received`

The backend validates that the full ledger remains zero-sum before it creates reimbursement suggestions.

## Suggested plan for the sample

With no prior reimbursements, a valid simple plan is:

- Nainesh -> Kartik: $16.25
- Jay -> Kartik: $42.50
- Jay -> Devil: $8.75

After those three transfers every person's net balance is exactly $0.00.

## Safer reimbursement workflow

Suggested reimbursements no longer change balances immediately.

1. The debtor taps **Mark as sent**.
2. The transfer becomes **Pending** and is removed/reduced from new suggestions so it is not paid twice.
3. The receiver taps **Confirm received**.
4. Only then does the reimbursement change the accounting balance.

Pending transfers can be cancelled. Confirmed transfers can also be corrected/cancelled by an involved member or a house owner/admin; the row remains in history as cancelled so the audit trail is preserved.

## Balance calculation cards

Expenses now show a transparent member-by-member balance audit:

- Paid for house
- Personal share
- Confirmed reimbursements sent
- Confirmed reimbursements received
- Pending sent/received
- Net balance

This makes it immediately clear when an old reimbursement record—not the expense split—is affecting a suggested payment.
