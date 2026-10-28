# GHM v154 — Merchandise operations, PrintKK design import, cart reconciliation and receipts

Built on v153. This package is SOURCE CODE, not a live deployment or a certification of production readiness.

## Changes

### 1. Cancellation operations
- `Admin -> Merchandise Orders` now shows a **Customer cancellation requests** queue above ordinary orders, with customer email, order reference, reason and payment/supplier state.
- Requests made while Stripe payment is still pending appear in the queue too; they were previously hidden by the default attention filter.
- Requests remain reviewable until the order is canceled/refunded. Admin order cards show an explicit warning.
- Queue refreshes every minute while the admin page is open, or on the existing Refresh button.
- Sending an identical cancellation request while status is already `cancel_requested` does not add duplicate audit events.
- **A request is NOT the same as a confirmed cancellation.** Verify supplier status and Stripe payment before refunding. Existing manual supplier cancellation/verification/refund safeguards remain active.

### 2. Import products from PrintKK designs
- `Admin -> Merchandise` includes **Load PrintKK designs**, pagination, design selector and exact variant selector.
- New read-only backend routes:
  - `GET /merch/admin/printkk-designs?page=1`
  - `GET /merch/admin/printkk-designs/{design_code}`
- These use documented design-list / design-detail endpoints and return exact `designSpecificationCode` values when the supplier provides them.
- Selecting a variant pre-fills GHM SKU, display name, available category/description, verified HTTPS mockup URL if present, and PrintKK specification code. Existing user-entered details are not silently overwritten.
- CAD selling price and product publication remain YOUR decisions; selecting an import does not publish, charge a wallet or make a supplier order.
- The PrintKK authenticated response structure could not be live-verified in this environment. If your account returns another shape, the API reports that explicitly rather than guessing a variant code. Do not publish a product until you have verified its exact variant and image.

### 3. Cart after purchase
- For Stripe checkout, the frontend saves the order reference and submitted item quantities in local storage before redirecting.
- On a confirmed paid order (including if the user requested cancellation after paying), GHM removes **only purchased quantities** from the cart, not unrelated new additions.
- If payment is not verified or the user cancels Stripe checkout, the cart stays.
- Fully token-funded orders use the same purchased-item reconciliation. Older purchases (before this upgrade) have no saved checkout snapshot and cannot safely be inferred/removed automatically.

### 4. Customer receipts
- Paid orders now expose `GET /merch/orders/{id}/receipt.pdf` (authenticated and owner-scoped), with a **Download PDF** button in My Orders.
- PDF includes seller identity, payment date, customer/delivery data, product lines, shipping, customer sales tax, total, redeemed tokens and card amount. Unpaid orders cannot generate paid receipts.
- Add optional backend environment variables:
  ```
  MERCH_SELLER_LEGAL_NAME=Your legal business or registered trading name
  MERCH_SELLER_ADDRESS=Your business mailing address
  MERCH_GST_HST_NUMBER=Only if you have a valid registered GST/HST account
  ```
- **Taxes shown are GHM CUSTOMER sales tax, calculated using Stripe Tax. They are NOT PrintKK SUPPLIER taxes.** Never enter a GST/HST number unless officially registered. Confirm Canada Revenue Agency compliance, tax registrations, and refund/credit-note practices with an accountant. Stripe Tax calculations are not an automatic substitute for filing/remitting your taxes.
- `reportlab==4.4.4` is added to `backend/requirements.txt` for PDF generation.

### 5. Supplier costs / shipping accuracy
- `Admin -> Merchandise Orders -> Review order` has a **Check PrintKK supplier costs (no charge)** button when a real supplier draft/order exists.
- Read-only endpoint: `GET /merch/admin/orders/{id}/supplier-breakdown`. It looks for documented/common cost fields in the supplier's order detail response and **shows missing fields as unknown**.
- Currency is never assumed or auto-converted. No supplier wallet payment is initiated.
- This is NOT a guaranteed cost quote BEFORE customer checkout. Official PrintKK documentation describes product/variant-specific first/additional shipping and address dependence; a verified non-charging exact quote endpoint for arbitrary baskets/addresses was NOT established. GHM still charges its separately configured CAD shipping amount (`MERCH_SHIPPING_CENTS_CAD`). Validate it carefully against actual PrintKK shipping costs before expanding sales.
- PrintKK supplier taxes are a cost to GHM; Canadian sales taxes charged to your customer must follow GHM's own tax obligations and be calculated independently (existing Stripe Tax flow).

## Verification performed
- `61 backend tests passed` in a local harness that substitutes missing external auth/Stripe libraries; this is NOT identical to CI/production dependencies.
- `91 TypeScript/TSX files` parsed with TypeScript's syntax parser (not a full type-check).
- Backend modules compiled; PDF route generated a file, which was rendered and inspected.
- NOT verified: complete npm production build, live PrintKK account/design format, Canadian shipping quote endpoint, actual Stripe tax registration, tax filing/reporting workflows, real supplier charge, or live refund scenarios.

## Deployment and smoke-test sequence
1. Push the v154 source and ensure GitHub Actions **frontend build and backend tests pass** before production.
2. Preserve existing `.env` secrets and database. Apply the new `reportlab` backend dependency in your Docker build.
3. Rebuild `backend` and `frontend` containers (`docker compose up -d --build backend frontend`). There are no new database columns in this release.
4. Log into Admin -> Merchandise Orders. Check the dedicated cancellation queue with your already-submitted cancellation request.
5. Use `Load PrintKK designs`. Select an exact variant; verify name, image, SKU, correct specifications and CAD retail price; save as hidden, verify, then publish.
6. Try a **test-mode Stripe checkout** and confirm that unpaid orders retain the cart, and paid orders clear only purchased quantities.
7. Download the paid receipt PDF; verify legal seller name, registered tax number only if applicable, shipping and tax line items.
8. For the already-created PrintKK supplier order, use **Check PrintKK supplier costs**. Compare with PrintKK Dashboard to confirm whether its API provides shipping and tax fields. Do not automatically use supplier tax as customer tax.
9. Keep manual supplier review enabled until a complete order, cancellation and refund life cycle succeeds on the live payment configuration.

**Important:** If your PrintKK account's design listing endpoint uses different pagination or response fields, we need one sanitized example response from the read-only API to finish mapping it. Never send API keys or live payment secrets in chat.
