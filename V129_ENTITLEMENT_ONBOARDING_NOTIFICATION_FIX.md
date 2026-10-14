# GHM V129 — Entitlement truth, onboarding clarity, notification focus

## Fixed from the V128 review video

### Free Starter entitlement enforcement
- Ask GHM Household Intelligence now requires Family Plus or Household Pro.
- Free Starter owners may choose Ask GHM as their one complimentary Premium Try.
- Household expenses / reimbursements now require Family Plus or Household Pro at the backend API layer.
- More-page cards now clearly show locked premium tools and route users to Premium Try or Plans instead of silently opening everything.
- Main navigation / header shortcuts now respect plan access for Ask GHM, Plan and Smart Receipt Scan.
- The Household Money tab clearly shows Family Plus access rather than exposing expense data on Free Starter.

### Onboarding corrected for Free Starter
- Free onboarding no longer asks users to complete Smart Receipt Scan or Kitchen Vision.
- The first household signal is now free-only: add starter groceries, with shopping-list exploration available alongside it.
- Premium workflows are introduced only after the free household setup has useful real context.

### Notification result handling
- Ask GHM background-result focus now recognizes the V125+ `.v125-ghm-message` result card.
- A ready-result notification is removed after the linked result actually opens/focuses.
- Opening the bell alone still does not count as opening a background result.

### Dark-mode readability
- Added explicit dark-mode treatment for V128 onboarding cards and selected states.
- Fixed the floating Quick Start coach, which previously used hard-coded light colors in dark mode.

### Pricing truth
- Added Ask GHM Household Intelligence to Family Plus plan access and the one-time Premium Try choices.

## Validation
- Backend tests: 19 passed
- Backend Python compile: passed
- Frontend TS/TSX syntax transpile: 75 files, 0 syntax errors
- Duplicate object-literal scan: 0 duplicates

No database migration is required.
