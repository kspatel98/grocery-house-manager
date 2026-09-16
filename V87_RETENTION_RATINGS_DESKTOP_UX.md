# V87 — Retention, Reviews & Desktop UX

This release turns the product feedback into practical UX improvements without adding onboarding friction.

## Desktop shell
- Collapsible left sidebar on laptop/desktop.
- Collapse state persists across reloads.
- Account remains pinned at the bottom.
- Full navigation is available in expanded mode; compact icon navigation in collapsed mode.
- Dashboard/content widths are constrained to the available viewport so the home page no longer spills horizontally.

## Dark mode
- Persistent Light / Dark mode toggle in desktop sidebar and mobile More sheet.
- Authenticated workspace, cards, forms, dashboard, receipt UI and navigation receive dark-surface styling.

## Intelligent reviews
- Review requests are success-triggered rather than random interruptions.
- Current triggers: completing a shopping trip and successfully saving/reviewing a receipt.
- Prompts are throttled for 14 days and do not appear to a user who already has a review.
- User can choose Maybe later or Don't ask again.
- Review CTA routes directly to the existing in-app review area.

## Household contribution / adoption
- New Household Momentum panel ranks recent helpful household actions over the last 7 days.
- Only positive contribution counts are shown; no negative scores or shaming.
- Uses real activity data from inventory, shopping and receipts.

## Invite flow
- Invite links now survive authentication: opening /join/<token> while logged out sends the user to login and returns them to the same invitation afterward.
- Member drawer exposes Create invite, Share invite and Copy link actions.
- Native Web Share is used where supported.

## Shareable wins
- New Share Household Win card on the house dashboard.
- Builds a branded 1080×1350 PNG in the browser using real household counts and latest receipt total when available.
- Uses native file sharing where supported; otherwise downloads the card and copies a caption.
- Private balances and member emails are not included.

## Receipt scan UX
- Added clear photo-quality guidance before OCR: even lighting, full receipt edges, flatten wrinkles and readable text.
- Existing review-before-save safety remains unchanged.

## Existing capabilities preserved
- V84.1 production /api routing hotfix.
- V85 graphical dashboard and receipt workspace.
- V86 left-sidebar layout.
- Weekly flyer intelligence, recipes, expenses, reimbursements, receipt reconciliation and localization.
