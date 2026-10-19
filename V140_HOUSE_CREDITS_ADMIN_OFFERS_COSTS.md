# Grocery House Manager v140 — Credits, shared quotas, admin offers, usage economics, mobile chat

## What changed

- Family Plus included: 10 grocery image scans/month, 100 uncached lookups/month, 120 Ask GHM responses/month, 5 new paid price/flyer provider invocations/day, 15/month.
- Household Pro included: 20 grocery image scans/month, 200 uncached lookups/month, 250 Ask GHM responses/month, 10 new paid price/flyer provider invocations/day, 25/month. Receipt scans (10), Kitchen Vision (10), owned houses (10), per-house active lists (20) are unchanged.
- All included paid-provider invocations and monthly AI quotas are **per subscription owner across all houses they own**, not per house. Saved/cached data remains reusable at no extra provider allowance cost. Provider counters now use `owner_provider_budget` (new table); old house-scoped counters are not migrated to the account counter.
- House-specific extra service credit balances and contribution/spend ledger: the system tracks a separate unit balance per feature and per house, contributing member, purchase reference and date; there is no cash wallet or stored monetary value.
- New `/houses/:houseId/credits` UI: member purchases, balances, contribution history and owner-only toggle `Allow all house members to spend house credits`. House owner/admin may spend when restricted. Everyone in the house can contribute.
- Included allowances get used first; when exhausted, a permitted house member can use purchased credits. Existing personal receipt credits are maintained separately for backward compatibility, and remain used before house receipt credits. Both are excluded from next month's included receipt scan tally.
- Existing 4-scan CA$2 and 10-scan CA$4 receipt prices carried into house packs. Other price packs are **disabled** until explicitly configured; this avoids publishing unvalidated margins. See environment configuration below.
- Admin `/admin`: branded promotional email compose/preview/copy and explicit recipient-confirmed send using existing Resend/SMTP provider; select recipient, existing issued offer, purpose, and signature (GHM Team/Founder/CEO/Owner). No fictitious offer is minted by the email composer. The existing admin form creates real personalized or free-access offers first. Each send attempt is logged.
- Promotional email includes logo, support contact and cryptographically authenticated unsubscribe link; account/security emails stay enabled. Admin must attest marketing permission/legal basis per send. Review CASL and CAN-SPAM obligations with legal counsel before promotions.
- Admin **Feature Economics**: measured monthly feature usage and configurable estimated unit costs; estimated total is not actual vendor cost/profit. Includes paid house credit usage. Refunds/chargebacks, Stripe fees, failed receipt OCR attempts, app hosting, external retailer/search provider costs, subscription revenue, taxes are not fully reconciled in this report.
- Mobile full-screen Ask GHM CSS adjustment scoped **only** to Ask GHM's `.page.shell.wide.v125-ask-page`; does not wipe padding across other pages. Higher-contrast admin password-reset/email-status cards and created-offer tiles in dark theme.

## Deployment checklist

1. Back up DigitalOcean PostgreSQL before deploying and preserve production `.env` files. Git does not need backend `.env` or frontend `.env` secrets committed.
2. Verify current backend `.env`: `STRIPE_SECRET_KEY`, **`STRIPE_WEBHOOK_SECRET`** (required for signed webhooks), `FRONTEND_URL=https://grocery-house-manager.com`, Resend or SMTP credentials. v140 refuses unsigned billing webhooks. Make sure Stripe's existing webhook points to `https://grocery-house-manager.com/api/billing/webhook`, with `checkout.session.completed` enabled.
3. Review `backend/.env.example` and add credit-pack prices only after checking each provider's actual cost. `GHM_HOUSE_CREDIT_PACK_PRICES_CENTS` is JSON mapping pack keys to CAD cents; for example `{"grocery_3":299}`. A configured value overrides receipt defaults. Prices under 50 cents are disabled. Existing subscription and personal receipt packs continue unchanged.
4. For the admin cost page, set `GHM_ESTIMATED_UNIT_COST_CAD` with YOUR measured estimated CAD costs per chargeable event, e.g. `{"grocery_scan":0.10,"product_lookup":0.03,"ask_ghm":0.08,"kitchen_vision":0.20,"paid_provider":0.50,"receipt_scan":0.17}`. These are **illustrative**, not verified vendor rates or pricing advice. Missing costs are shown as 'Cost not configured'.
5. `python -m compileall -q backend/app`; run the full backend pytest suite on a configured environment; then `cd frontend && npm ci && npm run build`. Do not launch paid features before these checks pass.
6. On server: `git pull origin main`, `docker compose up -d --build`, inspect `docker compose ps` and backend logs, and verify database startup initializes the new tables: `owner_provider_budget`, `house_credit_balances`, `house_credit_events`, `house_credit_policies`, `admin_offer_email_events`, `marketing_opt_out`.
7. Stripe test mode: one member buys a four-receipt House Credit pack, returns to correct house, verifies contribution credited exactly once after verified webhook; replay the webhook; simulate duplicate and declined checkout, team permission toggle, exhausted quota, and membership changes. Verify no credits granted from merely visiting success page.
8. On mobile Ask GHM, test iOS Safari, Chrome, landscape and bottom safe-area insets. In admin, preview branded emails in light/dark and test Resend/SMTP with a consented internal test recipient. Test unsubscribe link, and ensure subsequent marketing sends are rejected.
9. For credit refunds/chargebacks, no automated reversals have yet been integrated. Before accepting a significant volume of purchases, add a reliable reversal/chargeback reconciliation workflow and monitor Stripe disputes. Keep initial rollout internal/staging.

## Credit pack keys and units

| Pack key | Feature | Units | Default price |
| --- | --- | ---: | --- |
| receipt_4 | receipt_scan | 4 | CAD $2.00 |
| receipt_10 | receipt_scan | 10 | CAD $4.00 |
| grocery_3, grocery_8 | grocery_scan | 3, 8 | Unpriced until configured |
| lookup_25, lookup_75 | product_lookup | 25, 75 | Unpriced until configured |
| ask_25, ask_75 | ask_ghm | 25, 75 | Unpriced until configured |
| vision_2, vision_5 | kitchen_vision | 2, 5 | Unpriced until configured |
| price_3, price_8 | paid_provider | 3, 8 | Unpriced until configured |

## Verification status in this package

- Focused SQLite/Python tests for **same-payment idempotency**, shared account paid-provider quota across two houses, and owner control of member spending: **3 passed**.
- All modified Python backend modules compiled with `compileall`.
- Modified TSX source files parsed without syntax diagnostics with the system TypeScript parser.
- Full frontend release build and full integration suite not verified because external dependencies (`react`, `stripe`, `python-jose`, and other app modules) are unavailable in the provided environment and package installation cannot reach the Internet. Test in staging.

## Limitations worth addressing next

- Production-grade Stripe refunds, chargebacks, and asynchronous purchase reconciliation need dedicated validation and UI.
- Included monthly allowances use UTC calendar months; day-based price/flyer limits use UTC days. A user-facing local-time countdown can be added later.
- Admin feature costs are informed estimates, not an accounting integration or direct DigitalOcean, Apify, Serper, and Tabscanner invoice feed.
- Sending branded promotional email is not equivalent to legal consent; promotional messages need a lawful basis, clear sender identity and working unsubscribe.
