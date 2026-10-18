"""Atomic shared paid-invocation allowance; cached results are never charged.

One increment happens immediately before a chargeable provider HTTP request. A
separate short transaction prevents rolling back the quota after a provider error
(which might still have consumed provider credits). PostgreSQL/SQLite UPSERT
makes the allowance consistent across users, workers and devices.
"""
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.db.session import SessionLocal
from app.models import HouseProviderBudget
from app.core.config import settings
from app.api.plan_utils import get_house_plan


def consume_house_provider_run(house_id: int) -> bool:
    now = datetime.now(timezone.utc)
    try:
        with SessionLocal() as db:
            plan = get_house_plan(db, house_id)
            periods = [
                (f"day:{now:%Y-%m-%d}", min(max(0, settings.trip_provider_daily_limit), plan.limits.trip_provider_daily_runs)),
                (f"month:{now:%Y-%m}", min(max(0, settings.trip_provider_monthly_limit), plan.limits.trip_provider_monthly_runs)),
            ]
            dialect = db.get_bind().dialect.name
            if dialect not in {"sqlite", "postgresql"}:
                return False  # Never purchase prices without an enforceable quota.
            insert = sqlite_insert if dialect == "sqlite" else pg_insert
            for key, limit in periods:
                if limit <= 0:
                    db.rollback()
                    return False
                stmt = insert(HouseProviderBudget).values(house_id=house_id, period_key=key, count=1)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[HouseProviderBudget.house_id, HouseProviderBudget.period_key],
                    set_={"count": HouseProviderBudget.count + 1},
                    where=HouseProviderBudget.count < limit,
                ).returning(HouseProviderBudget.id)
                if db.execute(stmt).scalar_one_or_none() is None:
                    db.rollback()
                    return False
            db.commit()
            return True
    except Exception:
        # Fail closed: a DB outage must not become an unmetered Apify bill.
        return False
