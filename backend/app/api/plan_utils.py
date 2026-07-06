from dataclasses import dataclass
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models import House, HouseMember, HouseRole, PlanName, Product, ShoppingList, User


@dataclass(frozen=True)
class PlanLimits:
    houses: int
    products_per_house: int
    active_lists_per_house: int
    members_per_house: int


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
        limits=PlanLimits(houses=0, products_per_house=0, active_lists_per_house=0, members_per_house=0),
        features=[
            "Join houses by invitation",
            "Use shared house features based on the owner's plan",
            "Live updates and activity feed inside joined houses",
            "Upgrade to create your own house and unlock personal tools",
        ],
    ),
    PlanName.basic: PlanDefinition(
        key=PlanName.basic,
        name="Basic Home",
        price_monthly_cad=1.99,
        tagline="Affordable plan for couples and small households.",
        limits=PlanLimits(houses=2, products_per_house=250, active_lists_per_house=5, members_per_house=6),
        features=[
            "Receipt photo upload with OCR-assisted price matching",
            "Store-specific price history for each product",
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
        limits=PlanLimits(houses=5, products_per_house=800, active_lists_per_house=15, members_per_house=15),
        features=[
            "Everything in Basic Home",
            "Best-store comparison across your grocery inventory",
            "Monthly household expense view",
            "Receipt archive for shared homes",
            "Better for families, roommates, and weekly shopping routines",
        ],
        recommended=True,
    ),
    PlanName.pro: PlanDefinition(
        key=PlanName.pro,
        name="Household Pro",
        price_monthly_cad=6.99,
        tagline="For large families, multiple homes, and heavy users.",
        limits=PlanLimits(houses=15, products_per_house=3000, active_lists_per_house=50, members_per_house=35),
        features=[
            "Everything in Family Plus",
            "Advanced price tracking for multiple stores",
            "Large receipt and inventory history",
            "Export-ready personal insights for serious tracking",
            "Smart shopping suggestions with nearby grocery store locations",
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


def get_user_plan(user: User) -> PlanDefinition:
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


def house_plan_has_smart_market(db: Session, house_id: int) -> bool:
    """House-level premium feature. Household Pro unlocks live nearby store suggestions."""
    return get_house_plan(db, house_id).key == PlanName.pro
