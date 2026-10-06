# V101 — Feature education & discovery

This release keeps the existing GHM workflows intact and adds a benefit-first explanation system so users can understand why a feature exists without turning every screen into a manual.

## What changed

### 1. First-use “Why this exists” cards
A dismissible first-use guidance card now appears on the major detailed workspaces:
- Inventory
- Shopping Lists
- Receipt Scan
- Receipt History
- Meals & Recipes
- Expenses
- Prices & Flyers

The card explains the outcome first and can be dismissed with **Got it**. Dismissal is remembered locally per feature.

### 2. Permanent contextual “Why?” access
Important screens and intelligent sections keep a small **ⓘ Why?** action even after the first-use card is dismissed. The explanation opens in a focused modal with:
- the household problem being solved;
- the user benefit;
- a short explanation of how the feature works;
- a concrete example;
- a link to the full **How GHM helps** guide.

Contextual explanations are included for:
- Inventory
- Shopping Lists
- Receipt Scan
- Receipt History
- Meals / Cook from Home
- Flyers
- Price comparison / whole-list intelligence
- Shared expenses
- Expense monthly books
- Suggested reimbursements

### 3. New “How GHM helps” guide
A new authenticated route is available at:

`/learn`

The guide is organized around household problems rather than feature names, including:
- forgetting what is already at home;
- duplicate or unnecessary shopping;
- manual receipt entry;
- grocery waste and meal planning;
- browsing too many flyers;
- changing grocery prices;
- unclear shared balances;
- finishing an old expense month after the calendar changes;
- locking finished expense months;
- reimbursement confusion.

Each card links directly to the relevant working GHM feature.

### 4. Discoverability in Home and More
The authenticated Home tab now includes a graphical **Discover why GHM features exist** strip linking to the guide.

Mobile More now includes a prominent **Discover what GHM can do** card. Desktop Tools also includes **How GHM helps**.

### 5. Expense education reflects V100 monthly books
The new explanation specifically teaches users that:
- the active expense month is chosen by the household, not forced by the current calendar month;
- an open September book can continue to receive expenses after October starts;
- the household can switch to October whenever ready;
- the house owner can lock a finished month to prevent accidental additions, edits or deletions;
- suggested reimbursements use the full ledger rather than treating each expense independently.

## Design rule used

**Benefit first → mechanism second → deeper detail only on demand.**

This keeps everyday screens fast while making GHM's deeper intelligence understandable to new users.

## Validation

- TypeScript/TSX syntax transpile validation passed for the modified source files and the full frontend source tree (excluding `.d.ts`).
- `theme-v101.css` parses with no CSS parser errors and references only defined GHM theme variables.
- Backend compile check passed.
- Existing backend test suite: **5 passed**.
- A full `npm run build` still requires project dependencies (`node_modules`); the source archive does not contain them and the execution environment could not complete an offline `npm ci` because one package was not cached.
