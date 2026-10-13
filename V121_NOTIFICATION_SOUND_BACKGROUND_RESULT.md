# GHM V121 — Notification sound + background result return

## What changed

### Long-running work is now obvious
Potentially slow GHM workflows now trigger a centered modal when background work starts. The modal clearly says the task may take longer than 45–50 seconds and gives two choices:
- **Stay here**
- **Explore GHM**

The task keeps running either way.

### Notification sound + sound settings
GHM now has short, non-verbal sounds for:
- background result ready
- background task failure
- successful completion of selected important workflows
- start/navigation feedback where appropriate

A speaker icon is available in the authenticated header. Users can mute or re-enable sounds at any time.

The same preference is available under **More → Settings & appearance → GHM sounds**.

### Unread notification count is no longer cleared by opening the bell
Opening the notification panel does **not** mark result notifications as read.

For a completed background result, the unread badge stays until the user opens the linked result and the result itself is successfully rendered/focused.

### Clicking a ready result now returns directly to it
Background result links carry their task ID. Once the saved result is hydrated, GHM:
1. scrolls the exact result into view,
2. focuses/highlights the result,
3. only then marks that notification opened.

This works for:
- Household Intelligence
- weekly household plan generation
- Smart Receipt Scan
- Kitchen Vision
- Canadian live price comparison
- whole-list basket comparison

### Result persistence / duplicate-search protection
Completed results are kept in the running app and persisted to local storage, with session storage as a fallback.

Same-page notification links now rehydrate when the `bgTask` query changes. Whole-list comparison no longer starts another lookup just because a saved background result is still restoring.

## No database migration
V121 is a frontend/background-workflow refinement. No database migration is required.
