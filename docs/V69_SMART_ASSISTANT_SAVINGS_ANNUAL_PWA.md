# V69 — Smart Assistant, Savings, Annual Plans, and PWA

This version builds on the V68 mobile header / premium-crown release and focuses on subscription conversion through real household value rather than more decorative features.

## 1. Free Starter is now a real usable plan

Free Starter can create **1 owned grocery house** with:

- 40 products per house
- 1 active shared shopping list
- 4 total members (owner + up to 3 others)
- low-stock and expiry awareness
- no included receipt scans

The API limit enforcement and the Houses / Pricing / Home / Support copy use the same limits.

## 2. Guided first-time setup

`GET /insights/onboarding` calculates real progress from account data. The Houses dashboard shows a short guided setup:

1. Create a grocery house
2. Add 5 groceries
3. Create the first shopping list
4. Invite a household member
5. Finish setup and open Smart Assistant

The UI uses real completion state, not a cosmetic checklist.

## 3. Smart Weekly Grocery Assistant

New protected route: `/assistant`

Backend: `GET /insights/houses/{house_id}/weekly-assistant`

The brief uses actual household data for:

- low-stock products
- out-of-stock products
- products expiring within 5 days
- expired dated products
- products still in stock whose last recorded purchase is 60+ days old (review prompt only; it does not claim the food is unused or unsafe)
- suggested items that are not already on the active list
- one-click creation/update of a smart shopping list
- active shopping-list summary
- monthly supported savings
- simple meal ideas based on in-stock ingredients
- best/alternative store data only when the house owner has Family Plus or Household Pro

The Houses dashboard also contains a prominent Smart Assistant shortcut.

## 4. Defensible “Money Saved” reporting

Backend: `GET /insights/houses/{house_id}/savings`

The estimate intentionally avoids fake savings. It currently counts only:

- discounts recorded on receipts for the receipt month
- completed shopping-list choices where the saved household price data supports that the bought price was lower than another recorded store price

Reports and Smart Assistant show:

- tracked receipt spend
- receipt discounts
- supported lower-price choices
- estimated savings
- current house plan monthly list price
- savings after plan price
- ROI multiple when supported by data

If there is not enough data, the product says so instead of inventing a value.

## 5. Whole-list basket comparison

Backend: `GET /insights/houses/{house_id}/shopping-lists/{list_id}/basket-comparison`

Access: **Family Plus / Household Pro** based on the house owner's plan.

It provides:

- single-store basket estimates
- direct price coverage percentage
- visibly counted estimated/missing rows
- strongest single-store option
- a practical **two-store** option (never a many-store-per-item fantasy route)
- potential difference versus the strongest single-store estimate

The comparison uses saved household price history. It does not pretend old/missing rows are live prices. The existing Canadian live-price tools remain separate.

## 6. Annual billing

Plan display prices:

- Basic Home: **$17.99 CAD/year**
- Family Plus: **$39.99 CAD/year**
- Household Pro: **$59.99 CAD/year**

Monthly prices remain unchanged. Family Plus remains the recommended / Most Popular plan.

Create three recurring yearly Stripe Prices and add their IDs to `backend/.env`:

```env
STRIPE_PRICE_BASIC_ANNUAL=price_...
STRIPE_PRICE_FAMILY_ANNUAL=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

The existing monthly environment variables stay unchanged. Checkout now accepts `billing_cycle: monthly | annual`. The automatic 65% new-user Basic offer remains monthly-only so its existing “first two billing months” behavior stays unambiguous.

## 7. Phone-first / PWA improvements

- installable manifest upgraded with start URL, scope, app categories, and maskable-capable icon declarations
- service worker caches the app shell/static assets and supports SPA navigation fallback
- the most recently loaded shopping-list data is cached locally as an offline fallback
- product form can use the rear camera to scan barcodes on browsers with the native `BarcodeDetector` API
- unsupported barcode browsers keep the normal manual barcode input
- Smart Assistant can request optional browser/device notifications and rate-limits repeated reminders per house
- service worker handles notification clicks and contains a standards-based Web Push receiver for future VAPID/server delivery

The current reminder path is intentionally permission-based and non-blocking. True server-initiated background Web Push still requires persistent push subscriptions + a VAPID sender/cron service; this release does not fake that backend capability.

## 8. Public conversion / trust changes

Homepage now emphasizes the outcome:

**Know what I have → know what I need → know where to buy → know what I spent → know what I saved.**

It adds:

- Smart Weekly Assistant section
- realistic illustrative weekly brief clearly labeled as illustrative
- explicit CAD plan pricing
- annual price alternatives
- Family Plus “Most Popular” positioning
- Free Starter “no card” / usable-house proof
- live community totals/rating/review excerpt only when real review-summary data exists
- Stripe billing trust cue
- review-before-save receipt messaging
- “no invented savings” messaging
- install/offline explanation

## Deployment notes

1. Deploy backend and frontend together because the frontend depends on the new `/insights/*` endpoints and annual `Plan` response field.
2. Add the three annual Stripe Price IDs before enabling annual checkout in production.
3. Serve the frontend over HTTPS. Camera scanning, service workers, installation, and notifications are restricted on insecure origins by modern browsers.
4. After deployment, open the site once in a fresh/incognito browser to ensure the V69 service worker replaces older cached versions.
5. Test annual Stripe checkout in Stripe test mode before switching the annual price IDs to live mode.
