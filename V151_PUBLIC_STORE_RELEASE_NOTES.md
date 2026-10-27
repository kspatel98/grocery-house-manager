# GHM v151 — Public merchandise checkout, storefront cards and fulfillment controls

## What changed

1. **Storefront**: compact product cards keep name and price below the image; both **Buy now** and **Add to cart**; clicking a card opens an accessible product detail dialog with full text and imagery. Cart persists, and the dedicated Orders tab remains.
2. **Customer access**: old `MERCH_PILOT_EMAIL` no longer permanently blocks other customers after an admin changes the audience. Admin → Merchandise orders → **Store checkout & fulfillment settings** offers **Paused**, **Private pilot**, and **Public — all signed-in customers**. These choices live in the database, not `.env`, and survive rebuilds.
3. **Fulfillment**: admin selects **Manual review and submission** or **Automatic supplier draft submission**. Automatic draft submission runs only for payment-verified orders and retains durable idempotency safeguards. The merchant MUST still inspect supplier cost and click **Approve supplier wallet charge**. **No automatic PrintKK wallet payment** is enabled; the external quote/charge format and real shipping must be verified before that is safe.
4. **Safety**: a database setting cannot bypass the server's minimum Stripe, signed webhook, Stripe Tax and PrintKK configuration. Moving to Public requires confirmation. The legacy pilot setting applies only until the admin saves its first policy row.
5. **New tests**: signed-in public/paused policy and one-time supplier draft creation regression tests.

## Before opening the store

1. Confirm the self-purchase appears as **Paid** in GHM My Orders, and as the correct supplier order in PrintKK. Merely placing a PrintKK dashboard order does not establish that GHM's checkout and webhook work.
2. Confirm your Stripe keys are in **live mode** and the merchandise webhook returns 2xx for a signed `checkout.session.completed` event; test payment in Stripe test mode first.
3. Set server secrets and verified pricing: `PRINTKK_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERCH_CHECKOUT_ENABLED=true`, `MERCH_TAX_ENABLED=true`, and `MERCH_SHIPPING_CENTS_CAD` to a valid **customer charge**, after confirming the supplier charges for your delivery regions. Configure Stripe Tax registrations as required.
4. Deploy v151, start the backend, and ensure the new `merch_store_controls` database table was created. No destructive migration is required.
5. In **Admin → Merchandise orders → Store checkout & fulfillment settings**, choose **Public — all signed-in customers** and **Manual review and submission**, then Save and confirm. This works even if the old `MERCH_PILOT_EMAIL` variable remains set; the database selection takes precedence.
6. Log in with a **different normal GHM account** (not the pilot) and check Shop → product detail → Buy now → Cart → secure quote → Stripe → My Orders. Test a real order only once the configured payments, taxes, shipping, supplier prices, cancel/refund handling and support contact are verified.
7. To allow automatic drafts **only after successful manual supplier testing**, set `MERCH_AUTO_FULFILLMENT_ALLOWED=true` on the server, deploy/restart backend and select **Automatic supplier draft submission** in Admin. The 40-second background worker creates *drafts*, not paid supplier orders; verify the resulting PrintKK draft and supplier price and approve the supplier wallet charge manually. A timeout leaves an uncertain state that requires admin reconciliation; the worker cannot blindly retry it.

## Safe deployment

```bash
# On your workstation: replace tracked project files from this ZIP; preserve secrets.
git add . && git commit -m 'GHM v151 public merch store and fulfillment controls' && git push origin main
# Wait for both GitHub Actions jobs to PASS.

# On DigitalOcean:
cd /var/www/grocery-house-manager
git status --short
# If tracked files are modified, resolve them safely before pulling (do not delete .env).
git pull --ff-only origin main
docker compose up -d --build backend frontend
docker compose ps
docker compose logs --tail=100 backend
```

## Verification limitations

- In this environment **56 backend tests passed** using local test-only substitutes for unavailable auth/Stripe dependencies; production CI is still authoritative.
- TypeScript/TSX syntax was parsed, but the complete Vite/TypeScript production build could not run because the install stalled. **Do not assume GitHub Actions passes until it does.**
- We did not access your PrintKK credentials or create an order, so real supplier fulfillment and tax readiness cannot be certified.
- Automatic supplier wallet debiting is **not implemented** in v151, deliberately, to prevent an unknown shipping/cost amount from charging the merchant account.
- Customer checkout requires login and currently accepts Canadian addresses only.
- Order cancellation after PrintKK starts production is not guaranteed, and requires customer support/reconciliation.
