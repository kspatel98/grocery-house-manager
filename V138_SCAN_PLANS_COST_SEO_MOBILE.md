# GHM v138 — Smart Scan Reliability, Plan Quotas, Shopping Confirmation & SEO

Based on the **v137 Smart Grocery Scan** package. Source was updated here, not deployed to the live website.

## User-requested plan adjustments

| Plan | Owned houses | Active shopping lists **per house** | Included receipt scans/month **across owner houses** |
|---|---:|---:|---:|
| Free Starter | 1 | 1 | 0 |
| Basic Home | 2 | 5 | 2 |
| Family Plus | 5 | **10** | 5 |
| Household Pro | **10** | **20** | **10** |

## Proposed paid-operation budgets (additional defaults for cost safety)

| Feature | Free | Basic | Family Plus | Household Pro | Accounting rule |
|---|---:|---:|---:|---:|---|
| Smart Grocery Image Scan | 0 | 2 | 10 | 25 | Monthly owner-wide, charged per vision attempt, even if unreadable |
| Fresh product identity lookups | 0 | 30 | 120 | 250 | Monthly owner-wide; valid cache reads free |
| Ask GHM external AI responses | 0 | 0 | 120 | 300 | Monthly owner-wide; prompt attempts that contact provider count |
| Kitchen Vision external AI scans | 0 | 0 | 0 | 10 | Monthly owner-wide; confirmed Premium Try exempt |
| Fresh Apify price, trip, flyer provider runs | 0 | 0 | 3/day, 20/month | 4/day, 30/month | Per house, shared across price/flyer/trip paid calls; global backend environment caps also apply. Existing cache remains accessible. |

The user explicitly specified **Family active lists 10** and **Pro houses 10, lists 20, receipt scans 10**. All other *new* quotas in this table are provisional defaults selected for cost control and should be reviewed with business/pricing strategy before announcing them to paid customers. Existing subscription terms may require notice/grandfathering before applying lower limits.

Monthly feature usage uses UTC calendar months. Receipt scan billing-period behavior is inherited from the pre-existing receipt policy; these are separate credits. All feature counters are enforced server-side with atomic database upserts. Paid provider attempts consume their allowance even if the external service returns no useful matches; opening cached results does not.

## What changed for scanning

- Updated JPG/PNG/WebP image preprocessing: EXIF orientation, 2560px max dimension, auto-contrast, mild sharpening for written lists.
- Uses **local Tesseract OCR hints** in the same vision request for written lists, when available. Unreliable OCR is a hint only: uncertain/unreadable words should never be invented.
- The failure shown in the screen recording was **0 groceries found** on a genuine handwritten paper list. This revision may improve it but **has not been verified on that original source photo with the live provider**.
- Unknown quantity is `null` in preview, and clearly shown as *Quantity not specified*. An explicit action can set all unspecified selected quantities to 1; GHM no longer reports these as accurately recognized values.
- Compact mobile review rows, Edit/Done expansion, original-photo comparison, no overlap from Tell GHM.
- Selecting or creating a Shopping List happens in a second confirmation popup after pressing Add. Products may target Inventory or Shopping; Written Lists only Shopping.
- Newly added To Buy items have bought quantity 0, not requested quantity duplicated as already purchased.
- Image scans consume a separate, visible plan quota via GET `/houses/{house_id}/grocery-scan/quota`.

## Plans and website

- Server `plan_utils` is the source of truth. Updated exposed plan limits in billing, houses, account, and frontend types.
- Updated Pricing card limits and feature comparison. The original pricing amounts are **unchanged**.
- New public feature pages at `/handwritten-grocery-list-scanner` and `/grocery-products-photo-scan`, with links from the public home and sitemap entries.
- Robots policy disallows member/private app pages from crawling. SEO titles, descriptions, and canonicals continue to be set by the existing PageMeta component.
- Mobile signed-in home: remove decorative second art tile, constrain hero widths, make buttons fit, and simplify mobile brand icon/padding.

**SEO work cannot guarantee rankings or indexing.** The site is a React single-page application, so consider prerendering server-side public pages as a follow-up. After deployment, verify your domain in Google Search Console, submit https://grocery-house-manager.com/sitemap.xml, request indexing for the two new features, and check Coverage/Performance and Core Web Vitals. Verify social preview appearance with the existing OG image.

## Deploy (test on staging first)

1. Make a backup of server project, database, and `.env`. The ZIP omits production `.env` secrets.
2. Extract package into your GitHub working checkout and commit code changes. Preserve server-only `docker-compose.yml` overrides and private environment files.
3. Confirm staging builds with `cd frontend && npm ci && npm run build`, `cd backend && pip install -r requirements.txt`, `PYTHONPATH=. pytest -q tests/test_grocery_scan.py tests/test_v138_plans_and_quota.py`.
4. Inspect your managed database permissions: startup executes `Base.metadata.create_all()` and must create the new `user_feature_budget` table (or migrate it manually). Do not give application credentials unnecessary DB permissions if you use a dedicated migration role.
5. Deploy via GitHub and on DigitalOcean run `git pull origin main`, `docker compose up -d --build`, `docker compose ps`, `docker compose logs --tail=80 backend`.
6. Test with real phones and original input images: handwriting success/failure; retries; photo-product scan; unit conflict; missing quantities; selected/new list dialog; inventory unchanged by To Buy; duplicate items; plan limit server response; dark mode and mobile hero on iPhone Chrome and Safari; pricing cards on desktop/mobile; cached price access when limits are exhausted.
7. Watch DigitalOcean AI costs and Apify account balance for a full month, adjust quotas using the server's plan policy before promoting the feature.

## Local validation performed

- Python syntax compilation on backend app/tests: passed.
- Focused plan assertions: passed.
- SQLite atomic budget smoke test across DB sessions: passed (2 allowed, third blocked).
- TypeScript source syntax/transpilation checked on changed TS/TSX files: passed.
- Complete production frontend build, broad pytest suite, live model accuracy and real-device testing were **not** completed here due to unavailable/incomplete local dependencies, including `python-jose` and `stripe`.
