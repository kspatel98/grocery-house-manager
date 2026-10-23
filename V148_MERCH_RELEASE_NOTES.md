# GHM v148 — Merchandise checkout and order management

## What is implemented

- Customers can browse active admin-created products and, **only after explicitly enabling checkout**, add them to a cart, enter Canadian delivery details, calculate taxes using Stripe Tax, apply *whole* personal GHM Tokens (CAD $1 each), and redirect to hosted Stripe Checkout for the card remainder.
- Server-controlled catalog prices and immutable order snapshots, one order per `(user, idempotency_key)`, a persistent order/audit history, and atomic token deduction/reservation.
- Verified Stripe webhooks at the existing `/billing/webhook` endpoint, with amount, currency, user, order and Session ID checks. Duplicate successful-payment notifications cannot debit tokens twice. Expired/unpaid Stripe sessions release reserved tokens exactly once.
- Mixed-card/token transactions and token-only transactions supported when the total due after tokens equals zero. **Existing GHM wallets store integer token balances, so fractional-token redemption is not yet supported**. For most prices ending in cents, customers pay the small remainder by card (Stripe minimum card charge applies).
- Customer order history, order receipt JSON, cancellation requests, shipment status and tracking link.
- Admin order dashboard to submit a PrintKK draft, separately pay the supplier using the PrintKK wallet, query shipping status, reconcile unknown Stripe/PrintKK responses, cancel unpaid PrintKK drafts, record supplier support cancellations, record tracking, and refund card + token portions.
- PrintKK API adapter plus optional command-line polling (`python -m app.scripts.merch_sync`) for order statuses; no PrintKK customer data is forwarded until authorized admin submission.
- The existing admin catalog remains dynamically editable without rebuilding; store catalog uses current API prices, while orders keep historic item snapshots.

## Important: merchant checkout is NOT enabled by default

**This package is a tested application integration foundation, not an assertion that real checkout is safe immediately after uploading the ZIP.** The PrintKK API authentication/order body, variant IDs and payment operation must be checked with your actual PrintKK account; they could vary from publicly indexed examples. An actual API order and supplier wallet charge have NOT been performed. The end-to-end user flow, webhooks, taxes, Canadian shipping rates and bank payouts have NOT been validated against production credentials.

`MERCH_CHECKOUT_ENABLED=false` is the default. Once authorized testing, merchant tax registrations, shipping prices and refund policy are verified, set:

```dotenv
# In backend/.env only — never in frontend and never commit secrets.
PRINTKK_API_KEY=your_private_printkk_key
# Default https://api.printkk.com/pkk-openapi — verify on your account
PRINTKK_API_BASE=https://api.printkk.com/pkk-openapi
STRIPE_SECRET_KEY=sk_...        # Test keys first; existing app uses this
STRIPE_WEBHOOK_SECRET=whsec_...  # From endpoint subscription, must include merch events
MERCH_TAX_ENABLED=true         # Only AFTER Stripe Tax registration is checked
MERCH_SHIPPING_CENTS_CAD=999   # EXAMPLE only; verify landed Canadian delivery cost
MERCH_CHECKOUT_ENABLED=false   # Switch true ONLY after the full checklist below
```

The same signed Stripe endpoint `/billing/webhook` must receive:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.expired`, `checkout.session.async_payment_failed`,
`refund.created`, `refund.updated`, along with your existing subscription/credit events.

## Launch checklist (complete before enabling real checkout)

1. Backup the PostgreSQL database. Deploy a copy of this ZIP to staging and run schema initialization (`Base.metadata.create_all` is used by the existing backend). Verify `merch_orders` and `merch_order_events` tables are created and protected by their unique constraints. Do not use a test payment against production customer profiles.
2. Set up **Stripe Tax** registrations for jurisdictions where GHM must collect taxes; verify addresses, shipment taxability and the generic merchandise tax classification in the Stripe Tax calculation. This integration calculates taxes before tokens apply. Do not assume a zero-tax quote means you have no filing obligations. Consider professional tax advice before launch.
3. Verify actual PrintKK API `Api-Key` header, POST `/api/v1/order` JSON field names, created supplier order ID, `POST /api/v1/pay/wallet` field names, and order tracking response against https://api-docs.printkk.com and a non-customer pilot. This adapter follows publicly described endpoints **but the exact create payload is not verified**.
4. For every sellable product, enter the actual **designSpecificationCode for the printable variant** into the Admin product field. Do **not** enter a general designCode or a SKU as if they were equivalent. Set realistic CAD prices that cover PrintKK + FX + shipping + tax + Stripe fees + returns.
5. Obtain real PrintKK delivery quotes to major Canadian destinations and confirm the `MERCH_SHIPPING_CENTS_CAD` price is appropriate, including remote addresses. Initial checkout supports CA only with a *single configured shipping price*. No real-time carrier-calculated quotation is integrated.
6. Check Stripe Checkout with test cards, repeated webhook messages, return URLs, cancellations, late payment callbacks, signed refund events, partial token + card orders and GHM wallet balance reconciliation.
7. Verify that existing `POST /billing/webhook` webhook deliveries return 2xx after database commit. Unknown Stripe or PrintKK outcomes remain flagged for admin reconciliation; never blindly click submit/pay again after a timeout.
8. Run a low-value real pilot shipment to yourself and inspect the printed design, tracking fields, supplier charge, packaging and customer invoice. Only then change `MERCH_CHECKOUT_ENABLED=true`.
9. Schedule backend `python -m app.scripts.merch_sync` every 30–60 minutes using system cron or a single scheduler instance. This polls orders already linked to PrintKK; it NEVER creates orders or spends supplier funds. Protect server logs because order data contains private shipping information.
10. Configure customer support and a legally compliant cancellation/return policy. PrintKK orders normally cannot be canceled automatically once supplier production/payment begins. Admins may refund paid orders only after verified supplier cancellation (or documented PrintKK support confirmation), unless your business deliberately accepts the financial loss.

## Payment and fulfillment safeguards

- Stripe Checkout is created once per immutable order key, and signed webhooks are the trusted card-payment confirmation source. Do not ship based solely on success-page redirects.
- Token balance is debited atomically as escrow at checkout; it is restored after a confirmed cancellation, expiration or completed refund. Token purchases are not credited again on merchandise redemption.
- External `PrintKK POST` creation and `PrintKK wallet` charge each transition into an **uncertain** state before the network call. If the supplier times out, admin reconciliation is required before any new attempt. This avoids duplicate supplier charges/shipments.
- PrintKK does not provide a guaranteed push-tracking webhook in publicly available materials; the optional polling script keeps status fresh. Admin can enter *verified* tracking if needed.
- No automatic PrintKK wallet charging or order submission on the Stripe webhook: admin review is the default until the supplier API, fulfillment pricing and shipping conditions are verified. This may create a processing delay and needs operational attention.
- Refunds initiated through Stripe are tracked separately and confirmed by a signed refund webhook or successful Stripe API result. Paid supplier orders cannot be automatically canceled; consult PrintKK before issuing refunds.

## Local regression tests

```bash
cd backend
PYTHONPATH=. DATABASE_URL=sqlite:///:memory: SECRET_KEY=test-only-secret python tests/test_v148_merch_orders.py
```

Test stubs do not send live API requests. They cover checkout idempotency, duplicate payment events, payment amount mismatch, token escrow and expiration refunds, and postal-address validation. This is not a substitute for full Stripe, tax, PrintKK, load, mobile and production tests.

## Known gaps deliberately not concealed

- Full Stripe/PrintKK network end-to-end testing could not happen without merchant credentials and a funded account.
- Product shipping is configured per-Canada price, not a real-time PrintKK quote. Taxes use Stripe Tax with account-specific registration and tax-code configuration still requiring verification.
- Order cancellation after the PrintKK wallet is charged may require supplier support, even if a customer requests it from GHM.
- Wallet currently stores whole tokens; finer CAD-cent token balances would require a coordinated migration of *all* existing GHM wallet and service accounting. No automatic migration was attempted.
- No email notification delivery or downloadable PDF invoice is included. Receipt data is available through an authenticated API and order history; current tracking polling needs explicit scheduler configuration.
- Order disputes, chargebacks, inventory stock/size synchronization, analytics, per-product tax codes, multi-package carrier tracking and international fulfillment need further work before claiming marketplace-grade completeness.

## Sources for supplier behavior

- https://www.printkk.com/api
- https://api-docs.printkk.com/
- https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted
