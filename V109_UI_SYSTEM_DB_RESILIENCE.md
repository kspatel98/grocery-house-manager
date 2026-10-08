# V109 — Calm UI system + database resilience

V109 is built on V108 and focuses on whole-app consistency, readability, spacing and connection recovery rather than adding product features.

## Concrete issues found

1. `frontend/src/theme-v104.css` contained literal `\\n` characters instead of real line breaks. The graphical-shell stylesheet was effectively malformed/one-line and could be ignored or parsed inconsistently. V109 normalizes it into valid CSS.
2. Several later desktop spacing overrides targeted `.desktop-content-v86`, but the actual signed-in wrapper is `.app-main-content`. Those rules therefore did not affect the live desktop layout. V109 targets the real wrapper.
3. A single failed `/health/ready` database probe set the global backend `db_ready` flag to false. The readiness middleware then returned 503 for every normal route until the recovery loop finished. That amplified a short PgBouncer/TCP interruption into an app-wide outage and duplicate reconnecting banners. V109 gates only initial startup; after the first successful initialization, transient failures recover in the background and individual requests retry independently.

## UI system

- New V109 final stylesheet imported last so it can normalize legacy V31–V108 surfaces safely.
- Recommended default palette: **Lake + Oat + Apricot**.
- Alternate visual moods: **Mist & Sage** and **Sky & Tangerine**.
- Independent dark palettes with lighter navy/teal surfaces and explicit bright/muted text tokens.
- Consistent page gutters, section gaps, card padding, button/input geometry and rounded containers.
- More legacy square cards/panels/strips/workspaces inherit the same rounded language.
- Desktop pages use the actual `.app-main-content` wrapper and receive reliable gutters/widths.
- Mobile uses its own smaller spacing, 2-column compact stats where useful and one-column task flows.
- Food Tonight dark surfaces use the calmer blue treatment tested in developer tools.
- Trust/feature landing pages receive real app gutters and rounded sections instead of a large black rectangle.
- Error/status blocks wrap safely and remain inside the app canvas.
- Home title/control sizing is calmer.

## Connection behavior

- Database schema compatibility work runs only until the first successful startup.
- Runtime reconnects use a lightweight `SELECT 1` instead of rerunning schema work.
- One failed readiness probe no longer globally blocks all routes after startup.
- Stale SQLAlchemy connections are still disposed and PgBouncer recovery still runs in the background.
- Safe GET requests now retry up to three times with exponential backoff / `Retry-After` support.
- Service health UI waits for repeated failures before showing anything.
- Background account-refresh errors no longer create a second giant warning when cached account context is already usable.
- Service warnings now render inside the signed-in application area as compact rounded status cards.

## Production database reminder

The production `backend/.env` must use the DigitalOcean **Connection Pool / PgBouncer** `DATABASE_URL`, not the direct database hostname.

Recommended app settings remain:

```env
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=3
DB_POOL_TIMEOUT_SECONDS=10
DB_POOL_RECYCLE_SECONDS=300
DB_CONNECT_TIMEOUT_SECONDS=8
DB_KEEPALIVES_IDLE_SECONDS=30
DB_KEEPALIVES_INTERVAL_SECONDS=10
DB_KEEPALIVES_COUNT=3
```

Do not overwrite the real production `.env` with an example file.

## Build verification

After deployment, `/version.json` should return build `V109` and the More screen should show `GHM design build V109`.
