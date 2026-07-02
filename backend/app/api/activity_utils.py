from sqlalchemy.orm import Session
from app.models import Activity, User


def display_name(user: User | None) -> str:
    if not user:
        return "Someone"
    return user.full_name or user.email


def log_activity(
    db: Session,
    *,
    house_id: int,
    user: User | None,
    action: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Activity:
    activity = Activity(
        house_id=house_id,
        user_id=user.id if user else None,
        action=action,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(activity)
    return activity
