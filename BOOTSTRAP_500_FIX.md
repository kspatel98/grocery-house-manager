# v32 Bootstrap 500 Fix

This update makes `/account/bootstrap` defensive so optional usage/insight queries cannot crash the whole app after a deployment.

Why this was needed:
- The frontend error `GET /api/account/bootstrap ... 500` means the backend endpoint crashed.
- This endpoint is loaded by Houses, Profile, Reports, and Prices.
- Older database volumes can be missing newer additive columns used by analytics/usage queries.

What changed:
- Added safe fallbacks around subscription, insights, and houses inside `backend/app/api/account.py`.
- Added extra additive schema fixes for older DB tables in `backend/app/db/dev_migrations.py`.
- The backend now logs the failed section but still returns enough bootstrap data for the UI to load.

Deploy:
```bash
docker compose down
docker compose up -d --build
```

If you still see a 500, check the backend traceback:
```bash
docker compose logs backend --tail=200
```
