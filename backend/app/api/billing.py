from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import stripe

from app.api.deps import get_current_user
from app.api.plan_utils import PLANS, get_user_plan, plan_usage
from app.core.config import settings
from app.db.session import get_db, SessionLocal
from app.models import PlanName, User
from app.schemas import CheckoutSessionIn, CheckoutSessionOut, PlanLimitsOut, PlanOut, SubscriptionOut

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
        tagline=plan.tagline,
        limits=plan_limits_out(plan),
        features=plan.features,
        recommended=plan.recommended,
    )


def configured_price_ids() -> dict[PlanName, str | None]:
    return {
        PlanName.family: settings.stripe_price_family_monthly,
        PlanName.pro: settings.stripe_price_pro_monthly,
    }


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
    )


@router.get("/plans", response_model=list[PlanOut])
def list_plans():
    return [plan_out(plan) for plan in PLANS.values()]


@router.get("/me", response_model=SubscriptionOut)
def get_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return subscription_out(user, db)


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

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/pricing?checkout=success",
        cancel_url=f"{settings.frontend_url}/pricing?checkout=cancelled",
        client_reference_id=str(user.id),
        metadata={"user_id": str(user.id), "plan_name": payload.plan_name.value},
        subscription_data={"metadata": {"user_id": str(user.id), "plan_name": payload.plan_name.value}},
        allow_promotion_codes=True,
    )
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
