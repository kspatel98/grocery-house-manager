"""Fail-closed atomic owner/month AI call counters for paid workflows."""
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.db.session import SessionLocal
from app.models import UserFeatureBudget
from app.utils.house_credits import spend


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def used_feature_calls(db, owner_id: int, feature_key: str) -> int:
    record = db.query(UserFeatureBudget).filter_by(user_id=owner_id, feature_key=feature_key, period_key=current_period()).first()
    return int(record.count) if record else 0


def consume_feature_call(owner_id: int, feature_key: str, monthly_limit: int, house_id: int | None = None, actor_id: int | None = None) -> bool:
    """Reserve one provider attempt, even if its response proves unreadable; never charge for preview re-display."""
    if not owner_id:
        return False
    try:
        with SessionLocal() as db:
            dialect = db.get_bind().dialect.name
            if dialect not in {"sqlite", "postgresql"}:
                return False
            insert = sqlite_insert if dialect == "sqlite" else pg_insert
            stmt = insert(UserFeatureBudget).values(user_id=owner_id, feature_key=feature_key, period_key=current_period(), count=1)
            stmt = stmt.on_conflict_do_update(
                index_elements=[UserFeatureBudget.user_id, UserFeatureBudget.feature_key, UserFeatureBudget.period_key],
                set_={"count": UserFeatureBudget.count + 1},
                where=UserFeatureBudget.count < monthly_limit,
            ).returning(UserFeatureBudget.id)
            if monthly_limit <= 0 or db.execute(stmt).scalar_one_or_none() is None:
                db.rollback()
                if house_id is not None:
                    with SessionLocal() as credits_db:
                        if spend(credits_db, house_id, actor_id, feature_key):
                            credits_db.commit()
                            return True
                return False
            db.commit()
            return True
    except Exception:
        return False
