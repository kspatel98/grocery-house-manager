# V71 — Effortless UX / Business-Ready Release

V71 is a focused usability release. It does not add another major feature area; it makes the existing product easier for first-time users to understand and faster for returning users to operate, especially on mobile while shopping.

## New-user experience

- The product explains **Grocery Home / House** as the user's private shared grocery space at the point where that concept first matters.
- First-time setup is reduced to four real actions:
  1. Create or join a Grocery Home.
  2. Add five groceries.
  3. Create the first shopping list.
  4. Invite someone who shops with the household.
- Setup shows one next action at a time and advances automatically as the account changes.
- A small cross-page setup coach follows the user until setup is complete, so they do not have to return to the Houses page after every step.
- Joined household members are handled correctly; they are not prompted to create another Home simply because they are not the owner.
- During setup, promotional/secondary content is reduced so the core workflow remains the focus.

## Returning-user experience

- Houses/Home and Smart Assistant now emphasize **“What should I do today?”** instead of presenting every feature with equal importance.
- The recommended action prioritizes meaningful household events such as expired/use-soon products, low/out-of-stock groceries, an active shopping trip, or a meal that can already be made.
- Smart Assistant remains the intelligence layer, but presents actions before supporting detail.

## Navigation

- Desktop navigation focuses on the everyday workflow: **Home, Inventory, Shopping, Assistant**.
- Prices, Reports, Plans, Support, receipt history, and other secondary tools are grouped under **More** where appropriate.
- Mobile now has a persistent bottom navigation designed for one-handed use: **Home, Inventory, Shopping, Assistant, More**.
- Mobile More opens a compact action sheet with secondary destinations rather than overcrowding the top header.
- The existing premium crown, Premium badge, award animation, and fixed-header behavior are preserved.

## Inventory and shopping

- Empty inventory now teaches the first useful action instead of looking unfinished.
- New households see progress toward adding the first five groceries.
- Shopping is presented as the in-store checklist rather than a technical list-management screen.
- After **Shopping done**, the app recommends scanning the receipt so real purchase prices and spending can be recorded automatically.

## Empty states and wording

- Reports, Receipt History, Prices, Inventory, and other data-dependent areas now explain how to create the missing data and provide a direct next-step button where possible.
- Customer-facing wording avoids implementation terms such as backend configuration, environment variables, build coverage, and internal price-history terminology.
- Price results prefer natural wording such as “items found,” “current price,” “from a recent receipt,” and “prices remembered.”
- If Google sign-in is not configured, customers see a normal fallback message instead of an environment-variable instruction.

## Business-ready philosophy

The intended product flow is now:

**Set up Home → Add what you own → Build a shopping list → Shop → Scan receipt → Let the Assistant tell you what matters next.**

Advanced functionality is still available, but it is no longer given the same visual weight as the next action a customer actually needs.

## Deployment

No new V71 environment variables are required. Deploy using the same production configuration as V70.

After deployment, test at minimum:

- a brand-new account through all four setup steps;
- an invited member joining an existing Home;
- mobile bottom navigation on iPhone and Android widths;
- shopping completion followed by receipt-scan handoff;
- empty Reports, Receipt History, Prices, and Inventory states;
- existing premium crown/badge and jackpot-award behavior;
- Stripe checkout and existing V69/V70 integrations.

## Validation in the source package

- Backend Python source compiles successfully.
- Frontend TS/TSX source passes syntax parsing.
- The full stylesheet parses without CSS syntax errors.
- A complete production `npm run build` still requires the frontend dependencies to be installed from npm; dependency installation was not available reliably in the packaging environment.
