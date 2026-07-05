from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.activity_utils import display_name
from app.api.billing import subscription_out
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import House, HouseMember, HouseRole, PlanName, ProductStorePrice, Receipt, User
from app.schemas import AccountBootstrapOut, HouseOut, PersonalInsightsOut, UserProfileOut

router = APIRouter(prefix="/account", tags=["account"])


def user_profile_out(user: User) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        auth_provider=user.auth_provider.value if hasattr(user.auth_provider, "value") else str(user.auth_provider),
        created_at=user.created_at,
        plan_name=user.plan_name.value if hasattr(user.plan_name, "value") else str(user.plan_name or "free"),
        subscription_status=user.subscription_status or "free",
        subscription_current_period_end=user.subscription_current_period_end,
    )


def personal_insights_out(db: Session, user: User) -> PersonalInsightsOut:
    try:
        plan_value = user.plan_name if isinstance(user.plan_name, PlanName) else PlanName(str(user.plan_name or "free"))
    except ValueError:
        plan_value = PlanName.free
    receipts_uploaded = db.query(Receipt).filter(Receipt.uploaded_by_id == user.id).count()
    prices = db.query(ProductStorePrice).filter(ProductStorePrice.recorded_by_id == user.id).all()
    stores = {price.store_name for price in prices if price.store_name}
    spend = sum(float(price.price or 0) for price in prices)
    tools_by_plan = {
        PlanName.free: [
            "Join shared houses by invitation",
            "Use house features provided by the house owner's plan",
        ],
        PlanName.basic: [
            "Personal receipt tracker",
            "Personal spending summary",
            "Receipt photo upload and OCR-assisted price matching",
        ],
        PlanName.family: [
            "Everything in Basic Home",
            "Store comparison insights",
            "Monthly household expense review",
        ],
        PlanName.pro: [
            "Everything in Family Plus",
            "Advanced price history tracking",
            "Export-ready personal insights",
        ],
    }
    return PersonalInsightsOut(
        plan_name=plan_value,
        receipts_uploaded=receipts_uploaded,
        prices_recorded=len(prices),
        stores_tracked=len(stores),
        estimated_personal_spend=round(spend, 2),
        premium_tools=tools_by_plan.get(plan_value, tools_by_plan[PlanName.free]),
    )


def house_out(db: Session, membership: HouseMember) -> HouseOut | None:
    house = db.get(House, membership.house_id)
    if not house:
        return None
    owner = db.get(User, house.created_by_id)
    return HouseOut(
        id=house.id,
        name=house.name,
        role=membership.role,
        owner_name=display_name(owner) if owner else None,
        owner_plan_name=owner.plan_name if owner else None,
        created_at=house.created_at,
    )


@router.get("/bootstrap", response_model=AccountBootstrapOut)
def account_bootstrap(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return the signed-in user's essential dashboard data in one request.

    The frontend uses this to avoid several small account/billing/houses calls
    that can make Profile and Houses feel slow on mobile connections.
    """
    memberships = db.query(HouseMember).filter(HouseMember.user_id == user.id).all()
    houses = [item for item in (house_out(db, membership) for membership in memberships) if item is not None]
    return AccountBootstrapOut(
        user=user_profile_out(user),
        subscription=subscription_out(user, db),
        insights=personal_insights_out(db, user),
        houses=houses,
    )
