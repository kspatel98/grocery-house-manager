from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import stripe

from app.api.deps import get_current_user
from app.api.plan_utils import PLANS, get_user_plan, plan_usage
from app.core.config import settings
from app.db.session import get_db, SessionLocal
from app.models import PlanName, User
from app.schemas import CheckoutSessionIn, CheckoutSessionOut, CouponValidateIn, CouponValidateOut, NewUserOfferOut, PlanLimitsOut, PlanOut, SubscriptionOut

router = APIRouter(prefix="/billing", tags=["billing"])


def plan_limits_out(plan):
    return PlanLimitsOut(
        houses=plan.limits.houses,
        products_per_house=plan.limits.products_per_house,
        active_lists_per_house=plan.limits.active_lists_per_house,
        members_per_house=plan.limits.members_per_house,
    )


def plan_out(plan) -> PlanOut:
    return PlanOut(
        key=plan.key,
        name=plan.name,
        price_monthly_cad=plan.price_monthly_cad,
        regular_price_monthly_cad=plan.regular_price_monthly_cad,
        discount_percent=plan.discount_percent,
        discount_label=plan.discount_label,
        tagline=plan.tagline,
        limits=plan_limits_out(plan),
        features=plan.features,
        recommended=plan.recommended,
    )


def configured_price_ids() -> dict[PlanName, str | None]:
    return {
        PlanName.basic: settings.stripe_price_basic_monthly,
        PlanName.family: settings.stripe_price_family_monthly,
        PlanName.pro: settings.stripe_price_pro_monthly,
    }




def new_user_offer_for(user: User) -> NewUserOfferOut | None:
    created_at = user.created_at
    if not created_at:
        return None
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    eligible_until = created_at + timedelta(days=settings.new_user_offer_days)
    has_paid_or_active = (user.subscription_status or "free").lower() not in {"free", "cancelled", "canceled", "incomplete", "incomplete_expired"}
    active = datetime.now(timezone.utc) <= eligible_until and not has_paid_or_active
    if not active:
        return None
    return NewUserOfferOut(
        active=True,
        applies_to_plan=PlanName.basic,
        discount_percent=65,
        duration_months=2,
        eligible_until=eligible_until,
        message="New user offer active: Basic Home is 65% off for the first 2 billing months. Coupon codes cannot be combined with this offer. You can use a coupon after this offer expires or after you choose a non-offer checkout.",
    )


def discount_price(price: float, percent_off: float | None = None, amount_off: float | None = None) -> float:
    if percent_off:
        return round(max(price * (1 - float(percent_off) / 100), 0), 2)
    if amount_off:
        return round(max(price - float(amount_off), 0), 2)
    return round(price, 2)

def plan_from_price_id(price_id: str | None) -> PlanName | None:
    if not price_id:
        return None
    for plan, configured in configured_price_ids().items():
        if configured and configured == price_id:
            return plan
    return None


def subscription_out(user: User, db: Session) -> SubscriptionOut:
    plan = get_user_plan(user)
    return SubscriptionOut(
        plan_name=plan.key,
        subscription_status=user.subscription_status or "free",
        current_period_end=user.subscription_current_period_end,
        limits=plan_limits_out(plan),
        usage=plan_usage(db, user),
        new_user_offer=new_user_offer_for(user),
    )


@router.get("/plans", response_model=list[PlanOut])
def list_plans():
    return [plan_out(plan) for plan in PLANS.values()]


@router.get("/me", response_model=SubscriptionOut)
def get_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return subscription_out(user, db)


@router.post("/coupon/validate", response_model=CouponValidateOut)
def validate_coupon(payload: CouponValidateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    code = payload.code.strip()
    if not code:
        return CouponValidateOut(valid=False, message="Enter a coupon code.")
    active_offer = new_user_offer_for(user)
    if active_offer:
        return CouponValidateOut(
            valid=False,
            message=f"Coupon codes cannot be used while your new-user Basic offer is active. {active_offer.message}",
            blocked_by_new_user_offer=True,
            available_after=active_offer.eligible_until,
        )

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured. Add STRIPE_SECRET_KEY before validating coupons.")

    stripe.api_key = settings.stripe_secret_key
    promotion_codes = stripe.PromotionCode.list(code=code, active=True, limit=1)
    if not promotion_codes.data:
        return CouponValidateOut(valid=False, message="This coupon code is invalid or expired.")

    promotion_code = promotion_codes.data[0]
    coupon = promotion_code.get("coupon") or {}
    if not promotion_code.get("active", False) or not coupon.get("valid", False):
        return CouponValidateOut(valid=False, message="This coupon code is invalid or expired.")

    amount_off_raw = coupon.get("amount_off")
    amount_off = (amount_off_raw / 100) if amount_off_raw else None
    currency = coupon.get("currency")
    percent_off = coupon.get("percent_off")

    discounted_prices: dict[str, float] = {}
    for plan_name, plan in PLANS.items():
        if plan_name == PlanName.free:
            continue
        price = float(plan.price_monthly_cad)
        discounted_prices[plan_name.value] = discount_price(price, percent_off=percent_off, amount_off=amount_off)

    return CouponValidateOut(
        valid=True,
        message="Coupon verified. Discounted prices are shown below and will be applied at Stripe Checkout.",
        promotion_code_id=promotion_code.get("id"),
        coupon_name=coupon.get("name"),
        percent_off=percent_off,
        amount_off=amount_off,
        currency=currency.upper() if currency else None,
        discounted_prices=discounted_prices,
    )


@router.post("/checkout-session", response_model=CheckoutSessionOut)
def create_checkout_session(payload: CheckoutSessionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.plan_name == PlanName.free:
        raise HTTPException(status_code=400, detail="The Free plan does not need checkout.")
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs in backend/.env.")

    price_id = configured_price_ids().get(payload.plan_name)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Missing Stripe price ID for {payload.plan_name.value}. Add it in backend/.env.")

    stripe.api_key = settings.stripe_secret_key
    customer_id = user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(email=user.email, name=user.full_name or user.email, metadata={"user_id": str(user.id)})
        customer_id = customer["id"]
        user.stripe_customer_id = customer_id
        db.commit()

    active_offer = new_user_offer_for(user)
    if active_offer and payload.promotion_code_id:
        raise HTTPException(
            status_code=400,
            detail=f"Coupon codes cannot be combined while your new-user Basic offer is active. {active_offer.message}",
        )

    checkout_kwargs = {
        "mode": "subscription",
        "customer": customer_id,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": f"{settings.frontend_url}/pricing?checkout=success",
        "cancel_url": f"{settings.frontend_url}/pricing?checkout=cancelled",
        "client_reference_id": str(user.id),
        "metadata": {"user_id": str(user.id), "plan_name": payload.plan_name.value},
        "subscription_data": {"metadata": {"user_id": str(user.id), "plan_name": payload.plan_name.value}},
    }
    if active_offer and payload.plan_name == PlanName.basic and settings.stripe_promotion_code_basic_new_user:
        checkout_kwargs["discounts"] = [{"promotion_code": settings.stripe_promotion_code_basic_new_user}]
    elif payload.promotion_code_id:
        checkout_kwargs["discounts"] = [{"promotion_code": payload.promotion_code_id}]
    else:
        checkout_kwargs["allow_promotion_codes"] = active_offer is None

    session = stripe.checkout.Session.create(**checkout_kwargs)
    return CheckoutSessionOut(checkout_url=session["url"])


@router.post("/customer-portal")
def create_customer_portal_session(user: User = Depends(get_current_user)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured.")
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found for this account yet.")
    stripe.api_key = settings.stripe_secret_key
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_url}/profile",
    )
    return {"url": session["url"]}


def apply_subscription_event(db: Session, subscription: dict) -> None:
    user_id = subscription.get("metadata", {}).get("user_id")
    customer_id = subscription.get("customer")
    user = None
    if user_id:
        user = db.get(User, int(user_id))
    if not user and customer_id:
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    status_value = subscription.get("status") or "incomplete"
    price_id = None
    try:
        price_id = subscription["items"]["data"][0]["price"]["id"]
    except (KeyError, IndexError, TypeError):
        pass
    try:
        metadata_plan = PlanName(subscription.get("metadata", {}).get("plan_name", "free"))
    except ValueError:
        metadata_plan = PlanName.free
    plan_name = plan_from_price_id(price_id) or metadata_plan

    user.plan_name = plan_name if status_value in {"active", "trialing"} else PlanName.free
    user.subscription_status = status_value
    user.stripe_customer_id = customer_id or user.stripe_customer_id
    user.stripe_subscription_id = subscription.get("id") or user.stripe_subscription_id

    period_end = subscription.get("current_period_end")
    if period_end:
        user.subscription_current_period_end = datetime.fromtimestamp(int(period_end), tz=timezone.utc)
    db.commit()


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured.")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    stripe.api_key = settings.stripe_secret_key

    try:
        if settings.stripe_webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
        else:
            event = stripe.Event.construct_from(await request.json(), stripe.api_key)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid Stripe webhook: {exc}")

    event_type = event["type"]
    data_object = event["data"]["object"]
    db = SessionLocal()
    try:
        if event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
            apply_subscription_event(db, data_object)
    finally:
        db.close()
    return {"received": True}
