# GHM V122 — Mobile, Chat & Sound Polish

## What changed

### Dark-mode readability
- Reworked Premium Try surfaces for real dark-mode contrast instead of white cards with pale text.
- Premium Try choice cards, clarity panel, house picker, confirmation panel, FAQ cards and related text now use dark surfaces and readable foreground colors.
- Selected Premium Try cards use a green-accented dark treatment with stronger contrast.

### House Chat
- Reduced chat viewport/composer height on desktop and mobile so chat no longer dominates the page.
- Aligned attach, message input and Send button in one compact row on mobile.
- Character count only appears when text exists.
- Reply now scrolls/focuses the message input automatically.
- Delete now opens a confirmation dialog before deleting the message.
- Reaction menu measures available viewport space and opens left or right as needed.
- Selecting a reaction immediately collapses the emoji picker.
- Message send, incoming message, reaction and delete actions have semantic sound feedback.

### App sounds
- Existing global sound preference remains available from the header and Settings & appearance.
- Added subtle delegated sound feedback for buttons, links and other actionable controls.
- Added a very short hover buzz for mouse/pen interactions after audio has been activated by user interaction.
- Added special sounds for messages, reactions, success/create-style moments, warnings and deletes.
- Sound preference also governs small haptic click feedback where the browser/device supports vibration.

### Mobile header
- Rebuilt the signed-in mobile brand layout so the logo sits on the left and “Grocery House Manager” appears directly to its right.
- Kept Ask GHM, language, sounds, theme and notifications as compact icons.
- Tightened spacing at narrow phone widths without hiding the brand name.
- Current-section strip remains on its own line to avoid overlapping the brand.

## Validation
- Backend Python compilation: pass
- Backend tests: 19 passed
- Frontend TS/TSX syntax transpile: 74 files pass
- CSS brace validation: pass
- Full local npm production build could not be completed because this sandbox's dependency install timed out; GitHub/Docker remains the authoritative dependency/type build.
