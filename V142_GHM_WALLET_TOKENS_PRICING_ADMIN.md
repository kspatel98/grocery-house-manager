# GHM v142 — Wallet, Tokens, and Admin Credit Pricing Manager

Based on v141. This is a **source update**. Make a staging deployment and test all payment flows before accepting live GHM Token sales.

## What's changed

- Added `/wallet` as the main authenticated GHM Wallet page, accessible using a token icon in desktop and mobile headers; `/houses/:id/credits` redirects there for backward compatibility.
- The green-and-gold `frontend/public/brand/ghm-token.svg` embeds the official Grocery House Manager icon. Coin and tile microinteractions respect `prefers-reduced-motion`.
- Members can purchase 4, 10, or 20 closed-loop GHM Tokens to their account or to a **selected house**. Any member can contribute personal Tokens to a house they belong to. No token withdrawal or house-to-person withdrawal is supported.
- House owners and promoted house admins alone exchange the house's pooled Tokens for additional service packs. Ordinary house members can use already-redeemed services only according to the house's existing spending permission policy. Personal and house credit ledgers remain separate and attributed.
- All existing service pack types are consolidated into token-only redemption, including both size choices for groceries, Ask GHM, lookup, Kitchen Vision and price/flyers. No more direct per-service CAD checkout from Pricing or House Credits.
- Additional purchased service-unit balances and owner spending-permission control are visible in Wallet. Prior purchases and already-owned receipt scan credits stay valid and are not silently converted.
- Pricing page extra receipt scans section was replaced with a GHM Wallet explanation and link. Receipt Scan exhausted-credit CTA now opens Wallet. More includes Wallet and the feature-usage help points there as well.
- Admin > Credit Pricing Manager: save token pack CAD prices, service redemption costs in tokens, estimated provider expense for the whole pack, enabled/disabled, and estimated net after a modelled processing fee. Changes are in `ghm_credit_pack_pricing` SQL table and apply on the next request. Existing Stripe checkout sessions retain the prices captured when the session was opened.
- The token wallet starts with receipt exchange defaults (4 scans = 2 tokens, 10 scans = 4 tokens); other exchange pack rates are unavailable until admin sets them. Existing `GHM_CREDIT_REDEMPTION_RATES` env settings remain fallback values until replaced in Admin.
- Fixes optional `.env` keys rejecting settings startup (`extra="ignore"`) to reduce backend-unhealthy regressions.

## Revenue and cost figures

CAD/token pack prices have default values of 4/10/20 tokens for CA$4/CA$10/CA$20 respectively. Admin may change token pack prices. Token-denominated amounts are **non-withdrawable closed-loop service entitlements**. The displayed cost/margin formula is a *planning estimate*, not measured profit, and relies on administrator supplied per-pack provider costs. It models Stripe fees at 2.9% + 30¢/checkout, with an approximate fixed-fee allocation for service exchanges. Provider cost variance, coupons, refunds, taxes, foreign card fees, chargebacks, host expenses, and unused credit balances are not fully represented.

## Important compatibility and compliance limits

- Existing Stripe-signed webhook handling is still responsible for payment confirmation, and token credits are granted only when the verified webhook reports the payment as paid. It remains idempotent on Stripe session ID. `STRIPE_WEBHOOK_SECRET` must be configured.
- New legacy direct service-pack checkout endpoints return `410` while **webhooks for purchases already in progress remain supported**. Existing personal extra receipt scan entitlements are still honored by their consumption logic.
- The wallet does not yet implement automatic Stripe refund/dispute/chargeback debit reconciliation or a full finance-grade audit. Do not launch the paid token wallet publicly until those are implemented and tested.
- The permanent token balance and catalog configuration are in PostgreSQL; do not manually edit wallet balances. Take a backup before deployment.
- Promotional email sending remains disabled if `GHM_BUSINESS_MAILING_ADDRESS` is not configured; this package does not bypass that requirement.
- Only houses where the buyer is a current member can receive direct payments or token contributions, and only owner/admin can redeem house funds.

## Admin setup

1. After deployment, open **Admin > Credit Pricing Manager**.
2. Check 4/10/20 token top-up pack selling prices, enable flags, and estimated provider costs.
3. For each extra service pack, enter its **token exchange cost**, the **estimated provider cost for the whole pack in CAD cents**, enable it, and press **Save Changes**.
4. Verify the number of tokens and house name shown before authorizing any payment. The shop uses a Stripe payment checkout; service redemptions use tokens *only*, without going through Stripe.
5. Review feature-cost reports in Admin. They are estimates until matched to provider invoices.

Sample: set `grocery_3` to `2` tokens, `grocery_8` to `5` tokens, `lookup_25` to `2`, etc. Those are examples, not verified profitable rates.

## Suggested staging tests

1. On mobile (< 360 px), open the header Wallet token; test light/dark mode, scrolling, coin motion, and reduced-motion setting.
2. Buy 4 personal tokens in Stripe test mode; verify the balance appears exactly once after the webhook. Test cancelled payment and refreshing a completed success page.
3. Donate 3 personal tokens to House A. Check House B's balance unchanged. Attempt donating to a house you do not belong to (expect `403`).
4. As owner, exchange a small pack for a house; as a normal member, attempt exchange and expect `403`. Test spend permissions.
5. Edit admin prices while another token checkout session is open; its previously agreed amount must still complete, and the new price must apply to a newly opened checkout.
6. Disable a token or service pack, verify it is not buyable or redeemable. Run two concurrent redemptions near zero balance; only one may succeed.
7. Inspect Admin pricing forms in both themes, desktop and mobile, and test keyboard and reduced-motion UX.
8. Verify historic personal receipt scan purchases still work and new receipts link to Wallet instead of the obsolete Pricing page checkout.
9. Add verified refund/dispute reversal logic and end-to-end Stripe webhook tests before enabling public sales.

## Deployment (GitHub + DigitalOcean)

```sh
cd /var/www/grocery-house-manager
git pull origin main
docker compose up -d --build --force-recreate backend frontend
docker compose ps
docker compose logs --tail=120 backend
```

Do not overwrite production `backend/.env`, `frontend/.env`, `docker-compose.yml`, TLS configuration, or database credentials. The new table will be created by the existing `Base.metadata.create_all()` database initialization on a healthy connection; verify it on staging. No front-end `node_modules` are shipped in this zip. Running `npm ci && npm run build` in CI requires registry connectivity.

## Validation performed

- `backend/tests/test_v142_credit_pricing.py` passed (pricing persistence, checkout snapshot, duplicate webhook protection, personal contribution, authorization, disabled pack).
- `backend/tests/test_v141_credit_wallet.py` passed.
- Backend Python modules compiled successfully.
- Modified frontend TSX files parsed successfully using TypeScript's transpiler.
- Full `npm run build` could **not** complete in this container because the archive's `node_modules` was incomplete and `npm ci --offline` could not download all dependencies. Full type-check, actual UI rendering, live Stripe and backend integration remain unverified.
