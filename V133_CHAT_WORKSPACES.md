# V133 — Final chat workspaces

## Ask GHM
- User avatar is shown on every user message, matching the existing GHM avatar treatment.
- Composer remains the final row of the full-height chat layout and is flush to the bottom edge.
- Context picker opens upward as a bounded popover and uses responsive columns, preventing right-side clipping.
- Only the middle conversation pane scrolls; focus/scroll operations cannot move the composer.

## House Chat
- Rebuilt as a full-height chat workspace using the same architecture as Ask GHM.
- App header remains at the top, conversation is the only scroll pane, composer is the bottom row.
- Both the current user and other household members display profile avatars when available, with initials fallback.
- Quick household links remain available at the start of the scrollable conversation instead of consuming permanent screen height.

## No database migration
All changes are frontend/layout only.
