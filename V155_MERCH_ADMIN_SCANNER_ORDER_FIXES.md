# GHM v155 — Merchandise administration, payment lifecycle and barcode repair

Base: v154. This package is **source code**; it does not change your DigitalOcean server until you commit/deploy it.

## Changes

### PrintKK designs / diagnostics
- A read-only design-list failure no longer returns the misleading "network result uncertain; reconcile" message used for risky supplier POSTs. HTTP 401/403, 404, 429, timeout and connection errors are distinct, without leaking credentials.
- The merchandise Import tab includes a read-only API connection check and visual cards of returned designs. Design detail and exact variants display all recognized preview/mockup URLs (up to 12 per product in this release). Select a variant, inspect the resulting gallery, set CAD retail price and save without rebuilding.
- **This cannot repair a PrintKK credential, a blocked outbound connection, or a provider API format changed outside of GHM.** Run the new diagnostic from your deployed GHM Admin tab. Inspect the backend logs if needed. Live account access was not available during development. No PrintKK wallet funds were used for tests.

### Store and Admin UI
- Admin Merchandise has tabbed **Products / Import PrintKK designs / Festival planner**, a summary, image previews and clearer form layout.
- Admin Orders has **Orders / Cancellations / Store settings**, top-level metrics, paid/unpaid filters and order detail actions.
- The store product detail popup has a multi-image thumbnail gallery. Existing single-image records remain compatible.
- Images are stored in a NEW `merch_product_images` table; the existing main image column remains unchanged, so the old product listings still work. Backend's `Base.metadata.create_all` must be allowed to create the table in your database on startup. Back up the DB first.
- The product gallery accepts separate images from PrintKK response fields and individual Admin image uploads. The image cap is 12 per product to prevent abusive content; add/edit works without rebuilding.

### Payment & cancellation
- **Unpaid** Stripe checkouts can be cancelled directly by the customer, *only after* Stripe confirms the session is unpaid/expired. Reserved tokens are returned once. The audit record stays in My Orders rather than silently deleting financial history.
- **Paid** orders use Request cancellation, review and any required Stripe refund / PrintKK cancellation process. Unpaid orders are excluded from the Admin paid cancellation-request queue.
- Customer **Check payment** button retrieves the known Stripe session and applies the same strict currency/amount/metadata verification used by the signed webhook. It never creates a new charge. It can recover a missed/delayed webhook for a known session. Unknown-session cases still require Admin reconciliation.
- Admin's All Orders filter includes unpaid; payment-confirmed and unpaid filters added. Older incorrectly submitted unpaid requests are excluded from the paid cancellation queue.
- Existing PrintKK submission and payment remain independently controlled. DO NOT make supplier payment automatic without validating provider responses.

### Inventory barcode scanning
- Added actual barcode decoding on the backend using `pyzbar` / `libzbar0` for EAN/UPC/Code128, before falling back to checksum-validated printed digits. iPhone/Safari browsers without native BarcodeDetector can send limited camera frames to the same GHM backend for decoding. No external OCR requests/charges are made; users still have photo/manual fallback.
- Dockerfile now installs libzbar0; requirements.txt installs pyzbar. **Rebuild the backend image**; `docker compose restart` alone will not install the dependency.
- Camera still requires HTTPS and user permission; blurry/obstructed barcodes may fail. Do not assume zero failures.

## Local checks
- 66 backend tests passed in a local harness with testing stand-ins for missing third-party `stripe`, `jose`, and `passlib` Python packages. This does **not** substitute for running tests with real dependencies in GitHub Actions.
- 91 frontend TypeScript/TSX files parsed successfully; full production TypeScript typecheck and Vite build **not run** because project dependencies aren't installed in this environment.
- The optical decoder successfully read a known generated EAN-13 barcode test image (`backend/tests/fixtures/ean13_sample.png`).
- Production PrintKK access, Stripe payment, remote tax/shipping, and device camera tests remain unverified.

## Deployment checklist
1. Back up the managed PostgreSQL DB and verify the uploads Docker volume is persistent.
2. Replace project source with this ZIP's contents, preserving `backend/.env`, `frontend/.env`, secrets and running data. Commit/push source to GitHub.
3. Wait for both GitHub Actions jobs (frontend build and backend tests) to pass. Fix any reported errors before production release.
4. On DigitalOcean after the Git push:
   ```bash
   cd /var/www/grocery-house-manager
   git pull origin main
   docker compose up -d --build backend frontend
   docker compose ps
   docker compose logs --tail=100 backend
   ```
5. Open Admin → Merchandise → Import PrintKK designs → Diagnose API connection, then Load designs. If it fails, inspect the new explicit message. For read-only network diagnostics, on the server inspect DNS/HTTPS connectivity to `api.printkk.com` without sharing API credentials or making any paid request.
6. Confirm your existing products still display. Add 2–3 gallery images to an item, save, reopen, and view them in the customer popup.
7. Test an unpaid Stripe **test-mode** checkout: confirm Cancel unpaid order expires the session, no paid cancellation request appears in Admin, and no supplier order is submitted. Test a successful paid **test-mode** checkout: Check payment (when needed), and request cancellation with Admin review.
8. Test the inventory scanner on iPhone Safari/Android Chrome with a real EAN/UPC product, under HTTPS. Verify the camera stops when closing the modal.
9. Keep real customer checkout controls according to your payment, tax and supplier integration readiness. This update does not automatically change checkout access.

## If PrintKK import still fails
The earlier message was emitted even for read-only HTTP failures. This update reveals whether the issue is a **403 invalid/unauthorized credential**, **404 wrong endpoint**, **429 rate limit**, **network/DNS/HTTPS timeout**, or **unrecognized response**. PrintKK's live API cannot be authenticated without your private key, and the app must not fabricate imports when the provider does not return the designs. Contact PrintKK with the failing read-only endpoint and sanitized HTTP status if necessary.
