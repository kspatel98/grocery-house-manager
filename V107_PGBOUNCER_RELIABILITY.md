# V107 – PgBouncer + database reliability

This release is intentionally small and does not change GHM product features or database schema.

## What changed

- Bounds the SQLAlchemy client pool to `5 + 3 overflow` by default.
- Keeps `pool_pre_ping` and adds a 5-minute connection recycle window.
- Adds PostgreSQL TCP keepalive settings and an 8-second connection timeout.
- Rolls back failed request transactions before returning a session to the pool.
- Makes `/health/ready` perform a real `SELECT 1` every time it is called.
- Disposes stale SQLAlchemy connections after a database/PgBouncer interruption.
- Converts transient SQLAlchemy `OperationalError` / `InterfaceError` failures to HTTP 503 with `Retry-After: 3` so GHM's existing safe-GET retry logic can recover.
- Raises the normal browser API timeout from 12 seconds to 15 seconds.

## Required production setting

In `backend/.env`, set `DATABASE_URL` to the **DigitalOcean Connection Pool / PgBouncer** connection string, not the direct database string.

Recommended PgBouncer pool:

- Mode: Transaction
- Pool size: 8

Recommended app-side settings:

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

Do not copy `.env.example` over the real `.env`; preserve all production secrets.
