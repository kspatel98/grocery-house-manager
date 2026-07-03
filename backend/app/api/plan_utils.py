from dataclasses import dataclass
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models import HouseMember, PlanName, Product, ShoppingList, User


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
        tagline="Try the app with one household before upgrading.",
        limits=PlanLimits(houses=1, products_per_house=75, active_lists_per_house=1, members_per_house=3),
        features=[
            "1 house",
            "75 inventory products per house",
            "1 active shopping list per house",
            "3 members per house",
            "Invite links, live updates, and activity feed",
        ],
    ),
    PlanName.basic: PlanDefinition(
        key=PlanName.basic,
        name="Basic Home",
        price_monthly_cad=1.99,
        tagline="Affordable plan for small families and couples.",
        limits=PlanLimits(houses=2, products_per_house=250, active_lists_per_house=5, members_per_house=6),
        features=[
            "2 houses per account",
            "250 inventory products per house",
            "5 active shopping lists per house",
            "6 members per house",
            "Best low-cost plan for everyday home groceries",
        ],
    ),
    PlanName.family: PlanDefinition(
        key=PlanName.family,
        name="Family Plus",
        price_monthly_cad=4.99,
        tagline="Best value for most families and roommates.",
        limits=PlanLimits(houses=5, products_per_house=800, active_lists_per_house=15, members_per_house=15),
        features=[
            "5 houses per account",
            "800 inventory products per house",
            "15 active shopping lists per house",
            "15 members per house",
            "Great for weekly groceries, shared homes, and roommates",
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
            "15 houses per account",
            "3,000 inventory products per house",
            "50 active shopping lists per house",
            "35 members per house",
            "Ideal for extended families, shared rentals, and multiple properties",
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


def ensure_house_limit(db: Session, user: User) -> None:
    plan = get_user_plan(user)
    current = db.query(HouseMember).filter(HouseMember.user_id == user.id).count()
    if current >= plan.limits.houses:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your {plan.name} plan allows {plan.limits.houses} house(s). Upgrade to add more houses.",
        )


def ensure_member_limit(db: Session, house_id: int, owner_or_joiner: User) -> None:
    plan = get_user_plan(owner_or_joiner)
    current = db.query(HouseMember).filter(HouseMember.house_id == house_id).count()
    if current >= plan.limits.members_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"This house has reached the {plan.name} member limit of {plan.limits.members_per_house}. Upgrade to invite more members.",
        )


def ensure_product_limit(db: Session, house_id: int, user: User) -> None:
    plan = get_user_plan(user)
    current = db.query(Product).filter(Product.house_id == house_id).count()
    if current >= plan.limits.products_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your {plan.name} plan allows {plan.limits.products_per_house} products per house. Upgrade to add more.",
        )


def ensure_active_shopping_list_limit(db: Session, house_id: int, user: User) -> None:
    plan = get_user_plan(user)
    current = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.is_done == False).count()
    if current >= plan.limits.active_lists_per_house:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your {plan.name} plan allows {plan.limits.active_lists_per_house} active shopping lists per house. Finish or cancel a list, or upgrade.",
        )


def plan_usage(db: Session, user: User) -> dict:
    house_ids = [row[0] for row in db.query(HouseMember.house_id).filter(HouseMember.user_id == user.id).all()]
    products_by_house: dict[str, int] = {}
    active_lists_by_house: dict[str, int] = {}
    members_by_house: dict[str, int] = {}
    for house_id in house_ids:
        key = str(house_id)
        products_by_house[key] = db.query(Product).filter(Product.house_id == house_id).count()
        active_lists_by_house[key] = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.is_done == False).count()
        members_by_house[key] = db.query(HouseMember).filter(HouseMember.house_id == house_id).count()
    return {
        "houses": len(house_ids),
        "products_by_house": products_by_house,
        "active_lists_by_house": active_lists_by_house,
        "members_by_house": members_by_house,
    }
