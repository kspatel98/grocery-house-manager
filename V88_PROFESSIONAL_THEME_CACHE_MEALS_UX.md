# V88 — Professional Theme, Cache, Meals & UX Pass

This release is a coordinated polish pass on top of v87. It preserves the v84.1 production `/api` routing fix, the v85 graphical dashboard and receipt workspace, the v86 collapsible desktop sidebar, and the v87 retention/review features.

## Navigation and branding

- Every Grocery House Manager logo in the authenticated shell now links to `/`, the full public product website, rather than `/houses`.
- The authenticated mobile header was reduced to three calm elements: logo, current section, and account avatar.
- Premium status, language, and theme controls were moved into the mobile **More** sheet so the top bar stays clean.
- Logo artwork is placed on a neutral high-contrast tile in both light and dark themes.

## Light / dark theme everywhere

- Added a shared persistent theme service (`frontend/src/theme.tsx`).
- Theme initializes before React renders to avoid a bright flash when a user prefers dark mode.
- Dark mode is available on the public website, before login, on login/registration, and throughout the authenticated app.
- Added a broad contrast pass across cards, panels, tables, forms, modals, navigation, marketing pages, expense views, meal cards, receipt views and mobile navigation.
- Theme choice persists in `localStorage` and mirrors the older v87 key for compatibility.

## Login and registration

- Rebuilt authentication as a graphical two-panel product entry experience on desktop/tablet.
- The left panel explains the connected household workflow; the right panel contains login/registration/recovery.
- Mobile uses a simplified single-card layout.
- Password reset, Google sign-in, registration confirmation and invite return flow remain intact.

## Expenses

- Removed the mobile floating **Add Expense** action that could jump after refresh/scroll.
- Kept one deliberate primary Add Expense action in the expense hero.
- Removed the duplicate Add button from the Activity header.
- Expense Edit/Delete actions are now compact graphical controls.
- Existing edit behavior, custom splits, receipt links, reimbursements and ledger recalculation are preserved.

## Shopping price status

- **Checking prices…** is orange and animated only while a request is active.
- Completed checks stop animating and become a green **Prices checked** status.
- Ready state is neutral.
- Reduced-motion accessibility disables the pulse animation.

## Flyer list cards

- “Flyer deals for your list” is now a compact quick-glance grid rather than tall mini detail pages.
- Desktop/tablet cards use a horizontal image + details layout.
- Mobile cards are shorter while retaining store, price and open-details affordance.
- Full details remain in the existing flyer modal.

## Cost-saving caches

### Canadian price comparison

The existing PostgreSQL `ExternalPriceCache` is now used more conservatively:

- Default cache: **24 hours** (`APIFY_PRICE_CACHE_HOURS=24`).
- Automatic shopping checks and normal “Check again” actions reuse valid cache.
- Even an explicit forced refresh is protected from repeat paid calls inside the configured cooldown (`APIFY_PRICE_FORCE_REFRESH_MIN_MINUTES=30`).
- Cache key includes normalized items, location/postal code, retailers, actor and output mode.

### Product lookup

Product lookup now also uses PostgreSQL `ExternalPriceCache`:

- Store-specific product results: **24 hours** by default.
- Universal product metadata (Open Food Facts): **30 days** by default.
- Successful results and “no result” responses are cached, preventing repeated external lookups for the same normalized query.
- Responses identify when cached data is being reused and show the reuse expiry in the UI.

Environment controls:

```env
APIFY_PRICE_CACHE_HOURS=24
APIFY_PRICE_FORCE_REFRESH_MIN_MINUTES=30
PRODUCT_LOOKUP_STORE_CACHE_HOURS=24
PRODUCT_LOOKUP_UNIVERSAL_CACHE_HOURS=720
```

## Meal photography

- All 61 built-in recipes now render with a real photographic food image rather than falling back to graphical recipe SVGs.
- Exact local dish photos take priority for meals that have them.
- Every remaining recipe receives a high-quality cuisine-appropriate photographic fallback.
- TheMealDB exact-photo enrichment remains lazy-loaded; confident exact matches replace the fallback and the image URL is stored in `localStorage` so the app does not repeatedly look it up on later sessions.

## Validation

- Backend Python bytecode compilation passed.
- Reimbursement regression tests: 3/3 passed.
- 53 TypeScript/TSX source files parse with zero syntax diagnostics.
- CSS braces balanced.
- 675 localization literal keys checked with zero duplicates.
- 61 built-in recipe declarations checked with 61 unique IDs.
