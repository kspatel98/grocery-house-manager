# GHM v150 — CI repair and merchandise image uploads

Base: v149 Owner-Only Pilot Merchandise Store. This is a source update; it has not been deployed and no live payments or supplier orders were made.

## Changes

1. Restored the missing `pendingReturnOrder` React state in `frontend/src/pages/MerchandisePage.tsx`. This resolves the five reported undefined-symbol errors in the TypeScript build job.
2. Added admin-only `POST /merch/admin/upload-image` accepting a single multipart form field named `file`. Supports JPEG/PNG/WebP up to 5 MB, rejects invalid content, checks dimensions, normalizes orientation, downsizes to 1600px and rewrites to WebP with randomized filenames. Returns `{ "url": "/uploads/merch/<random>.webp" }`.
3. Admin → Merchandise can upload a photo from the device, preview it, remove it from the current product, or use an HTTPS Photo URL. Save Product attaches the returned image URL to the catalog, with no rebuild required.
4. Hardened product photo URL validation to allow `/uploads/merch/...` and secure HTTPS image URLs.
5. Fixed stale backend test expectations for the current **20 Household Pro grocery image scans**. Updated the price-math test to use purchase of a whole **1 kg package**, not pretend that a shopper can purchase just 0.25 kg of it. Added a separate assertion for genuinely loose/weighted produce with unit-price data.
6. Made the Stripe order regression mock patch the same Stripe module used by `merch_orders`, even when the full test suite imports modules in a different order.
7. Added `backend/tests/test_v150_merch_images.py` with successful, malformed, oversized and unsupported upload cases and URL validation.

## How to use in Admin

Navigate to **Admin → Merchandise → Add/Edit**. Choose **Product photo — upload from your device**, select JPG/PNG/WebP (max 5 MB). Wait for "Photo uploaded", check the preview, fill in the other merchandise fields, then press **Save product**. Alternatively paste a direct HTTPS Photo URL.

Uploaded photos are served from the existing `/uploads/merch/` directory, which lives on the backend's `backend_uploads` persistent Docker volume. Keep that Docker volume during redeployments. Do not use `docker compose down -v` or the uploaded files will be deleted. Deleting an associated catalog item does not immediately delete the underlying file.

## Validation

- Locally ran 54 backend tests using a *test-only shim* for missing third-party authentication/payment modules in this isolated environment: **54 passed**. The shim is **not included in the source package**. CI must still run with the actual `backend/requirements.txt` installed.
- Python compilation of touched backend modules passed.
- Parsed 91 TypeScript/TSX frontend files with the TypeScript compiler parser: 0 syntax errors.
- **Unable to run a full `npm ci && npm run build` here** because the npm registry was unavailable. GitHub Actions remains the real production type-check/build gate.

## Required clean CI checks

```bash
# From repository root:
python -m pip install -r backend/requirements.txt pytest
PYTHONPATH=backend DATABASE_URL=sqlite:///./ghm_ci.db SECRET_KEY=ghm-ci-test-secret pytest -q backend/tests
cd frontend
npm ci
npm run build
```

Do not enable live checkout based solely on CI; real PrintKK/Stripe shipping, tax, payment, and refund flows still require owner-only end-to-end checks.

## Server deployment after CI passes

```bash
cd /var/www/grocery-house-manager
git pull origin main
docker compose up -d --build backend frontend
docker compose ps
```

Ensure `backend/.env` and `frontend/.env` are preserved, and never commit API or Stripe secrets. Confirm the upload works with the browser at the production domain after the deploy.
