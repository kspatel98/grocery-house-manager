# Grocery House Manager

A full-stack grocery management starter project for shared households.

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
