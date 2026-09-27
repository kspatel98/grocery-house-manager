# Grocery House Manager V96 — Household Intelligence & Kitchen Map

V96 focuses on making Grocery House Manager easier to understand, more trustworthy, and more useful without exposing more complexity. It keeps the V95 calm navigation model while strengthening the household-data loop underneath it.

## Product direction

The public and signed-in experience now centers on a simple promise:

**Know what you have → know what needs attention → plan around real life → shop smarter → learn from what actually happened.**

The app keeps specialist tools available without placing them all in front of a normal household user at once.

## Public website and SEO

- Rebuilt the public homepage around outcomes instead of a feature dump.
- Added a clear closed-loop explanation of how receipts, kitchen scans, meals and shopping feed household intelligence.
- Added dedicated public routes for:
  - How GHM works
  - Trust & Accuracy
  - Autopilot
  - Kitchen Vision
  - Household Intelligence
  - Receipt Scanner
  - Meal Planning
  - Grocery Price Intelligence
  - Shared Households
  - Household Expenses
  - Flyers
  - Savings
  - Families
  - Roommates
  - Couples
- Added route-aware title, description, Open Graph metadata and canonical URLs.
- Added `robots.txt` and a public `sitemap.xml`.
- Added family, roommate and couple scenarios so visitors can understand the product without studying feature lists.
- Added consistent evidence labels: **Verified / Estimated / Prediction / Needs review**.
- Added a public Trust & Accuracy story explaining uncertainty, approval boundaries, expiry handling and savings evidence.

## Calm onboarding

House creation can now identify the home as:

- Family
- Roommates
- Couple
- Just me
- Other

The underlying product stays the same, but guidance changes to fit the household. Existing house owners can change the household style later.

The first-run path is now only three steps:

1. Create or join a home.
2. Teach GHM what is at home by adding a few products or scanning a receipt.
3. Start the first shopping trip.

## Shared vs personal household products

Inventory products can now be:

- **Shared household**
- **Personal**
- **Selected members**

This allows roommates, couples and families with different diets or personal-care items to keep one household without pretending every product belongs to everyone.

Inventory can filter by ownership scope, and the product editor supports member selection when needed.

## Kitchen Map

Kitchen Vision no longer assumes that all groceries sit neatly in one pantry.

Each house can have real storage areas such as:

- Fridge
- Freezer
- Pantry / cupboard
- Counter / rack
- Custom areas such as “Snack shelf”, “Garage freezer” or “Baking cupboard”

### Quick Scan

Use when standing near one storage area. The scan confirms what it can see and avoids strong conclusions about hidden products.

### Full Kitchen Refresh

Guides the household across multiple storage areas and records which areas were scanned. This gives stronger reconciliation evidence without requiring every area every time.

### Coverage-aware reasoning

Each scan stores a coverage estimate, scan quality, frame count and uncertain detections. The key rule is:

**Not visible does not mean gone.**

Expected products that are not visible are kept as `not confirmed`; inventory is not reduced simply because an item was hidden behind another product, inside a drawer, or outside the camera view.

### Multiple identical physical products

V96 separates:

1. product identity,
2. physical instance count,
3. inventory quantity.

If the same milk carton appears in several video frames, repeated observations can be merged. If three separate identical cartons are visible, all three remain three physical units.

A backend regression test protects this rule.

### Quantity uncertainty

The vision contract can return quantity ranges and visible-instance counts instead of fake precision. Partly hidden products may be described as a range or as a clearly visible minimum.

### Targeted rechecks

After a scan, GHM can identify the small number of uncertain products or missed areas worth showing again. The user is not asked to rearrange the whole kitchen.

### Zone memory

Recent confirmed sightings are used as recognition context for a storage area. This helps GHM learn where products normally live without forcing the user to configure every product location manually.

### Review only what matters

The Kitchen Map result summarizes:

- confirmed/no-action detections,
- suggested changes,
- possible new products,
- not-confirmed products,
- coverage gaps,
- targeted rechecks.

Only meaningful changes require decisions. Source images/videos are not stored in the household database.

## Meal consumption confirmation

Meals now help keep household inventory current without silently guessing consumption.

A recipe has a new **I cooked this** action. It opens a compact review of matched, non-expired inventory ingredients and the amounts the recipe suggests were used. The user can edit, uncheck or confirm each item.

Only confirmed amounts are deducted. The backend:

- rejects expired products,
- prevents negative stock,
- detects stale inventory quantities,
- records one household activity entry,
- refreshes inventory for other household members.

This closes another part of the household truth loop while keeping approval with the user.

## Expiry safety

Expired inventory remains excluded from:

- meal readiness,
- recipe matching,
- normal Household Forecast consumption predictions,
- meal-consumption confirmation.

Expired products are presented for review/discard. Products approaching expiry can still be suggested for use **before** they expire.

## Household Forecast language

Technical “Digital Twin” wording is reduced in the everyday interface. Users see **Household Forecast** and practical predictions such as “likely needed soon”, while the underlying model remains deterministic/statistical and grows stronger from real household history.

## Premium clarity

Pricing now includes a calm “choose by outcome” guide rather than relying only on feature-count comparison:

- Free — build the shared routine
- Basic — protect and learn from receipts
- Family+ — plan the household week
- Pro — reconcile the physical home with Kitchen Vision / Kitchen Map

No plan prices were changed by V96.

## Internal data additions

### House

- `household_type`
- `onboarding_preferences_json`

### Product

- `usage_scope`
- `usage_member_ids_json`

### Kitchen Map tables

- `kitchen_storage_zones`
- `kitchen_vision_scans`
- `kitchen_vision_observations`

Existing startup schema compatibility logic adds the new columns/tables for older databases. For a production deployment, back up PostgreSQL before every major version update.

## AI provider branding

The provider remains an implementation detail. Public UI uses GHM names such as:

- GHM Kitchen Vision
- GHM Household Intelligence / Household Forecast
- GHM AI Infrastructure

Existing server-side provider environment variables remain unchanged so current credentials continue working.

## Validation performed

- Backend Python compilation: passed.
- Backend regression tests: 5 passed.
- Full SQLAlchemy metadata schema creation: 31 tables created successfully in an isolated SQLite validation database.
- TypeScript/TSX syntax transpilation: 56 application source files, 0 syntax diagnostics.
- CSS structural validation: balanced braces, 0 structural errors.

A full `npm ci && npm run build` could not be completed in the artifact workspace because npm registry downloads timed out and left incomplete dependency folders. Those folders are removed from the release. The included GitHub Actions quality gate runs the authoritative production frontend build in a normal networked runner.

## Deployment

Keep the real production `backend/.env`; do not replace it with `.env.example`.

Recommended before deploying:

```bash
pg_dump <your-production-database> > ghm-before-v96.sql
```

Then rebuild normally:

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

No new V96 secret environment variables are required beyond the credentials already used by V95.1.
