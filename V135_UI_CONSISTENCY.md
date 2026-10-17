# V135 — UI Consistency Pass

- Removed desktop Quick add from the app header; Tell GHM remains the quick-capture surface.
- Forced Ask GHM mobile workspace to use the same full-height chat contract as House Chat, with the composer directly above the bottom nav and no page padding/gap below it.
- Removed duplicate Shopping/Meals actions from the House Chat intro; the existing context strip remains the single shortcut row.
- Improved own-message time/Reply contrast in House Chat light mode.
- Rebuilt inventory card media behavior:
  - desktop media is exactly two filled halves: product image and GHM brand;
  - mobile shows product image only;
  - product images use `contain` so they are fully visible rather than abruptly cropped.
- Restyled TheMealDB and user-created recipe cards to match the richer Cook from Home/local recipe visual language.
- No backend or database migration changes.
