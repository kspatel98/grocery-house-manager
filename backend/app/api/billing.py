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
        receipt_scans_per_month=plan.limits.receipt_scans_per_month,
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
        message="New user offer active: Basic Home is 65% off for the first 2 billing months. You can still apply one valid coupon before checkout; if you use a coupon, the automatic Basic new-user offer will not be applied.",
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
    status_value = (user.subscription_status or "free").lower()
    if status_value in {"active", "trialing", "cancel_at_period_end"}:
        return CouponValidateOut(
            valid=False,
            message="You already have an active subscription or accepted discount. New coupon codes can only be applied before starting a new checkout. To change or cancel your current plan, use Manage billing or Cancel subscription in Profile.",
        )

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured. Add STRIPE_SECRET_KEY before validating coupons.")

    stripe.api_key = settings.stripe_secret_key
    try:
        promotion_codes = stripe.PromotionCode.list(code=code, active=True, limit=1)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe coupon check failed: {exc}")
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
        try:
            customer = stripe.Customer.create(email=user.email, name=user.full_name or user.email, metadata={"user_id": str(user.id)})
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Stripe customer creation failed: {exc}")
        customer_id = customer["id"]
        user.stripe_customer_id = customer_id
        db.commit()

    status_value = (user.subscription_status or "free").lower()
    if status_value in {"active", "trialing", "cancel_at_period_end"}:
        raise HTTPException(status_code=400, detail="You already have an active subscription or a subscription scheduled to cancel. Manage billing, wait until the current period ends, or contact support before starting a new checkout.")

    active_offer = new_user_offer_for(user)
    if active_offer and payload.plan_name == PlanName.basic and not payload.promotion_code_id and not settings.stripe_promotion_code_basic_new_user:
        raise HTTPException(
            status_code=400,
            detail="The Basic new-user offer is visible, but STRIPE_PROMOTION_CODE_BASIC_NEW_USER is missing in backend/.env. Add the promo_... ID from Stripe or disable the offer.",
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
    if payload.promotion_code_id:
        # User-entered coupons take priority over the automatic Basic new-user offer.
        # This prevents discount stacking while keeping the coupon box usable.
        checkout_kwargs["discounts"] = [{"promotion_code": payload.promotion_code_id}]
    elif active_offer and payload.plan_name == PlanName.basic and settings.stripe_promotion_code_basic_new_user:
        checkout_kwargs["discounts"] = [{"promotion_code": settings.stripe_promotion_code_basic_new_user}]
    else:
        checkout_kwargs["allow_promotion_codes"] = False

    try:
        session = stripe.checkout.Session.create(**checkout_kwargs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe checkout failed: {exc}")
    return CheckoutSessionOut(checkout_url=session["url"])



def apply_checkout_session_event(db: Session, session: dict) -> None:
    """Use Checkout metadata/client_reference_id to connect a paid checkout to an app user.

    This is intentionally defensive because Stripe webhook ordering can vary:
    checkout.session.completed may arrive before subscription.updated, and the
    subscription may or may not include the metadata in older sessions.
    """
    user_id = None
    metadata = session.get("metadata") or {}
    if metadata.get("user_id"):
        user_id = metadata.get("user_id")
    elif session.get("client_reference_id"):
        user_id = session.get("client_reference_id")

    user = None
    if user_id:
        try:
            user = db.get(User, int(user_id))
        except (TypeError, ValueError):
            user = None

    customer_id = session.get("customer")
    if not user and customer_id:
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    subscription_id = session.get("subscription")
    if customer_id:
        user.stripe_customer_id = customer_id
    if subscription_id:
        user.stripe_subscription_id = subscription_id

    # Prefer the full subscription object so we can read the real price/status.
    if subscription_id:
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            apply_subscription_event(db, subscription)
            return
        except Exception:
            # Fallback to the plan name carried by checkout metadata.
            pass

    try:
        metadata_plan = PlanName(metadata.get("plan_name", "free"))
    except ValueError:
        metadata_plan = PlanName.free
    if metadata_plan != PlanName.free:
        user.plan_name = metadata_plan
        user.subscription_status = "active"
    db.commit()


@router.post("/sync-subscription", response_model=SubscriptionOut)
def sync_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Refresh the signed-in user's subscription from Stripe.

    This gives users a safe self-service recovery path if a webhook was delayed
    or missed. It does not create a subscription; it only syncs an existing
    Stripe customer/subscription connected to the user.
    """
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured.")
    if not user.stripe_customer_id and not user.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No Stripe customer or subscription is connected to this account yet.")

    stripe.api_key = settings.stripe_secret_key
    subscription = None
    if user.stripe_subscription_id:
        try:
            subscription = stripe.Subscription.retrieve(user.stripe_subscription_id)
        except Exception:
            subscription = None

    if not subscription and user.stripe_customer_id:
        try:
            subscriptions = stripe.Subscription.list(customer=user.stripe_customer_id, status="all", limit=10)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Stripe subscription sync failed: {exc}")
        active_candidates = [s for s in subscriptions.data if s.get("status") in {"active", "trialing", "past_due"}]
        subscription = active_candidates[0] if active_candidates else (subscriptions.data[0] if subscriptions.data else None)

    if not subscription:
        raise HTTPException(status_code=400, detail="No Stripe subscription was found for this account.")

    apply_subscription_event(db, subscription)
    db.refresh(user)
    return subscription_out(user, db)



@router.post("/cancel-subscription")
def cancel_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured.")
    if not user.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active Stripe subscription was found for this account.")
    stripe.api_key = settings.stripe_secret_key
    try:
        subscription = stripe.Subscription.modify(user.stripe_subscription_id, cancel_at_period_end=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe subscription cancellation failed: {exc}")

    period_end = subscription.get("current_period_end")
    if period_end:
        user.subscription_current_period_end = datetime.fromtimestamp(int(period_end), tz=timezone.utc)
    status_value = subscription.get("status") or user.subscription_status or "active"
    user.subscription_status = "cancel_at_period_end" if status_value in {"active", "trialing"} else status_value
    db.commit()
    return {
        "message": "Subscription cancellation scheduled. You can keep using your paid plan until the current billing period ends.",
        "current_period_end": user.subscription_current_period_end,
    }


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
    user.subscription_status = "cancel_at_period_end" if subscription.get("cancel_at_period_end") and status_value in {"active", "trialing"} else status_value
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
        if event_type == "checkout.session.completed":
            apply_checkout_session_event(db, data_object)
        elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
            apply_subscription_event(db, data_object)
    finally:
        db.close()
    return {"received": True, "event_type": event_type}
