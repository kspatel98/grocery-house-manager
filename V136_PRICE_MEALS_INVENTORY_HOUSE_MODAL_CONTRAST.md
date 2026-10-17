# GHM V136 — combined household, inventory, meal and provider-budget update

## Changes
- Household creation opens an isolated, responsive modal instead of the old inline form. Name, household type, validation, submission loading and Cancel/Create controls stay organized for first, second and third households. Existing plan house-count limits are unchanged.
- Inventory cards use consistent action buttons. Desktop product media uses a full-height image/brand split in a larger header; mobile uses a larger product-only panel and single-column cards with fully contained pictures. `object-fit:contain` deliberately preserves the entire uploaded image rather than cropping it to fill an arbitrary aspect ratio.
- Mobile authenticated header keeps the GHM icon without the repeated product-name/title text; desktop remains unchanged.
- Mobile Ask GHM uses a bounded flex workspace with one bottom-navigation reservation. A duplicate mobile header spacer is suppressed on this chat route.
- TheMealDB recipes now offer House Chat sharing (including a deep link), full ingredient review and explicit shopping actions: exact shortages (only recognized units), full recipe or manually selected ingredients. Ambiguous measures are left as zero for user correction and are never interpreted as a reliable stock-shortage number. Water remains a manual-only ingredient.
- Quick Start guidance receives explicit strong-contrast colors, including dark mode. The creation and external recipe dialogs use theme surfaces and properly legible field labels/actions.

## Paid provider safety
- A live-price/flyer lookup is counted **only immediately before an uncached Apify HTTP call**. Cached, historical, and saved prices can be reused without consuming the allowance.
- By default each household can initiate **4 new paid provider runs per UTC day, up to 30 per UTC month**. This combines price and flyer runs; an uncached trip can consume both. This is a cost ceiling, not a limit on opening Shopping or reading price comparisons.
- Limits are enforced in the backend in an atomic PostgreSQL/SQLite UPSERT, shared by all users/devices/workers in the household, with a new `house_provider_budget` table created by the existing metadata initialization on first deploy.
- Set `TRIP_PROVIDER_DAILY_LIMIT` and `TRIP_PROVIDER_MONTHLY_LIMIT` in `backend/.env` to adjust. Set either to `0` to disable new paid lookups while retaining cached sources.
- When the allowance is exhausted, the comparison continues with cached, receipt, flyer and saved prices, and the user receives a status message. Price-cache TTL and user plan access are unchanged.
- A provider failure may still use billable credits; the attempt is therefore counted before the remote request.

## Deploy
1. Back up the existing project, `.env` files and database before replacing code. Do not overwrite server `.env` files or customized `docker-compose.yml`.
2. Unzip and commit updated tracked project files to GitHub, or deploy through your usual release workflow. Ensure the new Python file `backend/app/utils/provider_budget.py`, model and CSS file are committed.
3. On the DigitalOcean server: `git pull origin main && docker compose up -d --build` (only after resolving any local tracked changes safely). Startup must be able to create the new budget table; verify logs.
4. Smoke-test first/third-house creation, mobile Ask GHM, images in both themes, TheMealDB ingredient review, and the 4/30 paid-run limits. The application does not require a schema column migration but creates one new usage table.

## Validation status
- Python compilation: passed.
- TypeScript TSX transpilation syntax: passed for changed frontend files.
- SQLite atomic quota test: 4 allowed, then two denied (passed).
- Full `npm` build / unit-test suite was **not** executed successfully in this environment: the archive's `node_modules` is incomplete and network dependency restoration was unavailable; backend tests also required dependencies/test secrets not present. Run `npm ci && npm run build` and the backend tests in CI before production deployment.
