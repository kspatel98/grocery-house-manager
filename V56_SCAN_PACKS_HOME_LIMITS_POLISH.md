# V56 - Home Limits, Extra Scan Packs, and Members Popup Polish

## Updated
- Main homepage plan cards now show latest Smart Receipt Scan limits:
  - Basic Home: 2 scans/month
  - Family Plus: 5 scans/month
  - Household Pro: 15 scans/month
- Pricing page extra scan packs are always visible and purchasable.
- Removed confusing internal wording about "suggested behavior" from the extra scan pack section.
- Extra scan packs are one-time Stripe Checkout payments:
  - 2 scans for $1 CAD
  - 4 scans for $2 CAD
  - 10 scans for $4 CAD
- Extra scan credits stay on the user account until used.
- Included monthly scans are used first automatically; when included scans are finished, an available extra scan credit can be used after user confirmation.
- Receipt scan usage now shows extra credit balance and a direct link to buy more scans.
- Members popup has smoother backdrop fade and drawer slide animation.

## Backend
- Added receipt scan pack endpoints:
  - GET /billing/receipt-scan-packs
  - POST /billing/receipt-scan-pack-checkout
- Stripe webhook now credits extra scans from completed one-time scan pack checkout sessions.
- Added idempotent `receipt_scan_purchases` table to prevent double-crediting webhook retries.
- Added `users.extra_receipt_scan_credits` and `receipts.receipt_scan_credit_source` support.

## Notes
- Existing subscription plan checkout remains unchanged.
- Extra scans require Stripe webhook to be configured so credits are added after successful payment.
