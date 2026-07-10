import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.activity_utils import display_name
from app.api.billing import subscription_out
from app.api.plan_utils import get_user_plan
from app.api.deps import get_current_user
from app.db.session import get_db
from app.core.config import settings
from app.models import House, HouseMember, HouseRole, PlanName, ProductStorePrice, Receipt, User
from app.schemas import AccountBootstrapOut, HouseOut, PersonalInsightsOut, PlanLimitsOut, SubscriptionOut, UserProfileOut
from app.utils.location import currency_for_country

router = APIRouter(prefix="/account", tags=["account"])
logger = logging.getLogger(__name__)


def is_admin_user(user: User) -> bool:
    configured = {email.strip().lower() for email in (settings.admin_emails or "").split(",") if email.strip()}
    return user.email.lower() in configured


def user_profile_out(user: User) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        country=user.country,
        city=user.city,
        currency_code=currency_for_country(user.country),
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
            "Professional receipt scanning with item, discount, tax, and total review",
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


def safe_subscription_out(db: Session, user: User) -> SubscriptionOut:
    """Return subscription details without letting optional usage queries break login/bootstrap.

    Existing production databases from older ZIPs can be missing newer columns until
    additive migrations finish. Account bootstrap is called by several pages, so one
    optional analytics/usage query should not make the whole app return 500.
    """
    try:
        return subscription_out(user, db)
    except Exception:
        logger.exception("Account bootstrap subscription section failed for user_id=%s", user.id)
        plan = get_user_plan(user)
        return SubscriptionOut(
            plan_name=plan.key,
            subscription_status=user.subscription_status or "free",
            current_period_end=user.subscription_current_period_end,
            limits=PlanLimitsOut(
                houses=plan.limits.houses,
                products_per_house=plan.limits.products_per_house,
                active_lists_per_house=plan.limits.active_lists_per_house,
                members_per_house=plan.limits.members_per_house,
                receipt_scans_per_month=plan.limits.receipt_scans_per_month,
            ),
            usage={
                "houses": 0,
                "joined_houses": 0,
                "products_by_house": {},
                "active_lists_by_house": {},
                "members_by_house": {},
            },
            new_user_offer=None,
        )


def safe_personal_insights_out(db: Session, user: User) -> PersonalInsightsOut:
    try:
        return personal_insights_out(db, user)
    except Exception:
        logger.exception("Account bootstrap insights section failed for user_id=%s", user.id)
        try:
            plan_value = user.plan_name if isinstance(user.plan_name, PlanName) else PlanName(str(user.plan_name or "free"))
        except ValueError:
            plan_value = PlanName.free
        return PersonalInsightsOut(
            plan_name=plan_value,
            receipts_uploaded=0,
            prices_recorded=0,
            stores_tracked=0,
            estimated_personal_spend=0,
            premium_tools=[],
        )


def safe_houses_out(db: Session, user: User) -> list[HouseOut]:
    try:
        memberships = db.query(HouseMember).filter(HouseMember.user_id == user.id).all()
        return [item for item in (house_out(db, membership) for membership in memberships) if item is not None]
    except Exception:
        logger.exception("Account bootstrap houses section failed for user_id=%s", user.id)
        return []


@router.get("/bootstrap", response_model=AccountBootstrapOut)
def account_bootstrap(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return the signed-in user's essential dashboard data in one request.

    The frontend uses this to avoid several small account/billing/houses calls
    that can make Profile and Houses feel slow on mobile connections.
    """
    return AccountBootstrapOut(
        user=user_profile_out(user),
        subscription=safe_subscription_out(db, user),
        insights=safe_personal_insights_out(db, user),
        houses=safe_houses_out(db, user),
        is_admin=is_admin_user(user),
    )
