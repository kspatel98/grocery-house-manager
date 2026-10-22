# Grocery House Manager — v147 coordinated UX, price trip, festival, merchandise update

Built from: v146 beginner cooking guides (19 Oct 2026). This is a SOURCE PACKAGE, **not** a deployment to the live website.

## Improvements included

1. Inventory product barcode modal: camera preview attempted before native BarcodeDetector capability check (previously blocked early); photo-taking input with server OCR for **printed barcode digits** and GTIN checksum validation; manual entry remains. The photo fallback is not universal computer-vision barcode decoding. On unsupported browsers the live camera may open without real-time decoding; use photo/manual. HTTPS + camera permission required. No products are silently added.
2. Feature usage: changed presentation of local counters beside Shopping Trip, Price Lookup, Receipt Scan, Kitchen Vision, Ask GHM and grocery-photo scanner headings. Remaining attempts refresh after the existing `ghm:usage-changed` event. Layout preserves the original quota source; it does not invent unlimited usage.
3. Shopping trip: exactly ONE account-level paid price/flyer usage increment for a trip refresh even when both supported data sources need fetching, with a **maximum of two underlying billable provider calls** (one live-price group and one flyer group). Cache-only opens never debit credits. A provider that fails may have incurred third-party expense and the one GHM attempt remains spent.
4. Country and postal selection: authenticated user country enforced before fetching external Canadian trip prices; unsupported countries get explanatory response **without charging**. Client postal code is saved alongside its country + city scope; legacy unscoped or mismatched postal cache is invalidated. Country-specific restaurant search logic was intentionally not modified.
5. Trip result details: expandable per-store item-level evidence, quantity, unit price, source and package notes; missing prices not guessed; verified physical branch address never invented. Show first 5, then show more. A two-store scenario shows per-item store picks and an explicit **unverified branch** Google Maps route search (no fabricated driving times or distances).
6. Mobile UI: styles for free Premium Try, FAQs, the clipped background-job notification/popup, and responsive details cards.
7. Festival meals: optional preference (no religion inferred) plus a read-only upcoming curated calendar with annual fixed-date Uttarayan/Makar Sankranti example and a 2027 Dussehra example, 7 days before. Admin can create/modify other year-specific, region-specific festival dates without redeploying. While application is open the notification area checks every six hours, and on focus; **this is not a server-scheduled push notification when the app is closed**. Suggested built-in dish recipes let users check ingredients and add shortages after confirmation; ready-made option goes to store/restaurant discovery without guaranteeing menu availability.
8. Merchandise: server-persisted admin add/edit/delete/show/hide catalog with SKU, images, design ID, display order, and CAD prices. Public `/merch` route linked on More. Prices are displayed at fixed 1 GHM Token = 1 CAD. **Checkout is intentionally disabled**, because PrintKK API credentials, production cost / shipping quote, inventory status, tax calculation, Stripe order capture and irreversible token debit have not been integrated or approved. No tokens can be deducted for merch. Staff can add products without rebuilding.
9. Recipes: the v146 independently authored ingredient-aware cooking guides were kept intact. Current coverage: 63 built-in recipes with 18–21 sequential steps; 11 individually authored long-form guides matched to independently curated source-linked vegetarian recipes. Source website content is **not** copied. We have NOT imported every meal on vegrecipesofindia.com; scaling to all linked dishes requires individually verified ingredients/recipes, permissions if copying any source prose/media, and human cooking review. Existing progress checkboxes remain.

## Changes NOT claimed complete

- End-to-end reliable iOS barcode decoding across browsers: current native-detector + printed-digits OCR route is a best-effort fallback. Further QA and dedicated JS/WASM barcode decoder (with dependency lockfile update) recommended.
- Merchant checkout and PrintKK fulfillment; no Stripe or Token purchase order flow for merch is activated.
- 5 GHM Tokens feedback reward: earlier discussion only. Not implemented due abuse, tax/accounting and public-review incentive concerns. A future version can add one verified private-feedback reward per eligible customer once controls are agreed.
- Full source website recipe catalog; no third-party bulk copying.
- Location-verified store addresses/driving directions: no branch identifiers available from price sources.
- True background push festival reminders while web app closed: requires server scheduler + users' opt-in notifications.

## Validation

- Python `compileall` for the backend succeeds.
- Backend schema regression tests `backend/tests/test_v147_trip_consistency.py`: 2 passed with test database settings.
- All 89 frontend TS/TSX files parsed cleanly using global TypeScript parser.
- `frontend/scripts/check-beginner-recipes.cjs`: 63 built-ins pass, 11 source-linked planning guides have 18+ original steps.
- **No full production frontend build** in this environment: dependencies missing, registry unavailable. Backend full test suite also incomplete because the local environment lacks `python-jose` even though it is declared in backend requirements. Run CI before deploy.

## Release checklist

1. Back up your PostgreSQL database and production `.env` files. Never commit secrets.
2. Extract this source over a controlled Git branch, inspect diff, preserve production Compose overrides, and commit.
3. In CI or dev: `cd frontend && npm ci && npm run build && npm run check:recipes`.
4. In CI or dev: `cd backend && pip install -r requirements.txt && PYTHONPATH=. pytest -q` with valid non-production test database settings.
5. Deploy staging first, and verify startup creates the new SQLAlchemy tables `merch_catalog_products` and `festival_meal_rules`. For production change management, generate an Alembic migration rather than relying solely on `Base.metadata.create_all` if the environment enforces managed schema upgrades.
6. Manually test Safari/iOS barcode, permissions, denied-camera/photo fallback; trip quota count before/after one refresh; country/city/postal changes; store expansion including >5; Premium Try/FAQs/mobile background popup; admin merchandise CRUD; festival opt-in and notice.
7. Only after staging QA: deploy your app with your existing Docker Compose release procedure; follow logs and database health.
