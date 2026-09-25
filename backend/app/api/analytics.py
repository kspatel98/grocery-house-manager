from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_house_member
from app.core.config import settings
from app.db.session import get_db
from app.models import ProductEvent, User
from app.schemas import ProductAnalyticsOut, ProductEventIn, ProductEventOut

router = APIRouter(prefix="/analytics", tags=["analytics"])

_ALLOWED_EVENTS = {
    "page_view",
    "shopping_completed",
    "receipt_saved",
    "meal_plan_built",
    "kitchen_vision_applied",
    "review_submitted",
    "template_applied",
    "household_created",
}
_SUCCESS_EVENTS = _ALLOWED_EVENTS - {"page_view"}


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not settings.is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access only")
    return user


@router.post("/event", response_model=ProductEventOut)
def record_product_event(
    payload: ProductEventIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event_name = payload.event_name.strip().lower()
    if event_name not in _ALLOWED_EVENTS:
        raise HTTPException(status_code=400, detail="Unsupported analytics event")
    if payload.house_id:
        require_house_member(payload.house_id, user, db)

    now = datetime.now(timezone.utc)
    context = (payload.event_context or "").strip()[:255] or None
    # Route changes can happen quickly during normal navigation. Suppress identical page-view
    # writes for ten minutes so analytics stays useful without turning into a clickstream log.
    if event_name == "page_view":
        cutoff = now - timedelta(minutes=10)
        existing = (
            db.query(ProductEvent.id)
            .filter(
                ProductEvent.user_id == user.id,
                ProductEvent.event_name == "page_view",
                ProductEvent.event_context == context,
                ProductEvent.created_at >= cutoff,
            )
            .first()
        )
        if existing:
            return ProductEventOut(ok=True)

    db.add(ProductEvent(
        user_id=user.id,
        house_id=payload.house_id,
        event_name=event_name,
        event_context=context,
        created_at=now,
    ))
    db.commit()
    return ProductEventOut(ok=True)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _retention_rate(users: list[User], events_by_user: dict[int, list[datetime]], day: int, now: datetime) -> float | None:
    eligible = [user for user in users if user.created_at and _aware(user.created_at) <= now - timedelta(days=day + 1)]
    if not eligible:
        return None
    retained = 0
    for user in eligible:
        start = _aware(user.created_at)
        window_start = start + timedelta(days=day)
        window_end = window_start + timedelta(days=1)
        if any(window_start <= event_at < window_end for event_at in events_by_user.get(user.id, [])):
            retained += 1
    return round((retained / len(eligible)) * 100, 1)


@router.get("/admin/product", response_model=ProductAnalyticsOut)
def product_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(_require_admin),
):
    now = datetime.now(timezone.utc)
    active = {}
    for days in (1, 7, 30):
        cutoff = now - timedelta(days=days)
        active[days] = int(db.query(func.count(func.distinct(ProductEvent.user_id))).filter(ProductEvent.created_at >= cutoff).scalar() or 0)

    users_90 = db.query(User).filter(User.created_at >= now - timedelta(days=90)).all()
    events_90 = db.query(ProductEvent).filter(ProductEvent.created_at >= now - timedelta(days=90)).all()
    events_by_user: dict[int, list[datetime]] = defaultdict(list)
    for event in events_90:
        events_by_user[event.user_id].append(_aware(event.created_at))

    new_users_30 = [user for user in users_90 if user.created_at and _aware(user.created_at) >= now - timedelta(days=30)]
    activation_eligible = [user for user in users_90 if user.created_at and _aware(user.created_at) <= now - timedelta(days=1)]
    activated = 0
    for user in activation_eligible:
        created = _aware(user.created_at)
        end = created + timedelta(days=1)
        user_success = [event for event in events_90 if event.user_id == user.id and event.event_name in _SUCCESS_EVENTS]
        if any(created <= _aware(event.created_at) < end for event in user_success):
            activated += 1
    activation_rate = round((activated / len(activation_eligible)) * 100, 1) if activation_eligible else None

    success_rows = (
        db.query(ProductEvent.event_name, func.count(ProductEvent.id))
        .filter(ProductEvent.created_at >= now - timedelta(days=30), ProductEvent.event_name.in_(_SUCCESS_EVENTS))
        .group_by(ProductEvent.event_name)
        .all()
    )
    success_counts = {str(name): int(count) for name, count in success_rows}

    return ProductAnalyticsOut(
        active_users_1d=active[1],
        active_users_7d=active[7],
        active_users_30d=active[30],
        new_users_30d=len(new_users_30),
        activation_rate_24h=activation_rate,
        retention_d1=_retention_rate(users_90, events_by_user, 1, now),
        retention_d7=_retention_rate(users_90, events_by_user, 7, now),
        retention_d30=_retention_rate(users_90, events_by_user, 30, now),
        success_events_30d=success_counts,
        message="Retention uses privacy-light product events, not message contents or household data. Rates appear once enough users are old enough for each cohort window.",
    )
