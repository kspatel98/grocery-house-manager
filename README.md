# Grocery House Manager

## v27 SMTP network patch

This version includes a forgot-password SMTP network fix for Docker servers showing `OSError: [Errno 101] Network is unreachable`. See `SMTP_NETWORK_FIX.md` and run `docker compose exec backend python -m app.scripts.smtp_network_check` after deployment.


A full-stack grocery management platform for shared households.

## Brand structure

- **Company / parent business:** SupremDas Group
- **Product / app name:** Grocery House Manager
- **Website:** https://grocery-house-manager.com
- **Category:** SaaS for household productivity and grocery management
- **Recommended Stripe public business name:** SupremDas Group
- **Recommended Stripe product name:** Grocery House Manager
- **Recommended statement descriptor:** GROCERY HOUSE

Use **SupremDas Group** for business/account identity and **Grocery House Manager** for the customer-facing software product.


### v12 update

- Coupon validation now returns calculated discounted prices for each paid plan.
- Pricing cards immediately show the original monthly price crossed out and the new coupon price after a valid code is applied.
- Stripe Checkout still receives the verified Stripe promotion code ID so the customer pays the discounted amount.


## Features

- Email/password registration and login
- Google Sign-In backend endpoint using Google ID token verification
- JWT authentication
- Create a house and invite others with a join link
- Editable inventory sections such as Fruits, Snacks, Dairy, etc.
- Add, edit, remove products with icon/image, quantity, unit, price, store, expiry date, barcode, notes, and low-stock threshold
- Sort products by name, price, store name, quantity, section, created date, or expiry date
- Grocery list builder: select multiple inventory products, set shopping-only quantity, add per-item message/note
- Shopping workflow: products start under “Products to buy”; checking them moves them under “Added in cart”
- “Shopping done” confirmation updates the real inventory quantities
- Low-stock hints, expiring-soon hints, and household role support
- Docker Compose for PostgreSQL + backend + frontend

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI + SQLAlchemy
- Database: PostgreSQL

## Quick start with Docker

1. Copy env files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Edit `backend/.env` and set:

```env
SECRET_KEY=change-this-to-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

Google login will only work after you create a Google OAuth Web Client ID and add it to both env files.

3. Start everything:

```bash
docker compose up --build
```

4. Open:

- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

## Local development without Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Google login setup

1. Go to Google Cloud Console.
2. Create OAuth client credentials for a Web application.
3. Add authorized JavaScript origin: `http://localhost:5173`.
4. Put the Web Client ID in:
   - `backend/.env` as `GOOGLE_CLIENT_ID`
   - `frontend/.env` as `VITE_GOOGLE_CLIENT_ID`

## Important production notes

- Replace the demo `SECRET_KEY`.
- Use HTTPS in production.
- Add email verification for email/password accounts.
- Add refresh tokens or server-side sessions if you need longer-lived auth.
- Use Alembic migrations instead of `Base.metadata.create_all` for production database changes.
- Store product images in cloud storage, not only as external URLs, if users need uploads.

## API overview

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /houses`
- `POST /houses`
- `POST /houses/{house_id}/invite`
- `POST /houses/join/{token}`
- `GET /houses/{house_id}/sections`
- `POST /houses/{house_id}/sections`
- `PATCH /houses/{house_id}/sections/{section_id}`
- `DELETE /houses/{house_id}/sections/{section_id}`
- `GET /houses/{house_id}/products?sort_by=price&direction=asc`
- `POST /houses/{house_id}/sections/{section_id}/products`
- `PATCH /houses/{house_id}/products/{product_id}`
- `DELETE /houses/{house_id}/products/{product_id}`
- `POST /houses/{house_id}/shopping-lists`
- `GET /houses/{house_id}/shopping-lists/active`
- `PATCH /houses/{house_id}/shopping-lists/{list_id}/items/{item_id}`
- `POST /houses/{house_id}/shopping-lists/{list_id}/done`

## Update notes - shopping list, members, and activity feed

This version adds:

- Clear **Sort by store name** option in the inventory toolbar.
- Editable active grocery list title.
- Add more products to an existing active grocery list.
- Remove products from an active grocery list.
- Cancel an active grocery list without changing inventory.
- Fixed the shopping-list checkbox API flow so checking an item moves it from **Products to buy** to **Added in cart**.
- House member list showing who is in the same house, with name, email, role, and avatar when available.
- Activity feed for each house, including examples like product added, list created, list completed, item moved to cart, member joined, etc.

### Rebuild after downloading this update

```bash
docker compose down
docker compose up --build
```

If Docker keeps using an old backend image, run:

```bash
docker compose build --no-cache backend
docker compose up
```

The app creates the new `activities` table automatically on backend startup. Existing houses, products, and shopping lists should stay in PostgreSQL unless you delete the Docker volume.

## Frontend npm Docker build fix

This version uses Node 20 and pins frontend package versions. If you previously extracted an older ZIP, delete the old `frontend/package-lock.json` before rebuilding, because an older lock file may contain environment-specific package URLs.

Recommended clean rebuild:

```bash
docker compose down
rm -f frontend/package-lock.json
docker compose build --no-cache frontend
docker compose up
```

On Windows PowerShell:

```powershell
docker compose down
Remove-Item frontend\package-lock.json -ErrorAction SilentlyContinue
docker compose build --no-cache frontend
docker compose up
```

## v5 fixes

- Grocery list now has a dedicated page at `/houses/:houseId/shopping` so it no longer sticks over the Members and Activity panels.
- The inventory page now shows a compact grocery-list summary card with an **Open grocery list** button.
- Checking a shopping item now uses a dedicated backend status endpoint: `POST /houses/{house_id}/shopping-lists/{list_id}/items/{item_id}/status`.
- Quantity/message edits still work from the shopping page and return the full refreshed list.
- Added a small development schema helper so existing local PostgreSQL Docker volumes from older ZIPs can safely receive new starter columns.

## v6 fixes

- Added a dedicated **Profile** page at `/profile`.
- Profile page shows and edits required account details: full name, email, avatar URL, login method, user ID, and account creation date.
- Logout is now inside the Profile page.
- Product edit is more defensive: the frontend sends cleaned values and the backend reloads the saved product with its section before responding.
- Added a near-real-time house update channel using WebSockets: `/houses/{house_id}/updates/ws`.
- Inventory, members, activity feed, and the active shopping list refresh automatically on other users' screens when anyone in the house makes a change.
- Added extra development schema helpers for older Docker PostgreSQL volumes.

### Clean rebuild for this version

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up
```

If old database columns still cause strange errors during development, reset the local PostgreSQL volume only after you are okay losing test data:

```bash
docker compose down -v
docker compose up --build
```

## v7 Chrome CORS fix

Chrome can be stricter about cached CORS preflight responses for `PATCH` requests. In this version:

- Backend CORS methods are explicit and include `PATCH`, `OPTIONS`, `DELETE`, `POST`, `PUT`, `GET`, and `HEAD`.
- Product edit now uses a POST compatibility route: `/houses/{house_id}/products/{product_id}/edit`.
- Section edit, profile edit, shopping-list rename, and shopping-item edit also use POST compatibility routes from the frontend.

After updating, rebuild the containers without cache:

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up
```

If Chrome still shows an old CORS error, clear Chrome site data for `localhost:5173` and `localhost:8000`, then hard refresh.

## v8 house ownership controls

This version adds house access management rules:

- Normal members can **leave house**.
- Owners can **kick other members out** from the House members panel.
- Owners cannot kick themselves.
- Owners cannot delete a house while other members are still inside it.
- Owners can **delete house** only when they are the only remaining member.
- Leave/kick actions are recorded in the house activity feed for the remaining members.

New endpoints:

- `POST /houses/{house_id}/leave`
- `DELETE /houses/{house_id}`
- `DELETE /houses/{house_id}/members/{member_id}`

Recommended rebuild:

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up
```

## v9 multiple shopping lists + subscriptions

This version adds:

- Product picker rows now show the **store name** and current inventory while creating or editing a shopping list.
- A house can now have **multiple active shopping lists** at the same time.
- The shopping page has list tabs and a **New list** button. Users do not need to finish the current list before creating another one.
- Added a subscription/pricing page at `/pricing`.
- Added account plan details in `/profile`.
- Added Stripe Checkout subscription integration.
- Added plan limits and backend enforcement for:
  - houses per account
  - products per house
  - active shopping lists per house
  - members per house

### Suggested plans included

| Plan | Price | Limits |
|---|---:|---|
| Free Home | $0 CAD/month | 1 house, 150 products/house, 2 active lists/house, 4 members/house |
| Family Plus | $3.99 CAD/month | 3 houses, 500 products/house, 10 active lists/house, 10 members/house |
| Household Pro | $7.99 CAD/month | 10 houses, 2,000 products/house, 30 active lists/house, 25 members/house |

### Stripe setup

1. Create two monthly recurring Prices in Stripe:
   - Family Plus: `$3.99 CAD / month`
   - Household Pro: `$7.99 CAD / month`
2. Copy the Stripe Price IDs into `backend/.env`:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FAMILY_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

3. In Stripe Dashboard or Stripe CLI, send subscription events to:

```text
http://localhost:8000/billing/webhook
```

For production, use your real HTTPS backend URL.

New billing endpoints:

- `GET /billing/plans`
- `GET /billing/me`
- `POST /billing/checkout-session`
- `POST /billing/customer-portal`
- `POST /billing/webhook`

Recommended rebuild:

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up
```

## Production deployment note for DigitalOcean Managed PostgreSQL

Version 10 changes the default `docker-compose.yml` to the production setup for DigitalOcean:

- No local `db` container.
- The backend uses `DATABASE_URL` from `backend/.env`.
- Caddy is included for HTTPS and `/api` routing.
- `www.grocery-house-manager.com` redirects to `grocery-house-manager.com` so browser login storage does not split between two domains.

For local development with a Docker PostgreSQL database, use:

```bash
docker compose -f docker-compose.local.yml up --build
```

For DigitalOcean production, use:

```bash
docker compose up --build -d
```

Make sure `backend/.env` contains your DigitalOcean Managed PostgreSQL URL, for example:

```env
DATABASE_URL=postgresql+psycopg2://doadmin:YOUR_PASSWORD@YOUR_DB_HOST:25060/defaultdb?sslmode=require
```

Do not add a `DATABASE_URL` override inside the production `docker-compose.yml`; that would make the backend ignore your managed database.

## v11 invitation confirmation, account deletion, About page, pricing, and coupons

This version adds:

- Invitation links now show a confirmation screen before adding the user to a house.
  - The user sees the house name and inviter name.
  - Accept joins the house.
  - Decline returns to the houses page without joining.
- Profile page now has a **Delete account** danger-zone flow.
  - User must type their exact full name, or email if no name exists.
  - Account deletion is blocked if the user owns shared houses that still have other members.
- Added `/about` page with professional project information, features, how to use, best practices, and company information.
- Pricing updated to:
  - Free Starter: $0
  - Basic Home: $1.99 CAD/month. Private discounts are applied with Stripe coupons/promotion codes.
  - Family Plus: $4.99 CAD/month
  - Household Pro: $6.99 CAD/month
- Added optional Stripe coupon validation and checkout discount application.
  - Users can enter a coupon code on the pricing page.
  - The backend validates active Stripe Promotion Codes.
  - Invalid or expired coupons show a clear message.

New backend environment variable:

```env
STRIPE_PRICE_BASIC_MONTHLY=price_...
```

Create this Stripe recurring monthly Price for the Basic Home regular price, then add the Price ID above. Create private Stripe coupons/promotion codes separately for discounts such as 70% off.

Recommended rebuild:

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up -d
```

New/updated endpoints:

- `GET /houses/join/{token}/preview`
- `POST /auth/me/delete`
- `POST /billing/coupon/validate`
- `POST /billing/checkout-session` now accepts optional `promotion_code_id`

## v13 production branding update

This version prepares the public website for launch under **SupremDas Group** with **Grocery House Manager** as the product name.

Added/updated:

- Added branded header and footer across authenticated pages.
- Added official app logo assets under `frontend/public/brand/`.
- Added browser tab favicon and web app manifest.
- Updated browser title and metadata to `Grocery House Manager | SupremDas Group`.
- Updated login screen with product logo and SupremDas Group branding.
- Reworked the About page into a professional company/product information page.
- Removed personal owner contact details and placeholder owner-edit messaging from the public UI.
- Production frontend now builds and serves the optimized Vite bundle through `vite preview` instead of running the Vite dev server.
- Public paid plan prices are now Basic Home `$1.99`, Family Plus `$4.99`, and Household Pro `$6.99` CAD/month. Private discounts should be handled through Stripe coupons/promotion codes.

Stripe product image suggestion:

```text
frontend/public/brand/grocery-house-manager-stripe-logo.png
```

Use that image in Stripe for the Grocery House Manager product image.

Recommended production deploy after pulling this version:

```bash
docker compose down --remove-orphans
docker compose build --no-cache backend frontend
docker compose up -d --force-recreate
```

Then hard-refresh the browser or open:

```text
https://grocery-house-manager.com/pricing?v=13
```


## v14 brand-positioning correction

This version explicitly separates business identity from product identity across the website and documentation.

- SupremDas Group is presented as the parent business/company.
- Grocery House Manager is presented as the SaaS product/app.
- Header, footer, login page, metadata, About page, manifest, and README were updated with this structure.
- The About page now uses professional company/product wording and does not include personal owner contact details or placeholder edit messages.
- Stripe setup guidance now matches this structure: business/public name `SupremDas Group`, product name `Grocery House Manager`, descriptor `GROCERY HOUSE`.

Recommended deploy test URL after rebuilding:

```text
https://grocery-house-manager.com/about?v=14
```

## v15 launch/premium update

This version includes the missing launch feature set:

- Free Starter users can join houses by invite, but cannot create houses.
- House capacity and shared-house features are controlled by the house owner's plan.
- Members can still use the features available inside houses they join; their own plan controls their own account/owned-house capabilities.
- Receipt price updates are available from the inventory page.
- A single product can now keep multiple store-specific prices, for example milk at Costco, Walmart, and No Frills under one inventory product.
- Shopping-list items can capture bought store and bought price; completing shopping updates inventory quantity and the store-specific price history.
- Pricing includes a new-user Basic offer: 65% off Basic Home for the first 2 billing months when eligible.
- Coupon codes cannot be stacked with the new-user Basic offer. Users see a clear message explaining why and when coupons can be used.
- Coupon validation checks active Stripe promotion codes and returns discounted prices for preview before Checkout.
- UI has clearer professional layout, better plan messaging, header/footer branding, receipt panel, and store-price chips.

### Stripe setup for the new-user Basic offer

Create a Stripe coupon:

- Percent off: `65%`
- Duration: `Repeating`
- Number of months: `2`

Then create a Stripe Promotion Code for that coupon and copy the `promo_...` promotion code ID into `backend/.env`:

```env
STRIPE_PROMOTION_CODE_BASIC_NEW_USER=promo_...
NEW_USER_OFFER_DAYS=14
```

The app applies this automatic discount only for eligible new users choosing Basic Home. When this offer is active, regular coupon codes are blocked so discounts cannot be clubbed/stacked.


## v16 launch update

- Basic Home now clearly shows the new-user offer as a crossed regular price and explains that it renews at the regular $1.99 CAD/month after the first 2 billing months.
- Pricing cards focus on premium features, while the numeric plan limits stay grouped at the bottom of each card.
- Receipt upload now supports image/PDF attachment storage. Images are scanned with OCR when available and matched against existing product names to update store-specific prices automatically.
- Receipt uploads are stored in the backend uploads volume and served from `/uploads/...`; production Caddy routes `/uploads*` to the backend.
- Profile now includes personal premium insights such as receipts uploaded, prices recorded, stores tracked, and tracked spend.
- Stripe checkout now returns clear 400-level messages for missing price IDs, missing Basic new-user promo code, or Stripe API failures instead of causing a backend 500.
- Startup migration now safely ignores the existing `uq_product_store_price` constraint to prevent backend restart loops.

### Receipt OCR note

The Docker backend installs Tesseract OCR and uses it for receipt images. OCR is best-effort; users should review matched products and manually add any missed receipt lines.

### Production environment reminder

For the Basic 65% new-user offer, create a Stripe coupon with 65% off, repeating for 2 months, then create a promotion code and set:

```env
STRIPE_PROMOTION_CODE_BASIC_NEW_USER=promo_...
NEW_USER_OFFER_DAYS=14
```

The regular Basic Home Stripe price should remain $1.99 CAD/month. The discount should be applied by the promotion code, not by creating a separate discounted price.

## v17 update: coupons and cancellation

- Coupon input stays available during the Basic new-user offer window.
- A verified coupon replaces the automatic Basic new-user offer for checkout; discounts are not stacked.
- If a user already has an active subscription or accepted discount, the backend blocks new coupon validation and explains why.
- Profile now includes a Cancel subscription button that schedules cancellation at the end of the current Stripe billing period.
- Stripe webhooks preserve `cancel_at_period_end` status so users keep paid features until the period ends.

## v19 launch polish

This version adds a production-ready public website layer around the existing SaaS app:

- Public homepage at `/` with a clear product pitch, feature sections, workflow, and call-to-action buttons.
- Public Pricing page access for visitors, with login required only when starting checkout or applying account-specific coupons.
- Public About page retained with SupremDas Group as the company and Grocery House Manager as the product.
- New public Support page at `/support`.
- New Privacy Policy page at `/privacy`.
- New Terms of Service page at `/terms`.
- New Refund and Cancellation Policy page at `/refund-policy`.
- Header and footer updated with professional navigation and legal links.
- Mobile-friendly marketing layout and cleaner navigation for public visitors and logged-in users.

Recommended final launch checklist:

1. Verify Stripe live/test mode values match your current environment.
2. Confirm webhook events are successful in Stripe Dashboard.
3. Confirm `support@grocery-house-manager.com` is configured before publishing the support/legal pages broadly.
4. Test homepage, pricing, login, checkout, profile, cancellation, invite joining, receipt upload, and house creation on mobile and desktop.


## Production auth troubleshooting

If Google sign-in opens the Google account selector and then returns to the login page, check these first:

1. `backend/.env` must contain the same OAuth Web Client ID as the frontend:
   - `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
   - `frontend/.env` must contain `VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
2. Google Cloud Console must include these Authorized JavaScript origins:
   - `https://grocery-house-manager.com`
   - `https://www.grocery-house-manager.com` if you allow www before redirect
3. Rebuild the frontend after changing `VITE_GOOGLE_CLIENT_ID` because Vite bakes env values into the build.
4. Check the browser Network tab for `/api/auth/google`; a 401 means OAuth client ID/domain mismatch.

If a paid account appears as Free, go to Profile and click **Sync subscription**. If it still stays Free, check the Stripe webhook deliveries and confirm your live/test keys, webhook secret, and Price IDs all come from the same Stripe mode.

## v23 Visual and product media polish

- Homepage now uses a warmer grocery-ad-inspired visual direction with green/orange brand colors, a stronger hero, feature cards, daily-use sections, and product media preview.
- Added built-in product image presets under `frontend/public/product-icons/` for common grocery items such as milk, eggs, bread, fruits, vegetables, pantry, snacks, cleaning, and toiletries.
- Product modal now includes:
  - built-in product image picker
  - quick emoji icon picker
  - product image preview
  - local image upload with browser-side resize before saving
  - external image URL support
- Inventory product cards now fit images with `object-fit: contain`, so external images and built-in images stay clean without distortion.


## v24 update: faster account loading, safer deletion, and responsive polish

- Added `GET /account/bootstrap` so Profile and Houses can load user, billing, houses, and personal insights with one request instead of several separate calls.
- Profile now uses the bootstrap response to avoid briefly showing incorrect Free/general account data while billing is loading.
- Account deletion now has a safety preview. If the user owns shared houses with other members, deletion is blocked until those members are removed. If the user owns solo houses, the UI clearly warns that those houses and all related data will be deleted.
- Product images now render through a safer responsive visual component with full-image fitting on desktop and mobile. External image URLs use `referrerPolicy="no-referrer"` and inventory cards no longer crop product images in half.
- Homepage desktop/laptop layout has been adjusted with better max widths, margins, and hero image sizing while keeping the mobile layout strong.

## v25 update — top-class UX, admin, reports, and smart shopping

This version adds a larger user-experience upgrade:

- Account signup now asks for country and city.
- Country/city are editable from Profile and displayed in Profile.
- Product/shop prices now display with a currency based on the user's country where possible.
- Product prices can be cleared by leaving the price blank or using the Clear product price button.
- Product images/external image links use safer `object-fit: contain` styling so they do not get cropped/cut on mobile or desktop.
- Added Reports page with store comparison, best-known prices, low-stock/expiry stats, and store activity.
- Added Household Pro smart shopping suggestions on shopping lists:
  - Uses household saved prices from products/receipts.
  - Can ask for browser location permission.
  - Can use manually entered city/country.
  - Shows nearby grocery stores when Google Places API is configured.
  - Falls back to common grocery chains for the user's country/city when no Google Places key is configured.
- Added private Admin Dashboard at `/admin`, protected by backend admin email checking.
- Admin can view users, plans, houses/products/receipts counts, grant plans manually, schedule/cancel/reset a user, and create a latest-payment Stripe refund.

### New backend environment variables

```env
ADMIN_EMAILS=kp3813294@gmail.com
GOOGLE_PLACES_API_KEY=
```

`GOOGLE_PLACES_API_KEY` is optional. Add it only after enabling Google Maps Platform Places API (New). Without it, the app still works and shows city-level fallback grocery chains.

### Admin notes

The Admin Dashboard is available at:

```text
https://grocery-house-manager.com/admin
```

Only emails listed in `ADMIN_EMAILS` can access admin endpoints. The frontend also shows the Admin navigation link for `kp3813294@gmail.com`; backend protection is the real security layer.

Refunds from Admin Dashboard are real Stripe refund actions when live Stripe keys are configured. Use test mode first before using live mode.

## v26 update - admin fix, passwords, and member privacy

- Fixed the `/admin` 500 error caused by the admin email settings helper.
- Added Profile → Security → Change password for email/password users.
- Added Login → Forgot password flow:
  1. user enters registered email,
  2. app sends a verification code by email,
  3. user verifies the code,
  4. user enters a new password twice.
- Added `password_reset_codes` table for secure expiring reset codes.
- House member email addresses are now hidden from the house member list and invite preview for privacy.
- Admin dashboard still shows user emails so you can handle support queries.

### Forgot password SMTP setup

Add these to `backend/.env` in production so reset codes can be emailed:

```env
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=support@grocery-house-manager.com
SMTP_FROM_NAME=Grocery House Manager
SMTP_USE_TLS=true
```

If SMTP is not configured and `ENVIRONMENT` is not `production`, the backend returns a development-only debug code so you can test locally. In production, configure SMTP before relying on forgot password.

### New auth endpoints

- `POST /auth/change-password`
- `POST /auth/forgot-password/request`
- `POST /auth/forgot-password/verify`
- `POST /auth/forgot-password/reset`

After deploying this version, rebuild the backend so the new `password_reset_codes` table is created automatically by the starter migration helper.

## v27 update - local form errors, password history, and email delivery diagnostics

- Moved Profile form errors/success messages into the exact section where the user is working:
  - profile update messages show beside the profile form,
  - billing/sync messages show beside the plan controls,
  - password change messages show beside the password form,
  - account delete messages show inside the delete section.
- Improved Login/Forgot Password error placement so users do not have to scroll to the top to understand what happened.
- Added clearer forgot-password sending state and inbox/spam guidance while SMTP is sending the verification code.
- Added password history protection. A user cannot reuse any of the last 5 passwords saved for their account.
- Added `password_history` table with automatic retention of the 5 newest password hashes per user.
- Added backend SMTP logging so delivery failures appear in backend Docker logs.
- Added Admin Dashboard email health/test tools:
  - `GET /admin/email/status`
  - `POST /admin/email/test`
- Admin can send a real test password-reset email from `/admin` to confirm SMTP works before users rely on forgot password.

### If forgot-password email does not arrive

1. Open `/admin` with your admin email.
2. Check **Password reset email health**.
3. Send a test email to your own inbox.
4. If it fails, check backend logs:

```bash
docker compose logs backend --tail=100
```

For Google Workspace SMTP, make sure `SMTP_USERNAME` is the real mailbox user, usually:

```env
SMTP_USERNAME=kartik_patel_98@grocery-house-manager.com
SMTP_FROM_EMAIL=support@grocery-house-manager.com
```

Use `support@` as `SMTP_USERNAME` only if it is a separate paid Workspace user, not just an alias.
