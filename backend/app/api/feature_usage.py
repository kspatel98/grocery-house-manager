"""Read-only feature quotas for one household. No provider calls or credits consumed."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_owner, get_house_plan, receipt_scan_usage
from app.core.config import settings
from app.db.session import get_db
from app.models import HouseProviderBudget, UserFeatureBudget, User

router = APIRouter(prefix="/houses/{house_id}/feature-usage", tags=["feature usage"])


def quota_row(limit: int, used: int, period: str, description: str) -> dict:
    return {"limit": limit, "used": used, "remaining": max(0, limit-used), "period": period, "description": description}


@router.get("")
def feature_usage(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    owner = get_house_owner(db, house_id)
    plan = get_house_plan(db, house_id)
    now = datetime.now(timezone.utc)
    month = now.strftime("%Y-%m")
    day = now.strftime("%Y-%m-%d")
    limits = plan.limits
    def monthly(key, limit, label):
        count = 0
        if owner:
            record = db.query(UserFeatureBudget).filter_by(user_id=owner.id, feature_key=key, period_key=month).first()
            count = int(record.count) if record else 0
        return quota_row(int(limit), count, "month", label)
    def provider(period, limit, label):
        record = db.query(HouseProviderBudget).filter_by(house_id=house_id, period_key=period).first()
        return quota_row(int(limit), int(record.count) if record else 0, "day" if period.startswith("day:") else "month", label)
    receipt = receipt_scan_usage(db, house_id, user)
    daily_limit = min(max(0, settings.trip_provider_daily_limit), limits.trip_provider_daily_runs)
    monthly_limit = min(max(0, settings.trip_provider_monthly_limit), limits.trip_provider_monthly_runs)
    return {
        "plan_name": plan.name,
        "shared_across_owner_houses": True,
        "reset_note": "Monthly AI allowances reset at the start of each UTC calendar month. Paid price/flyer provider limits reset daily and monthly.",
        "features": {
            "grocery_scan": monthly("grocery_scan", limits.grocery_image_scans_per_month, "Grocery photo/list scans"),
            "product_lookup": monthly("product_lookup", limits.product_lookup_runs_per_month, "Fresh product lookups"),
            "ask_ghm": monthly("ask_ghm", limits.ask_ghm_runs_per_month, "Ask GHM AI responses"),
            "kitchen_vision": monthly("kitchen_vision", limits.kitchen_vision_scans_per_month, "Kitchen Vision scans"),
            "receipt_scan": quota_row(int(receipt.get("limit", 0)), int(receipt.get("used", 0)), "month", "Smart receipt scans"),
            "paid_provider_day": provider(f"day:{day}", daily_limit, "New paid price/flyer requests today"),
            "paid_provider_month": provider(f"month:{month}", monthly_limit, "New paid price/flyer requests this month"),
        },
    }
