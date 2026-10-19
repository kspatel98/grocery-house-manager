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
from app.models import OwnerProviderBudget
from app.core.config import settings
from app.api.plan_utils import get_house_plan, get_house_owner
from app.utils.house_credits import spend


def consume_house_provider_run(house_id: int, actor_id: int | None = None) -> bool:
    now = datetime.now(timezone.utc)
    try:
        with SessionLocal() as db:
            plan = get_house_plan(db, house_id)
            owner = get_house_owner(db, house_id)
            if owner is None:
                return False
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
                stmt = insert(OwnerProviderBudget).values(owner_id=owner.id, period_key=key, count=1)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[OwnerProviderBudget.owner_id, OwnerProviderBudget.period_key],
                    set_={"count": OwnerProviderBudget.count + 1},
                    where=OwnerProviderBudget.count < limit,
                ).returning(OwnerProviderBudget.id)
                if db.execute(stmt).scalar_one_or_none() is None:
                    db.rollback()
                    # Subscription allowance exhausted. A specific prepaid house
                    # credit may fund this extra invocation. Caller can still
                    # use cached prices for free before reaching this function.
                    if actor_id is not None:
                        with SessionLocal() as credit_db:
                            if spend(credit_db, house_id, actor_id, 'paid_provider'):
                                credit_db.commit()
                                return True
                    return False
            db.commit()
            return True
    except Exception:
        # Fail closed: a DB outage must not become an unmetered Apify bill.
        return False
