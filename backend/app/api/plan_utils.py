from dataclasses import dataclass
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import House, HouseMember, HouseRole, PlanName, Product, Receipt, ShoppingList, User
from app.core.config import settings


@dataclass(frozen=True)
class PlanLimits:
    houses: int
    products_per_house: int
    active_lists_per_house: int
    members_per_house: int
    receipt_scans_per_month: int = 0


@dataclass(frozen=True)
class PlanDefinition:
    key: PlanName
    name: str
    price_monthly_cad: float
    tagline: str
    limits: PlanLimits
    features: list[str]
    recommended: bool = False
    regular_price_monthly_cad: float | None = None
    discount_percent: int | None = None
    discount_label: str | None = None


PLANS: dict[PlanName, PlanDefinition] = {
    PlanName.free: PlanDefinition(
        key=PlanName.free,
        name="Free Starter",
        price_monthly_cad=0,
        tagline="Join a shared house for free. Upgrade to create and manage your own house.",
        limits=PlanLimits(houses=0, products_per_house=0, active_lists_per_house=0, members_per_house=0, receipt_scans_per_month=0),
        features=[
            "Join houses by invitation",
            "Use shared house features based on the owner's plan",
            "Recent activity and member visibility inside joined houses",
            "Upgrade to create your own house and unlock personal tools",
        ],
    ),
    PlanName.basic: PlanDefinition(
        key=PlanName.basic,
        name="Basic Home",
        price_monthly_cad=1.99,
        tagline="Affordable plan for couples and small households.",
        limits=PlanLimits(houses=2, products_per_house=250, active_lists_per_house=5, members_per_house=6, receipt_scans_per_month=2),
        features=[
            "Create and manage your own houses",
            "2 Smart Receipt Scans per month across houses you own",
            "Professional receipt scanning with item, discount, tax, and total extraction",
            "Store-specific price history for each product",
            "Product lookup by barcode or product name",
            "Personal receipt tracker and spending summary",
            "Low-stock and expiry highlights",
            "65% off Basic for the first 2 billing months when eligible",
        ],
    ),
    PlanName.family: PlanDefinition(
        key=PlanName.family,
        name="Family Plus",
        price_monthly_cad=4.99,
        tagline="Best value for most families and roommates.",
        limits=PlanLimits(houses=5, products_per_house=800, active_lists_per_house=15, members_per_house=15, receipt_scans_per_month=5),
        features=[
            "Everything in Basic Home",
            "Best-store comparison across your grocery inventory",
            "Canadian grocery price comparison for supported retailers",
            "Monthly household expense view",
            "5 Smart Receipt Scans per month across houses you own",
            "Shared receipt archive with scan review and spending history",
            "Better for families, roommates, and weekly shopping routines",
        ],
        recommended=True,
    ),
    PlanName.pro: PlanDefinition(
        key=PlanName.pro,
        name="Household Pro",
        price_monthly_cad=6.99,
        tagline="For large families, multiple homes, and heavy users.",
        limits=PlanLimits(houses=15, products_per_house=3000, active_lists_per_house=50, members_per_house=35, receipt_scans_per_month=15),
        features=[
            "Everything in Family Plus",
            "Advanced price tracking for multiple stores",
            "15 Smart Receipt Scans per month across houses you own",
            "Large receipt and inventory history",
            "Export-ready personal insights for serious tracking",
            "Smart shopping suggestions with nearby grocery store locations",
            "Canadian grocery price comparison for supported retailers",
            "Built for extended families, shared rentals, and multiple homes",
        ],
    ),
}


def normalize_plan(plan_name: object) -> PlanName:
    raw = getattr(plan_name, "value", plan_name) or PlanName.free.value
    try:
        return PlanName(str(raw))
    except ValueError:
        return PlanName.free


def admin_grant_is_expired(user: User | None) -> bool:
    if not user or (user.subscription_status or "").lower() != "admin_granted":
        return False
    expiry = user.subscription_current_period_end
    if not expiry:
        return False
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry <= datetime.now(timezone.utc)


def effective_plan_name(user: User | None) -> PlanName:
    if not user or admin_grant_is_expired(user):
        return PlanName.free
    return normalize_plan(user.plan_name)


def effective_subscription_status(user: User | None) -> str:
    if not user or admin_grant_is_expired(user):
        return "free"
    return user.subscription_status or "free"


def effective_period_end(user: User | None):
    if admin_grant_is_expired(user):
        return None
    return user.subscription_current_period_end if user else None


def get_user_plan(user: User) -> PlanDefinition:
    # Admin-granted access can have an expiry date. When it has expired,
    # return Free access without needing a background job.
    return PLANS[effective_plan_name(user)]


def active_subscription_allows_paid_plan(user: User) -> bool:
    status_value = effective_subscription_status(user).lower()
    return status_value in {"active", "trialing", "paid", "free"}


def get_house_owner(db: Session, house_id: int) -> User | None:
    membership = db.query(HouseMember).filter(
        HouseMember.house_id == house_id,
        HouseMember.role == HouseRole.owner,
    ).first()
    return membership.user if membership else None


def get_house_plan(db: Session, house_id: int) -> PlanDefinition:
    owner = get_house_owner(db, house_id)
    return get_user_plan(owner) if owner else PLANS[PlanName.free]


def ensure_house_limit(db: Session, user: User) -> None:
    plan = get_user_plan(user)
    if plan.key == PlanName.free:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Free Starter can join houses by invitation, but cannot create a house. Upgrade to Basic Home or higher to create your own house.",
        )
    current = db.query(House).filter(House.created_by_id == user.id).count()
    if current >= plan.limits.houses:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your {plan.name} plan allows {plan.limits.houses} owned house(s). Upgrade to create more houses.",
        )


def ensure_member_limit(db: Session, house_id: int, acting_user: User | None = None) -> None:
    plan = get_house_plan(db, house_id)
    current = db.query(HouseMember).filter(HouseMember.house_id == house_id).count()
    if current >= plan.limits.members_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"This house has reached the owner's {plan.name} member limit of {plan.limits.members_per_house}. The house owner must upgrade to invite more members.",
        )


def ensure_product_limit(db: Session, house_id: int, user: User) -> None:
    plan = get_house_plan(db, house_id)
    current = db.query(Product).filter(Product.house_id == house_id).count()
    if current >= plan.limits.products_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"This house has reached the owner's {plan.name} limit of {plan.limits.products_per_house} products. The house owner must upgrade to add more.",
        )


def ensure_active_shopping_list_limit(db: Session, house_id: int, user: User) -> None:
    plan = get_house_plan(db, house_id)
    current = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.is_done == False).count()
    if current >= plan.limits.active_lists_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"This house has reached the owner's {plan.name} limit of {plan.limits.active_lists_per_house} active shopping lists. Finish/cancel a list, or ask the owner to upgrade.",
        )


def plan_usage(db: Session, user: User) -> dict:
    house_ids = [row[0] for row in db.query(HouseMember.house_id).filter(HouseMember.user_id == user.id).all()]
    owned_house_count = db.query(House).filter(House.created_by_id == user.id).count()
    products_by_house: dict[str, int] = {}
    active_lists_by_house: dict[str, int] = {}
    members_by_house: dict[str, int] = {}
    for house_id in house_ids:
        key = str(house_id)
        products_by_house[key] = db.query(Product).filter(Product.house_id == house_id).count()
        active_lists_by_house[key] = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.is_done == False).count()
        members_by_house[key] = db.query(HouseMember).filter(HouseMember.house_id == house_id).count()
    return {
        "houses": owned_house_count,
        "joined_houses": len(house_ids),
        "products_by_house": products_by_house,
        "active_lists_by_house": active_lists_by_house,
        "members_by_house": members_by_house,
    }


def _current_month_window() -> tuple[datetime, str]:
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    month_label = now.strftime("%B %Y")
    return month_start, month_label


def _owner_house_ids(db: Session, owner: User | None) -> list[int]:
    if not owner:
        return []
    return [row[0] for row in db.query(House.id).filter(House.created_by_id == owner.id).all()]


def _count_monthly_receipt_scans(db: Session, *, month_start: datetime, house_ids: list[int] | None = None) -> int:
    query = db.query(Receipt).filter(
        Receipt.created_at >= month_start,
        Receipt.ocr_provider.isnot(None),
        or_(Receipt.receipt_scan_credit_source.is_(None), Receipt.receipt_scan_credit_source != "extra"),
    )
    if house_ids is not None:
        if not house_ids:
            return 0
        query = query.filter(Receipt.house_id.in_(house_ids))
    return query.count()


def receipt_scan_usage(db: Session, house_id: int, user: User) -> dict[str, int | str | bool | None]:
    """Return the shared monthly Smart Receipt Scan quota for the house owner's plan.

    The scan quota is counted across every house owned by the paying house owner, not
    separately for each member. This prevents one shared house from multiplying scans
    for every invited member and keeps the current Tabscanner allowance under control.
    """
    owner = get_house_owner(db, house_id)
    plan = get_user_plan(owner) if owner else PLANS[PlanName.free]
    month_start, month_label = _current_month_window()
    owned_house_ids = _owner_house_ids(db, owner)
    used = _count_monthly_receipt_scans(db, month_start=month_start, house_ids=owned_house_ids)
    limit = max(plan.limits.receipt_scans_per_month, 0)
    remaining = max(limit - used, 0)
    extra_credits = max(int(getattr(owner, "extra_receipt_scan_credits", 0) or 0), 0) if owner else 0

    service_cap = max(getattr(settings, "tabscanner_monthly_account_scan_cap", 0), 0)
    service_used = _count_monthly_receipt_scans(db, month_start=month_start, house_ids=None)
    service_remaining = max(service_cap - service_used, 0) if service_cap else None
    service_available = service_cap == 0 or service_remaining > 0
    will_use_extra_credit = remaining == 0 and extra_credits > 0 and service_available

    if limit <= 0 and extra_credits <= 0:
        message = f"Smart Receipt Scan is locked on {plan.name}. You can enter prices manually or buy extra scans if scanning is needed."
    elif not service_available:
        message = "Smart Receipt Scan is temporarily unavailable because this month's scan capacity has been reached. Manual price entry still works."
    elif remaining == 0 and extra_credits > 0:
        message = f"Included scans are finished for {month_label}. {extra_credits} extra scan credit(s) are available."
    elif remaining == 0:
        message = f"0 of {limit} included Smart Receipt Scans remain for {plan.name} in {month_label}. You can buy extra scans anytime."
    elif remaining == 1:
        message = f"1 of {limit} included Smart Receipt Scans remains for {plan.name} in {month_label}. Extra scans are available if you need more."
    else:
        message = f"{remaining} of {limit} included Smart Receipt Scans remain for {plan.name} in {month_label}."

    return {
        "used": used,
        "limit": limit,
        "remaining": remaining,
        "plan_name": plan.name,
        "plan_key": plan.key.value,
        "month_label": month_label,
        "allowed": ((limit > 0 and remaining > 0) or extra_credits > 0) and service_available,
        "is_last_available": limit > 0 and remaining == 1 and service_available,
        "quota_scope": "Included scans reset monthly. Extra scans stay until used.",
        "quota_owner_id": owner.id if owner else None,
        "quota_owner_name": owner.full_name or owner.email if owner else None,
        "message": message,
        "service_capacity_available": service_available,
        "extra_credits": extra_credits,
        "will_use_extra_credit": will_use_extra_credit,
        "can_buy_extra_scans": True,
    }


def choose_receipt_scan_credit_source(db: Session, house_id: int, user: User) -> str:
    usage = receipt_scan_usage(db, house_id, user)
    if usage.get("remaining", 0) > 0:
        return "included"
    if usage.get("extra_credits", 0) > 0:
        return "extra"
    ensure_receipt_scan_limit(db, house_id, user)
    return "included"


def consume_extra_receipt_scan_credit(db: Session, house_id: int) -> None:
    owner = get_house_owner(db, house_id)
    if not owner:
        return
    owner.extra_receipt_scan_credits = max(int(owner.extra_receipt_scan_credits or 0) - 1, 0)


def ensure_receipt_scan_limit(db: Session, house_id: int, user: User) -> None:
    usage = receipt_scan_usage(db, house_id, user)
    if usage.get("limit", 0) <= 0 and usage.get("extra_credits", 0) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=usage["message"],
        )
    if not usage.get("service_capacity_available", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=usage["message"],
        )
    if usage.get("remaining", 0) <= 0 and usage.get("extra_credits", 0) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=usage["message"],
        )


def house_plan_has_smart_market(db: Session, house_id: int) -> bool:
    """House-level premium feature. Household Pro unlocks live nearby store suggestions."""
    return get_house_plan(db, house_id).key == PlanName.pro


def house_plan_has_product_lookup(db: Session, house_id: int) -> bool:
    """Basic Home and higher can use product lookup/barcode enrichment."""
    return get_house_plan(db, house_id).key in {PlanName.basic, PlanName.family, PlanName.pro}


def house_plan_has_external_price_comparison(db: Session, house_id: int) -> bool:
    """Family Plus and Household Pro unlock live Canadian grocery price comparison."""
    return get_house_plan(db, house_id).key in {PlanName.family, PlanName.pro}
