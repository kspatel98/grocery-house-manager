from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
    price_annual_cad: float | None = None
    recommended: bool = False
    regular_price_monthly_cad: float | None = None
    discount_percent: int | None = None
    discount_label: str | None = None


PLANS: dict[PlanName, PlanDefinition] = {
    PlanName.free: PlanDefinition(
        key=PlanName.free,
        name="Free Starter",
        price_monthly_cad=0,
        tagline="Run one real household for free and see the value before paying for automation.",
        limits=PlanLimits(houses=1, products_per_house=40, active_lists_per_house=1, members_per_house=4, receipt_scans_per_month=0),
        features=[
            "Create 1 starter house with up to 40 products",
            "Keep 1 active shared shopping list",
            "Invite up to 3 other household members",
            "Join other houses by invitation",
            "Low-stock, expiry awareness, community recipes, and Food Recall Guardian",
            "Savings Ledger separates verified value from open opportunities",
            "Try one premium feature once for free — you choose which one, no card required",
            "Upgrade when you want receipt, planning, price, and camera automation repeatedly",
        ],
        price_annual_cad=0,
    ),
    PlanName.basic: PlanDefinition(
        key=PlanName.basic,
        name="Basic Home",
        price_monthly_cad=1.99,
        tagline="Receipt intelligence and price memory for couples and small households.",
        limits=PlanLimits(houses=2, products_per_house=250, active_lists_per_house=5, members_per_house=6, receipt_scans_per_month=2),
        features=[
            "Create additional and larger grocery houses",
            "2 Smart Receipt Scans per month across houses you own",
            "Professional receipt scanning with item, discount, tax, and total extraction",
            "Store-specific price history for each product",
            "Product lookup by barcode or product name",
            "Receipt Guardian review signals for duplicates, line math, and unusual price jumps",
            "Personal receipt tracker, private price memory, and spending summary",
            "Low-stock, expiry, recall screening, and Savings Ledger",
            "65% off Basic for the first 2 billing months when eligible",
        ],
        price_annual_cad=17.99,
    ),
    PlanName.family: PlanDefinition(
        key=PlanName.family,
        name="Family Plus",
        price_monthly_cad=4.99,
        tagline="Household Autopilot for families who want less planning and smarter trips.",
        limits=PlanLimits(houses=5, products_per_house=800, active_lists_per_house=15, members_per_house=15, receipt_scans_per_month=5),
        features=[
            "Everything in Basic Home",
            "Whole-list basket comparison and best-store estimates",
            "Canadian grocery price comparison for supported retailers",
            "GHM Autopilot weekly planner + Budget Rescue",
            "History-aware smart stock-up recommendations",
            "Automatic Trip Check + defensible Savings Ledger",
            "Monthly household expense and reimbursement intelligence",
            "5 Smart Receipt Scans per month across houses you own",
            "Shared receipt archive with scan review and spending history",
            "Better for families, roommates, and weekly shopping routines",
        ],
        price_annual_cad=39.99,
        recommended=True,
    ),
    PlanName.pro: PlanDefinition(
        key=PlanName.pro,
        name="Household Pro",
        price_monthly_cad=6.99,
        tagline="Maximum household intelligence for large families, multiple homes, and heavy users.",
        limits=PlanLimits(houses=15, products_per_house=3000, active_lists_per_house=50, members_per_house=35, receipt_scans_per_month=15),
        features=[
            "Everything in Family Plus",
            "Advanced price tracking for multiple stores",
            "15 Smart Receipt Scans per month across houses you own",
            "Large receipt and inventory history",
            "Export-ready Savings Ledger and long-term household insights",
            "Full GHM Autopilot planning, stock-up, trip and receipt intelligence",
            "Kitchen Check Beta for camera-assisted pantry/fridge reconciliation",
            "Canadian grocery price comparison for supported retailers",
            "Built for extended families, shared rentals, and multiple homes",
        ],
        price_annual_cad=59.99,
    ),
}


# V102 — one complimentary premium experience for Free Starter accounts.
# These are intentionally workflow-sized experiences: the user chooses one,
# gets the real result once, and then upgrades only if they want to repeat it.
PREMIUM_TRY_FEATURES: dict[str, dict[str, object]] = {
    "smart_receipt_scan": {
        "label": "Smart Receipt Scan",
        "description": "Scan one real receipt and let GHM extract the rows, prepare inventory updates and remember prices.",
        "icon": "🧾",
        "min_plan": PlanName.basic,
        "upgrade_label": "Basic Home",
    },
    "product_lookup": {
        "label": "Product Lookup",
        "description": "Search one product by barcode, item number or name and use the result in your household inventory.",
        "icon": "🔎",
        "min_plan": PlanName.basic,
        "upgrade_label": "Basic Home",
    },
    "whole_list_compare": {
        "label": "Whole-List Comparison",
        "description": "Compare one full shopping list and see the best supported one-store or two-store trip instead of comparing products one by one.",
        "icon": "🛒",
        "min_plan": PlanName.family,
        "upgrade_label": "Family Plus",
    },
    "live_price_compare": {
        "label": "Live Grocery Price Compare",
        "description": "Run one live Canadian grocery-price comparison for the products you choose.",
        "icon": "💲",
        "min_plan": PlanName.family,
        "upgrade_label": "Family Plus",
    },
    "weekly_flyers": {
        "label": "Weekly Flyer Intelligence",
        "description": "Load one real local flyer result and see current deals around your Grocery Home.",
        "icon": "🏷️",
        "min_plan": PlanName.family,
        "upgrade_label": "Family Plus",
    },
    "autopilot_planner": {
        "label": "GHM Autopilot Planner",
        "description": "Build one household plan from inventory, days at home, servings, food to use soon and an optional budget.",
        "icon": "✦",
        "min_plan": PlanName.family,
        "upgrade_label": "Family Plus",
    },
    "smart_stock_up": {
        "label": "Smart Stock-Up",
        "description": "Run one history-aware stock-up check so GHM can identify unusually strong prices without treating every sale as a deal.",
        "icon": "📦",
        "min_plan": PlanName.family,
        "upgrade_label": "Family Plus",
    },
    "nearby_store_suggestions": {
        "label": "Smart Nearby Stores",
        "description": "Use one shopping list to get GHM's store-aware nearby shopping suggestions.",
        "icon": "📍",
        "min_plan": PlanName.pro,
        "upgrade_label": "Household Pro",
    },
    "kitchen_vision": {
        "label": "Kitchen Vision",
        "description": "Run one camera-assisted pantry or fridge scan and review what GHM can recognize before applying changes.",
        "icon": "👁️",
        "min_plan": PlanName.pro,
        "upgrade_label": "Household Pro",
    },
}


def premium_try_choices() -> list[dict[str, object]]:
    return [{"key": key, **value} for key, value in PREMIUM_TRY_FEATURES.items()]


def premium_try_status(user: User) -> dict[str, object]:
    plan = get_user_plan(user)
    selected = (getattr(user, "premium_try_feature", None) or "").strip() or None
    selected_meta = PREMIUM_TRY_FEATURES.get(selected or "")
    used_at = getattr(user, "premium_try_used_at", None)
    started_at = getattr(user, "premium_try_started_at", None)
    is_free_now = plan.key == PlanName.free
    available = bool(is_free_now and used_at is None)
    if used_at:
        label = str((selected_meta or {}).get("label") or "premium feature")
        message = f"Your complimentary premium try was used on {label}. Subscribe to use premium workflows again."
    elif not is_free_now:
        message = f"{plan.name} already unlocks premium tools. Your complimentary try is only needed while your account is on Free Starter."
    elif selected_meta:
        message = f"{selected_meta['label']} is selected. Your free try is used only after that workflow completes successfully."
    else:
        message = "Choose one premium feature to try once for free. No card is required, and the choice can be changed until you use it."
    return {
        "eligible": is_free_now and used_at is None,
        "available": available,
        "selected_feature": selected,
        "selected_label": str(selected_meta.get("label")) if selected_meta else None,
        "started_at": started_at,
        "used_at": used_at,
        "house_id": getattr(user, "premium_try_house_id", None),
        "message": message,
        "choices": premium_try_choices(),
    }


def premium_try_can_start(db: Session, house_id: int, user: User | None, feature_key: str, requested_feature: str | None = None) -> bool:
    if not user or requested_feature != feature_key or feature_key not in PREMIUM_TRY_FEATURES:
        return False
    if get_user_plan(user).key != PlanName.free or getattr(user, "premium_try_used_at", None) is not None:
        return False
    if (getattr(user, "premium_try_feature", None) or "") != feature_key:
        return False
    # House-level subscriptions follow the owner. Keeping the complimentary try on a
    # house the user owns means the upgrade they see afterwards unlocks that same house.
    house = db.get(House, house_id)
    return bool(house and house.created_by_id == user.id)


def begin_premium_try(db: Session, house_id: int, user: User, feature_key: str, requested_feature: str | None) -> bool:
    if not premium_try_can_start(db, house_id, user, feature_key, requested_feature):
        return False
    if getattr(user, "premium_try_started_at", None) is None or getattr(user, "premium_try_house_id", None) != house_id:
        user.premium_try_started_at = datetime.now(timezone.utc)
        user.premium_try_house_id = house_id
        db.add(user)
        db.flush()
    return True


def complete_premium_try(db: Session, house_id: int, user: User, feature_key: str, requested_feature: str | None) -> bool:
    if not premium_try_can_start(db, house_id, user, feature_key, requested_feature):
        return False
    if getattr(user, "premium_try_started_at", None) is None:
        user.premium_try_started_at = datetime.now(timezone.utc)
    user.premium_try_house_id = house_id
    user.premium_try_used_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    return True


def premium_try_followup_allowed(db: Session, house_id: int, user: User | None, feature_key: str) -> bool:
    """Allow only the completion step of a just-used multi-step trial (Kitchen Vision)."""
    if not user or feature_key != (getattr(user, "premium_try_feature", None) or ""):
        return False
    if getattr(user, "premium_try_house_id", None) != house_id or getattr(user, "premium_try_used_at", None) is None:
        return False
    started = getattr(user, "premium_try_started_at", None)
    if not started:
        return False
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - started <= timedelta(hours=2)


def house_plan_or_premium_try(db: Session, house_id: int, user: User | None, paid_plans: set[PlanName], feature_key: str, requested_feature: str | None = None) -> bool:
    if get_house_plan(db, house_id).key in paid_plans:
        return True
    return premium_try_can_start(db, house_id, user, feature_key, requested_feature)



def normalize_plan(plan_name: object) -> PlanName:
    raw = getattr(plan_name, "value", plan_name) or PlanName.free.value
    try:
        return PlanName(str(raw))
    except ValueError:
        return PlanName.free


def get_user_plan(user: User) -> PlanDefinition:
    # Admin-granted access can have an expiry date. When it has expired,
    # return Free access without needing a background job.
    if user and (user.subscription_status or "").lower() == "admin_granted" and user.subscription_current_period_end:
        expiry = user.subscription_current_period_end
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= datetime.now(timezone.utc):
            return PLANS[PlanName.free]
    return PLANS[normalize_plan(user.plan_name)]


def active_subscription_allows_paid_plan(user: User) -> bool:
    status_value = (user.subscription_status or "").lower()
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
        or_(Receipt.receipt_scan_credit_source.is_(None), ~Receipt.receipt_scan_credit_source.in_(["extra", "premium_try"])),
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
    premium_try_available = premium_try_can_start(db, house_id, user, "smart_receipt_scan", "smart_receipt_scan")

    if limit <= 0 and extra_credits <= 0 and premium_try_available:
        message = "Your selected free Premium Try is ready. Scan one receipt successfully and this one-time experience will be used."
    elif limit <= 0 and extra_credits <= 0:
        message = f"Smart Receipt Scan is locked on {plan.name}. You can enter prices manually, buy extra scans, or choose Smart Receipt Scan as your one free Premium Try."
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
        "allowed": (((limit > 0 and remaining > 0) or extra_credits > 0) or premium_try_available) and service_available,
        "is_last_available": limit > 0 and remaining == 1 and service_available,
        "premium_try_available": premium_try_available,
        "premium_try_selected": (getattr(user, "premium_try_feature", None) or "") == "smart_receipt_scan" and getattr(user, "premium_try_used_at", None) is None,
        "quota_scope": "Included scans reset monthly. Extra scans stay until used.",
        "quota_owner_id": owner.id if owner else None,
        "quota_owner_name": owner.full_name or owner.email if owner else None,
        "message": message,
        "service_capacity_available": service_available,
        "extra_credits": extra_credits,
        "will_use_extra_credit": will_use_extra_credit,
        "can_buy_extra_scans": True,
    }


def choose_receipt_scan_credit_source(db: Session, house_id: int, user: User, requested_feature: str | None = None) -> str:
    usage = receipt_scan_usage(db, house_id, user)
    if usage.get("remaining", 0) > 0:
        return "included"
    if usage.get("extra_credits", 0) > 0:
        return "extra"
    if begin_premium_try(db, house_id, user, "smart_receipt_scan", requested_feature):
        return "premium_try"
    ensure_receipt_scan_limit(db, house_id, user, requested_feature=requested_feature)
    return "included"


def consume_extra_receipt_scan_credit(db: Session, house_id: int) -> None:
    owner = get_house_owner(db, house_id)
    if not owner:
        return
    owner.extra_receipt_scan_credits = max(int(owner.extra_receipt_scan_credits or 0) - 1, 0)


def ensure_receipt_scan_limit(db: Session, house_id: int, user: User, requested_feature: str | None = None) -> None:
    usage = receipt_scan_usage(db, house_id, user)
    premium_try_requested = premium_try_can_start(db, house_id, user, "smart_receipt_scan", requested_feature)
    if usage.get("limit", 0) <= 0 and usage.get("extra_credits", 0) <= 0 and not premium_try_requested:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=usage["message"],
        )
    if not usage.get("service_capacity_available", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=usage["message"],
        )
    if usage.get("remaining", 0) <= 0 and usage.get("extra_credits", 0) <= 0 and not premium_try_requested:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=usage["message"],
        )


def house_plan_has_smart_market(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None) -> bool:
    """Household Pro, or an explicitly selected one-time Premium Try."""
    return house_plan_or_premium_try(db, house_id, user, {PlanName.pro}, "nearby_store_suggestions", requested_feature)


def house_plan_has_product_lookup(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None) -> bool:
    """Basic Home+, or an explicitly selected one-time Premium Try."""
    return house_plan_or_premium_try(db, house_id, user, {PlanName.basic, PlanName.family, PlanName.pro}, "product_lookup", requested_feature)


def house_plan_has_external_price_comparison(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None) -> bool:
    """Family Plus+, or an explicitly selected live-price / flyer Premium Try."""
    paid = get_house_plan(db, house_id).key in {PlanName.family, PlanName.pro}
    if paid:
        return True
    return premium_try_can_start(db, house_id, user, requested_feature or "", requested_feature) and requested_feature in {"live_price_compare", "weekly_flyers"}


def house_plan_has_receipt_guardian(db: Session, house_id: int) -> bool:
    """Basic Home and higher unlock automated receipt review signals."""
    return get_house_plan(db, house_id).key in {PlanName.basic, PlanName.family, PlanName.pro}


def house_plan_has_autopilot_planner(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None) -> bool:
    """Family Plus+, or one explicitly selected Autopilot Premium Try."""
    return house_plan_or_premium_try(db, house_id, user, {PlanName.family, PlanName.pro}, "autopilot_planner", requested_feature)


def house_plan_has_stock_up_intelligence(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None) -> bool:
    """Family Plus+, or one explicitly selected Smart Stock-Up Premium Try."""
    return house_plan_or_premium_try(db, house_id, user, {PlanName.family, PlanName.pro}, "smart_stock_up", requested_feature)


def house_plan_has_kitchen_check(db: Session, house_id: int, user: User | None = None, requested_feature: str | None = None, allow_followup: bool = False) -> bool:
    """Household Pro, or one explicitly selected Kitchen Vision Premium Try."""
    if get_house_plan(db, house_id).key == PlanName.pro:
        return True
    if allow_followup and premium_try_followup_allowed(db, house_id, user, "kitchen_vision"):
        return True
    return premium_try_can_start(db, house_id, user, "kitchen_vision", requested_feature)
