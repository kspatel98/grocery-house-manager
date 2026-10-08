"""Quick production-safe PostgreSQL/PgBouncer connectivity probe.

Run inside the backend container:
    python -m app.scripts.db_reliability_check

The script never prints the database password. It performs small SELECT 1 probes
through the exact SQLAlchemy engine used by GHM and reports latency/failures.
"""
from __future__ import annotations

import statistics
import time
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.session import engine


def main() -> None:
    url = make_url(settings.database_url)
    host = url.host or "unknown"
    port = url.port or "default"
    database = url.database or "unknown"
    print("GHM database reliability check")
    print(f"target={host}:{port}/{database}")
    print(
        "pool="
        f"{settings.db_pool_size}+{settings.db_max_overflow} "
        f"pool_timeout={settings.db_pool_timeout_seconds}s "
        f"connect_timeout={settings.db_connect_timeout_seconds}s "
        f"recycle={settings.db_pool_recycle_seconds}s"
    )

    samples: list[float] = []
    failures: list[str] = []
    for idx in range(1, 21):
        started = time.perf_counter()
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            elapsed_ms = (time.perf_counter() - started) * 1000
            samples.append(elapsed_ms)
            print(f"probe {idx:02d}: ok {elapsed_ms:.1f} ms")
        except Exception as exc:  # diagnostic script: show compact error type/message
            elapsed_ms = (time.perf_counter() - started) * 1000
            message = f"{type(exc).__name__}: {str(exc)[:220]}"
            failures.append(message)
            print(f"probe {idx:02d}: FAILED after {elapsed_ms:.1f} ms — {message}")
            engine.dispose()
        time.sleep(0.25)

    print("\nSummary")
    print(f"success={len(samples)}/20 failures={len(failures)}")
    if samples:
        print(
            f"latency min={min(samples):.1f} ms "
            f"avg={statistics.fmean(samples):.1f} ms "
            f"p50={statistics.median(samples):.1f} ms "
            f"max={max(samples):.1f} ms"
        )
    if failures:
        print("First failure:", failures[0])
        raise SystemExit(2)


if __name__ == "__main__":
    main()
