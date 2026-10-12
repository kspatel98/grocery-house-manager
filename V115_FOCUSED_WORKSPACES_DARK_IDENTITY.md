# GHM V115 — Focused Workspaces, Graphite Dark Mode, Identity Confidence

V115 builds on the V114 provider stack and keeps all V114 benchmark tooling.

## Desktop shell
- Left navigation and main content now scroll independently on desktop.
- The main desktop header is sticky inside the main content scroll area.
- The browser body no longer becomes the desktop app's primary scroll container.

## Header notifications
- Added a notification bell to the top-right desktop and mobile headers.
- Shows general/admin offers, personal account offers, and an unused Premium Try when available.
- Unread state is retained locally and cleared when the notification center is opened.

## Tell GHM
- Removed the separate **Say it** shortcut.
- Voice input now lives as a microphone button in the bottom-right corner of the Tell GHM message box.
- Listening state is visible directly in the composer.

## Shop / grocery lists
- Removed Recent Activity from Shop and stopped fetching `/activities` for this screen.
- Shop is now a clean library of active grocery lists.
- Opening a grocery list launches a focused full-screen workspace with its own internal scroll.
- New-list creation uses the same focused workspace.
- `?list=<id>` deep links still open a specific list directly.
- Whole-list comparison, Instacart handoff, shopping controls, and smart suggestions remain inside the focused list workspace.

## Dark mode
- Replaced the previous blue/navy cast with a graphite + moss + warm amber palette.
- Increased text, muted text, border, input, and button contrast.
- Added overrides for older blue feature cards so dark mode feels consistent across the app.

## Product identity quality
- Universal lookup no longer stops at the first Open Food Facts result.
- Weak identities are corroborated with UPCDatabase.
- Serper can supply barcode web-evidence candidates when the first two sources remain weak.
- Results are normalized, merged, ranked, and exposed as Verified / High confidence / Possible / Unconfirmed.
- Low-confidence products require an explicit user confirmation before inventory add.
- Universal product identity cache default increased from 30 days to 1 year.
- DataForSEO was intentionally not added.

## Validation
- Python compile check: backend app passes.
- Product identity unit tests cover quantity normalization, source corroboration, and prevention of false Verified status from one sparse source.
