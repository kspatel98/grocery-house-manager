# Grocery House Manager v83

- Rebuilt shared-expense balance calculations using exact integer cents.
- Added zero-sum integrity checking before reimbursement suggestions are generated.
- Added a transparent member balance calculation panel.
- Changed reimbursements to a safer sent -> receiver-confirmed workflow.
- Pending reimbursements do not change balances but do reduce duplicate suggestions.
- Added cancellation/correction support while preserving reimbursement history.
- Existing reimbursement rows are migrated as confirmed and remain visible/correctable.
- Added regression coverage for the four-member $175 sample reported in v82.
