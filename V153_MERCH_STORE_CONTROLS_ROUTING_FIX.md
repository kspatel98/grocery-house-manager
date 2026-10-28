# GHM v153 — Public checkout settings save fix

## Reported failure
Admin → Merchandise Orders → Store checkout & fulfillment settings → Save store settings showed:

> Input should be a valid integer, unable to parse string as an integer, Field required, Field required, Field required.

The store remained Paused.

## Confirmed root cause
`merch_festivals.router` was registered before `merch_orders.router` in `backend/app/main.py`.
Its broad route `PUT /merch/admin/{product_id}` was intercepting `PUT /merch/admin/store-controls`.
FastAPI attempted to parse the string `store-controls` as the integer `product_id` and validate the store-control JSON against the **product-edit** schema. The intended settings endpoint never executed.

## Changes
- Register `merch_orders.router` before `merch_festivals.router` so exact administrative settings routes take priority.
- Constrain product edit and delete routes to numeric IDs with Starlette's `/{product_id:int}` path converter, so no text endpoint can be mistaken for a product ID even if router order changes again.
- New regression test sends a real HTTP PUT through FastAPI with the old problematic router order, verifies Public was saved, reads it back through the readiness endpoint, and confirms numeric product editing still works.
- No change to the existing payment, tax, supplier-approval or account-authentication checks.

## Testing
- 59 backend tests passed locally (missing optional auth/payment dependencies substituted in local test harness).
- Standalone HTTP route regression test passed.
- Python compilation of backend passed.
- Frontend source unchanged. A full frontend build was not available locally: offline npm dependency installation failed because a required package was not cached. GitHub Actions is the authoritative build check.

## Deployment
1. Commit the updated v153 source and push to GitHub. Verify GitHub Actions succeeds.
2. On your DigitalOcean server:

```bash
cd /var/www/grocery-house-manager
git pull origin main
docker compose up -d --build backend frontend
docker compose ps
```

Preserve existing `.env` files and persistent volumes. Backend recreation is required to load the new routing code. You do not need a new environment variable for this fix.

3. In GHM Admin → Merchandise Orders → Store checkout & fulfillment settings, select Public + Manual review and click Save store settings.
4. Confirm **Saved store mode: Public**. If payments are still blocked, look at **Missing server settings** in the readiness panel; saving Public is not proof the service is ready to accept payments.
5. Before allowing external customers to pay, confirm tax/shipping, valid PrintKK variants and an end-to-end real payment with verified order tracking and refund behavior.

## Security note
Even when Public is saved, the backend will not allow new checkouts until the Stripe, Stripe Tax, PrintKK and shipping readiness gates pass. Automatic PrintKK wallet charges are not activated by this update.
