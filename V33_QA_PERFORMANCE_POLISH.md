# Grocery House Manager v33 - QA, UX, and performance polish

This update focuses on making the signed-in experience easier, faster, and more professional.

## User-facing UX updates

- Added backend-confirmed `is_admin` to `/account/bootstrap` so the Admin navigation is not hardcoded in the frontend.
- Improved global API error parsing so structured backend errors display the real user-friendly message.
- Improved house members drawer:
  - Search members.
  - Role badges for Owner, Admin, and Member.
  - Copy invite link inside the drawer.
  - Cleaner responsive layout on mobile.
- Improved recent activity:
  - Timeline-style rows with icons.
  - Recent activities stay compact.
  - Full activity remains available through the modal.
- Removed technical market copy from the user UI where possible.
- Kept plan-based feature language focused on users: Basic Home, Family Plus, and Household Pro.

## Performance updates

- Inventory product endpoint now supports backend `limit` and `offset` parameters.
- Product search now searches name, brand, store name, and barcode.
- House inventory loads a limited result set for faster first render.
- Shopping lists now load a small initial product set and search the backend as the user types.
- Shopping product picker continues to render only the first 80 matches for speed.
- House live refresh is less aggressive on the house dashboard and reloads the lighter shopping/activity bundle instead of the full dashboard.

## Backend changes

- `GET /account/bootstrap` now returns `is_admin`.
- `GET /houses/{house_id}/products` now accepts:
  - `limit`, default 300, max 500
  - `offset`, default 0
  - `search`, searching name, brand, store, and barcode

## Frontend changes

- `AppFrame` uses `/account/bootstrap` admin flag instead of hardcoded email.
- `ShoppingListPanel` supports backend product search through an optional `onProductSearch` prop.
- `HouseInfoPanels` was upgraded for drawer search, role badges, invite access, and timeline activity.
- `api.ts` now extracts messages from structured FastAPI error responses.

## Deployment

```bash
docker compose down
docker compose up -d --build
```

After deploy, test:

1. Login.
2. Open Houses.
3. Open a house dashboard.
4. Open Grocery Lists.
5. Search products inside the grocery list picker.
6. Open Members drawer and copy invite link.
7. Open Activity and See all activity.
8. Open Prices, Plans, Support, Profile, and Reports.
9. Confirm `/api/account/bootstrap` returns 200.

If a page still returns 500, run:

```bash
docker compose logs backend --tail=250
```
