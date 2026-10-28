# GHM v152 — Public Checkout Settings Hotfix

## Root cause
In v151 the admin PUT /merch/admin/store-controls refused to save `public` when *any* required backend checkout configuration was missing. The UI placed the error below the orders listing, making the selection appear to revert to Paused.

## Changes
- The admin can now save `public` as a **desired audience** in the persistent database even if payment readiness is incomplete. The chosen automatic fulfillment mode can similarly be saved before its worker is authorized, but the worker remains hard-blocked by `MERCH_AUTO_FULFILLMENT_ALLOWED`. A confirm dialog still guards against accidental public activation.
- **Payments remain blocked by backend `ready()` and `require_ready()` until the merchant config is complete.** This fix does NOT bypass Stripe, tax or PrintKK safety gates.
- Admin now shows saved audience, effective live status, and which environment settings are missing directly beside the Save button. Save failures appear at the same location.
- The read-only readiness endpoint includes `checkout_live` and `missing_configuration` without exposing secret values.
- Regression test covers the missing-config/public-setting scenario and confirms customers cannot check out until readiness returns.

## Deployment and activation
1. Deploy this package as source changes to your GitHub repository and wait for CI. Do NOT overwrite `backend/.env` or delete volumes.
2. Configure `MERCH_CHECKOUT_ENABLED=true`, `MERCH_TAX_ENABLED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTKK_API_KEY`, and valid `MERCH_SHIPPING_CENTS_CAD` in the backend environment. These fields must be correctly provisioned, not sample placeholders. Stripe Tax registrations and real shipping economics still need live validation.
3. Restart the backend to reload environment. Visit Admin → Merchandise Orders and select **Public** and **Manual**. Save, then click **Recheck checkout readiness**.
4. The UI will distinguish **Public saved** from **Public checkout live**. Sign in with an ordinary test account and confirm an actual quote before making the store publicly available.
5. If settings revert despite the success message, check that both frontend and backend run v152 and share the same persistent database; review backend logs for DB errors.

**Safety:** A complete live payment + PrintKK test is still required. One order placed directly through PrintKK does not verify GHM's Stripe webhook fulfillment integration.

## Validation notes
- 58 backend tests passed in a local test harness. Because Stripe and authentication libraries were not available in this container, test-only substitute modules were placed **outside** the release package; run GitHub Actions with real installed dependencies before deployment.
- All 91 frontend TS/TSX source files parsed with the local TypeScript parser. Full `npm ci` + production build was not possible in this environment.
- No live Stripe transactions, tax quote, or PrintKK orders were performed by this hotfix.
