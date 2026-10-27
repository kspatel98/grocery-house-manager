# GHM v149 — Customer-ready UX + owner-only merchandise pilot

Built on v148. This release is intended to let the GHM owner simulate and then place ONE controlled merchandise order on their own account. **It is not a certification that live payments, PrintKK shipping/fulfillment or tax calculations are production-approved.** Do NOT invite the public or enable unattended fulfillment until the real checks below pass.

## What's new versus v148

- Replaced the long merchandise page (visible in the supplied browser recording) with **Shop**, **Cart**, and **My Orders** tabs. Direct URLs `/merch/cart` and `/merch/orders` redirect to the corresponding tab. Cards have contained images, reasonable description truncation and expandable full details; no more enormous text walls.
- Cart persists across browser refreshes (`ghm_merch_cart_v149` in localStorage), removes products that are no longer available, supports quantities, and presents items, Canadian delivery fields, GHM Token credit, Stripe-calculated tax and grand totals in a dedicated cart view.
- My Orders displays status, customer-safe milestones, payment breakdown, tracking, receipt overlay, and cancellation requests. A successful Stripe redirect does not itself assert payment is complete; the cart is cleared only once the API verifies the returned order is paid. Only a signed Stripe webhook validates card payment.
- Admin dashboard now has an order queue, filters/search, buyer delivery review, supplier status and controlled fulfillment operations. Supplier wallet charges require two explicit confirmations.
- **Owner-only pilot**: `MERCH_PILOT_EMAIL` gates `/merch/quote` and `/merch/checkout` on the backend to the designated signed-in email, even if checkout is globally configured on. Anonymous visitors and others can browse but cannot buy.
- Read-only PrintKK connection check from Admin, plus an environment configuration/readiness display, with **no supplier wallet deduction**. Non-charging CLI readiness helper `python -m app.scripts.merch_readiness`.
- Extended regression coverage for pilot authorization, order timeline privacy and cross-account isolation. Existing v148 payment, token and supplier-idempotency tests continue to pass.

## Step 1 — Back up and deploy to staging

Take a managed PostgreSQL backup/snapshot, and retain a copy of the currently live v148 source. Do not overwrite a newer production codebase with this ZIP if changes have since been made. Do not copy empty `.env` files onto existing server credentials.

When your verified project source is committed to your repo and deployed to a staging environment, update the existing container stack as normal. A typical deployment after syncing the verified Git commit:

```bash
cd /var/www/grocery-house-manager
git status
docker compose build backend frontend
docker compose up -d backend frontend
# If you deploy behind the existing Caddy service, keep Caddy running.
docker compose ps
```

**Important:** Uploading a ZIP here does NOT update GitHub, DigitalOcean, Stripe or PrintKK. No remote deployment was performed.

## Step 2 — Backend configuration for controlled testing

Set the following in **backend/.env**; replace placeholders privately and never commit credentials:

```dotenv
PRINTKK_API_KEY=your_real_printkk_api_key
PRINTKK_API_BASE=https://api.printkk.com/pkk-openapi
STRIPE_SECRET_KEY=sk_test_or_sk_live_matching_your_test_stage
STRIPE_WEBHOOK_SECRET=whsec_issued_by_the_corresponding_stripe_webhook
MERCH_SHIPPING_CENTS_CAD=999
MERCH_TAX_ENABLED=false
MERCH_CHECKOUT_ENABLED=false
MERCH_PILOT_EMAIL=your_actual_GHM_login_email@example.com
```

Use `sk_test` for Stripe payment simulations. A Stripe test payment **does not add real cash** to your Stripe balance. Do not pay PrintKK for a real sample on the strength of a fake payment. For your controlled real purchase, switch to the approved live Stripe key and the matching live webhook secret **only after staging verification**.

`MERCH_SHIPPING_CENTS_CAD` is an example: 999 means CA$9.99 charged to the customer. It is NOT a live PrintKK quote. Change this to an accurate amount based on the destination, product and total order, allowing for currency conversion and any remote surcharge. This release is still flat-rate shipping, not real-time provider-quoted shipping.

The checkout requires `MERCH_TAX_ENABLED=true`, which must be used only after Stripe Tax calculation and registration are configured correctly for the merchant's actual obligations. If this is not set up, do NOT set it to true simply to bypass the gate. Consult tax guidance as needed. Once the owner-only pilot is fully validated, set `MERCH_CHECKOUT_ENABLED=true` while **keeping `MERCH_PILOT_EMAIL` populated**. The backend rejects all other logged-in users, even if they have a cart.

After making .env changes:

```bash
docker compose up -d --force-recreate backend
docker compose exec backend python -m app.scripts.merch_readiness
```

## Step 3 — Validate catalog and supplier auth without placing an order

1. Visit GHM Admin → Store merchandise. Confirm one active product, a public image URL, positive CAD price, and the actual **designSpecificationCode** for its PrintKK printable variant.
2. Visit Admin → Merchandise orders and use **Test PrintKK connection (no charge)**. This calls the documented read-only product-category endpoint. A success confirms credentials and network access, *not order creation or wallet payment*.
3. Compare the PrintKK product's printed variant, shipping rates and taxes in the supplier dashboard. You have only funded the wallet for one fulfillment, so DO NOT repeatedly create/pay real supplier orders as tests.
4. Verify Stripe Dashboard uses a **signature-verified webhook** routed through GHM's configured `/billing/webhook` API path, including `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `refund.created`, and `refund.updated`. Validate your exact production URL through Caddy routing, not from a guessed public URL.

## Step 4 — Test GHM customer experience safely

1. Sign into the **pilot email account**, open `/merch`, browse compact products, click “Add to cart”, open **Cart**. Refresh: your cart should persist. Confirm that quantities and prices update.
2. Enter your Canadian shipping address, and optionally GHM Tokens; review the calculated total. Your wallet is in CAD-equivalent whole tokens (`1 token = $1 CAD`). A Stripe card remainder below the payment minimum is not permitted.
3. With Stripe **test-mode credentials**, try a test card payment and verify that a signed event marks your test order paid. Confirm the **My Orders** tab shows the order, receipt and progress; verify admin also shows it. Do NOT pay PrintKK to fulfill a test-card order.
4. Test canceled checkout, a duplicate button click, refresh, invalid token balance, and cancellation request. The existing payment tests mock these server behaviors, but a real webhook should also be verified in staging.
5. For the ONE actual self-purchase: configure the correct live Stripe account/webhook and tax/shipping settings, **keep the owner-only pilot gate**, purchase a single apron or tote via GHM. Wait until Admin marks its payment verified.
6. Verify product identity and destination, **submit exactly one supplier draft**, find its supplier ID in PrintKK, inspect the **exact PrintKK total** before clicking Pay, then authorize the supplier wallet charge once. PrintKK deducts production + shipping + applicable taxes from your PrintKK wallet. If a submission/payment times out, reconcile the existing order rather than clicking again. Manual fulfillment review is deliberate.
7. Use Admin “Sync tracking” after supplier processing; a scheduled `python -m app.scripts.merch_sync` can poll read-only statuses. Inspect your delivered sample and packaging, and verify the receipt, order history, tracking and customer experience.
8. When finished, set `MERCH_CHECKOUT_ENABLED=false` and restart the backend unless you have decided to continue the gated pilot.

## Known blockers to general production release

- No real Stripe or PrintKK credentials are present in this workspace; no live payment, supplier draft, wallet deduction or shipment was attempted here.
- The exact PrintKK order POST payload and remote provider response need **account-specific verification**; the v148 adapter is an unconfirmed implementation based on public endpoint descriptions. PrintKK API docs: https://api-docs.printkk.com/ and https://www.printkk.com/api .
- The configured shipping amount is a **flat Canadian charge**, not a per-cart/address supplier-quoted cost. PrintKK says cost depends on the item, destination, and taxes. Confirm per-product and province pricing before selling publicly.
- Stripe Tax registration and calculations must be validated by the merchant. Card disputes, chargebacks, tax invoice compliance, partially shipped multi-package orders, marketing emails, and supplier refund restrictions remain operator responsibilities.
- Printing/fulfillment is **manual admin approval** until the supplier workflow is validated. The merchant must handle cancel/refund requests in accordance with the actual supplier state and applicable consumer rights.
- GHM Wallet currently supports **whole tokens**. Fractional CAD-cent token usage will require a broader wallet migration and was not changed in this release.
- No complete production frontend build ran here because npm dependency files weren't available from the offline package cache; all 91 frontend TS/TSX files parsed, backend compiled, and isolated merchandise regression tests passed.

## Technical smoke tests performed in this workspace

```bash
PYTHONPATH=backend DATABASE_URL=sqlite:///:memory: SECRET_KEY=test-only-secret \
  python -m pytest -q backend/tests/test_v148_merch_orders.py backend/tests/test_v149_merch_pilot.py
```

Result: **7 passed**. Tests use mocked Stripe/PrintKK calls and do not move money.
