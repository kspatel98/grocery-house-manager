# V110 — contrast, mobile More, receipt/recipe/shopping polish + quieter connectivity

V110 is built on V109. It does not add a new product feature; it fixes the UI and connection behavior visible in the October 8 screenshots.

## UI fixes

- Smart Receipt Workspace now uses the same palette/surface system as the rest of GHM in dark mode.
- Receipt shortcuts, purpose card, dropzone, settings and review surfaces no longer inherit pale light-mode colors in dark mode.
- Recipe diet/category chips are readable in dark mode.
- Recipe ingredient rows and step-by-step cards use dark surfaces + bright text instead of white cards + pale text.
- On mobile, recipe ingredients become stacked cards rather than a desktop-width horizontally scrolling table.
- Shopping manual-product entry is responsive to the actual shopping column. Inputs no longer get clipped off the right edge.
- Leave/Delete house actions use a rounded semantic danger treatment instead of looking like plain text.
- Flyer filters, location callouts, pricing billing switch, Premium Try rule/FAQ cards, support contact pills, status pills and legacy tables all receive explicit dark-mode surfaces/text.
- Legacy tables no longer keep a white header in dark mode.
- Horizontal overflow is clipped at the app/page level while local intentional scrollers remain local.
- Mobile More is now a true full-screen mobile sheet with one vertical scroll. It does not require horizontal swiping or pull-and-hold to reveal its header.
- The visible `GHM design build V109` badge has been removed from More.

## Connection behavior

The DigitalOcean droplet screenshots do not show CPU or memory saturation: CPU is mostly low, load averages are low, memory is around 40%, and the brief spikes align with deployment/activity. That points away from a droplet-size problem.

The `timeout of 5000ms exceeded` message shown in the app came from the browser's global `/health/ready` probe, not from the normal 15-second API timeout. A slow PgBouncer readiness probe could therefore show a scary global connection error even when the API process was alive.

V110 changes the browser-facing global status check to `/health/live` only. Database/PgBouncer recovery remains server-side and request-scoped. The global banner appears only after three consecutive failures to reach the GHM API process.

Live WebSocket refresh was also changed to use exponential reconnect backoff and coalesced/throttled page refreshes, preventing a short outage from causing a request/reconnect storm.

V107/V109 PgBouncer protections remain: pool pre-ping, bounded pool, LIFO, recycle, TCP keepalive, stale-connection disposal, retryable 503s and safe GET retries.

## Production database check

After deployment, confirm `backend/.env` still uses the DigitalOcean **Connection Pool / PgBouncer** DATABASE_URL, not the direct database URL.

Run this inside the server project to test the exact production path without exposing the DB password:

```bash
docker compose exec backend python -m app.scripts.db_reliability_check
```

It performs 20 `SELECT 1` probes and reports success count plus min/average/median/max latency.

## Validation

- Backend unit tests: 9 passed.
- Python compilation: passed.
- V104/V109/V110 CSS parsed with no stylesheet parser errors.
- Full Vite build still requires normal frontend dependencies installed by Docker (`npm run build`).
