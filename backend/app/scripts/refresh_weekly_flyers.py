"""Refresh configured weekly-flyer postal-code caches.

Production example (run from backend container/project):
    FLYER_POSTAL_CODES="L8P1A1,M5V3L9" python -m app.scripts.refresh_weekly_flyers

Optional store list shared by all configured regions:
    FLYER_MERCHANTS="No Frills,FreshCo,Food Basics,Walmart,Fortinos" ...

Schedule this once weekly after local flyers publish. The normal API keeps each fetch until
the earliest flyer validTo date and then refreshes lazily, so this job is optional and should
not be run daily unless you intentionally want extra provider usage.
"""

from __future__ import annotations

import os

from app.db.session import SessionLocal
from app.utils.flyer_data import get_weekly_flyer_deals


def _split_env(name: str) -> list[str]:
    return [part.strip() for part in (os.getenv(name) or "").split(",") if part.strip()]


def main() -> int:
    postal_codes = _split_env("FLYER_POSTAL_CODES")
    merchants = _split_env("FLYER_MERCHANTS")
    if not postal_codes:
        print("No FLYER_POSTAL_CODES configured; nothing to refresh.")
        return 0

    failures = 0
    db = SessionLocal()
    try:
        for postal in postal_codes:
            try:
                _, fetched_at, deals = get_weekly_flyer_deals(
                    db,
                    postal_code=postal,
                    merchants=merchants,
                    force_refresh=True,
                )
                print(f"{postal}: cached {len(deals)} flyer rows at {fetched_at}")
            except Exception as exc:
                failures += 1
                print(f"{postal}: refresh failed: {exc}")
    finally:
        db.close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
