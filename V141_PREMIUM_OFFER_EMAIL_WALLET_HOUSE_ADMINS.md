# Grocery House Manager v141 — Offer polish, branded email, personal/house credits, house admins

## What changed

1. **Personal offers / premium invitations:** The former permanently expanded golden fixed card is replaced by a compact, high-contrast *Special GHM offer* notice below the header. Tapping it opens an accessible scrollable dialog with a clear headline, benefit summary, expiry, single action, later/decline controls, and dark/light-compatible legibility. This stops the full offer card from covering floating Chat / Tell GHM buttons or the mobile bottom tab bar. `OfferCrownWidget` continues to refresh when window focus/visibility changes, with a lighter 30-second polling interval.
2. **Admin offer email:** Stronger brand header and visible logo, recipient greeting, specific issued-offer terms and expiration, unambiguous call to action, compact warm-regards signature matching selected sender role, subtle *GHM Care Team* graphic seal (visual brand mark, **not** an official/legal verification badge), support and unsubscribe. No duplicate generic sales paragraph. The administrator still explicitly previews and confirms sending one email, and offers must already have been created through existing admin controls. `GHM_BUSINESS_MAILING_ADDRESS` must be set to your legitimate postal mailing address for a promotional send; this field is visible in the footer. No sender identity or physical address is fabricated.
3. **Personal credits and shared house fund:** Members can buy fixed packs of 4, 10, or 20 closed-loop GHM service credits at CAD $1 per credit. The payment screen explicitly identifies its destination: **My personal GHM account** or **directly to [the exact selected house]**. A Stripe *signature-verified* webhook adds credits **once** after payment completes, not after visiting a success URL. Members can also contribute existing personal credits to a chosen house. Transfers cannot be reversed inside the app and aren't a cash wallet.
4. **Service redemption:** A house owner or promoted house admin can exchange pooled house credits for *feature-specific* packs. Default example: **4 receipt scans for 2 credits**, or **10 receipt scans for 4 credits**. Other feature rates are intentionally **unavailable until configured** in `GHM_CREDIT_REDEMPTION_RATES`, to avoid charging less than provider costs. Redemptions grant service entitlements to the house and are tracked in both the wallet ledger and existing per-feature usage ledger. Included subscription allowances and existing feature-pack purchases are unchanged.
5. **Roles / permissions:** House owner can now promote existing house members to **House Admin** or demote them in the member drawer of the House page. Backend only permits owner to modify roles and never changes or transfers ownership. Admins can redeem house credit pools; general members can only buy/contribute. After redemption, usage of shared service packs still follows the owner's existing *Allow all house members to spend purchased house credits* policy. This *house admin* is not a site-wide GHM administrator.
6. **Ledger and deletion safeguards:** Personal and house credits keep separate, time-stamped append-only event histories with contributor names. SQL conditional updates prevent overspending. Deleting a house with a positive purchased service or pooled credit balance is blocked pending support handling; this avoids accidentally destroying paid value.
7. **Admin feature economics:** Wallet credit purchase income is included in the existing estimated report alongside direct feature-pack sales. It is not net revenue or profit, and Stripe fees, returns, taxes, hosting, and provider charges remain unverified.

## Pricing example & decision

- 1 GHM credit = **CA$1** at purchase; minimum checkout pack is four credits, to reduce small-payment transaction costs.
- A member buys 4 credits for **CA$4** personally (account balance +4), contributes 4 to "Home A" (personal -4; Home A +4).
- The house owner or a house admin redeems **4 receipt scans for 2 credits** (Home A balance falls from 4 to 2; Home A's receipt-scan extra balance increases by 4).
- Another member can buy four credits and send them **directly** to "Home A" in one purchase (no personal transfer step).
- Extra service credits then work with the existing feature-specific counters. Members do not need to own the whole subscription to contribute.
- Existing *direct-to-house feature packs* from v140 remain accessible as an alternative, with existing configured prices.

## Production requirements

1. Back up production PostgreSQL and preserve `backend/.env` and `frontend/.env`. Additive new tables: `credit_wallet_balances`, `credit_wallet_events`. `Base.metadata.create_all` creates them on startup if database privileges allow; verify they exist, or run controlled migrations.
2. Set `STRIPE_SECRET_KEY` and **`STRIPE_WEBHOOK_SECRET`**. Stripe must be configured for `checkout.session.completed` at the existing GHM billing webhook route. Keep purchases in Stripe test mode first. Verify webhook retries, duplicate delivery, failed purchases, member removal during checkout, concurrent transfers and service redemption.
3. Business contact: configure **`GHM_BUSINESS_MAILING_ADDRESS`** in backend `.env` with the legal business postal address before sending promotional emails. The admin send action rejects sends when this is empty. This is separate from SMTP/Resend credentials.
4. Optional service redemption rates: `GHM_CREDIT_REDEMPTION_RATES={"grocery_3":2,"lookup_25":2,"ask_25":3,"vision_2":3,"price_3":4}`. These are ILLUSTRATIVE ONLY, **not provider-cost-tested prices**. Receipt pack rates already configured in code; all other packs remain disabled by default.
5. After code deployment, verify the owner's `House > Members > Make admin` control, two-house distinction in purchase destination, owner-only service conversion, and household activity ledger with multiple member contributions.
6. Check v141 offer dialog in iPhone Safari, desktop Chrome, dark/light themes, and when bottom action buttons are visible. Preview a free-access email in Gmail before sending to an opted-in recipient. Verify offer expiry and free-access period agree with the server record.
7. Run complete frontend build (`npm ci && npm run build`) and backend regression tests in a full dependency environment; dependencies cannot be fetched from this isolated packaging environment.
8. Before public launch, add **refund and chargeback reconciliation/reversal flows**, privacy/consumer disclosures, and customer support for house dissolution. Automated payment reversal is NOT included here; limit to staging/internal testers until this is resolved. Review the treatment of prepaid service credits and commercial email under applicable Canadian laws with qualified advisers.

## Verification done in this package

- `PYTHONPATH=backend python backend/tests/test_v141_credit_wallet.py` passed (Stripe replay grants once, personal-to-house transfer, owner-only redemption, insufficient balance rejection, direct-to-house purchase).
- Python `compileall` passed on backend modules.
- Changed frontend TypeScript/TSX source **syntax parsing** passed with the system TypeScript transpiler.
- No live Stripe charges, recipient emails, full React production build, or end-to-end device tests were performed. Do not treat source-level checks as a production launch approval.
