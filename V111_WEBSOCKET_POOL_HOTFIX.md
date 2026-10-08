# V111 — WebSocket DB-pool exhaustion hotfix

V111 is built directly on V110. It fixes the root cause shown in production logs where SQLAlchemy reported `QueuePool limit of size 5 overflow 3 reached`.

## Root cause
The household live-update WebSocket created one `SessionLocal()` when the socket connected and kept that session open for the entire socket lifetime. The first user/activity query checked out a SQLAlchemy connection, so each open browser tab/device permanently occupied one application pool slot. Eight simultaneous sockets could consume all `5 + 3` slots and ordinary authenticated API requests then timed out waiting for a connection.

## Changes
- Live WebSockets never hold a DB session while waiting.
- Authentication/membership uses a short-lived session and returns it immediately.
- Activity polling uses a short-lived session per poll and returns the connection immediately.
- Poll interval relaxed to 3 seconds.
- Temporary DB errors pause polling with backoff instead of closing every socket and triggering reconnect storms.
- Browser tabs close the live socket when hidden and reconnect only when visible again.
- SQLAlchemy QueuePool timeout now returns a recoverable HTTP 503 with `Retry-After: 2` instead of a large ASGI traceback/500.
- V110 UI, contrast, mobile and PgBouncer work is preserved.

## Why the earlier 20/20 DB probe still passed
That test was sequential. It proved the network/PgBouncer/PostgreSQL route was healthy, but it did not test whether the running API process had all of its local pool connections pinned by long-lived WebSockets.
