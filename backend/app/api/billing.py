from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import stripe

from app.api.deps import get_current_user
from app.api.plan_utils import PLANS, get_user_plan, plan_usage
from app.core.config import settings
from app.db.session import get_db, SessionLocal
from app.models import PlanName, User, ReceiptScanPurchase, AdminUserOffer
from app.schemas import BillingRenewalOut, CheckoutSessionIn, CheckoutSessionOut, CouponValidateIn, CouponValidateOut, NewUserOfferOut, PlanLimitsOut, PlanOut, SubscriptionOut, ReceiptScanPackOut, ReceiptScanPackCheckoutIn

router = APIRouter(prefix="/billing", tags=["billing"])


RECEIPT_SCAN_PACKS = {
    "mini": {"key": "mini", "name": "Mini Scan Pack", "scan_count": 2, "price_cad": 1.00, "description": "2 extra Smart Receipt Scans. One-time purchase. Never expires until used."},
    "value": {"key": "value", "name": "Value Scan Pack", "scan_count": 4, "price_cad": 2.00, "description": "4 extra Smart Receipt Scans. One-time purchase. Never expires until used."},
    "power": {"key": "power", "name": "Power Scan Pack", "scan_count": 10, "price_cad": 4.00, "description": "10 extra Smart Receipt Scans. One-time purchase. Never expires until used."},
}


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
        price_annual_cad=plan.price_annual_cad,
        regular_price_monthly_cad=plan.regular_price_monthly_cad,
        discount_percent=plan.discount_percent,
        discount_label=plan.discount_label,
        tagline=plan.tagline,
        limits=plan_limits_out(plan),
        features=plan.features,
        recommended=plan.recommended,
    )


def configured_price_ids(billing_cycle: str = "monthly") -> dict[PlanName, str | None]:
    if billing_cycle == "annual":
        return {
            PlanName.basic: settings.stripe_price_basic_annual,
            PlanName.family: settings.stripe_price_family_annual,
            PlanName.pro: settings.stripe_price_pro_annual,
        }
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
    # Admin-granted free access should not remove the first-14-days Basic discount.
    # Only a real Stripe/paid subscription status should end this automatic offer.
    has_paid_or_active = (user.subscription_status or "free").lower() in {"active", "trialing", "past_due", "cancel_at_period_end", "paid"}
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
    for cycle in ("monthly", "annual"):
        for plan, configured in configured_price_ids(cycle).items():
            if configured and configured == price_id:
                return plan
    return None


def premium_access_is_active(user: User) -> bool:
    plan = get_user_plan(user)
    if plan.key == PlanName.free:
        return False
    status_value = (user.subscription_status or "free").lower()
    if status_value == "admin_granted":
        if not user.subscription_current_period_end:
            return True
        expiry = user.subscription_current_period_end
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry > datetime.now(timezone.utc)
    return status_value in {"active", "trialing", "past_due", "cancel_at_period_end", "paid"}


def premium_access_lock_message(user: User) -> str:
    plan = get_user_plan(user)
    plan_label = plan.name
    status_value = (user.subscription_status or "free").lower()
    period_end = user.subscription_current_period_end
    if period_end:
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)
        date_label = period_end.astimezone(timezone.utc).strftime("%B %d, %Y")
        if status_value in {"admin_granted", "cancel_at_period_end"}:
            return f"{plan_label} is already active. Other premium plans stay disabled until this access ends on {date_label}."
    return f"{plan_label} is already active. Other premium plans stay disabled while the current plan remains active."


def effective_subscription_status(user: User, plan_key: PlanName) -> str:
    if plan_key == PlanName.free:
        return "free"
    return user.subscription_status or "free"


def subscription_out(user: User, db: Session) -> SubscriptionOut:
    plan = get_user_plan(user)
    return SubscriptionOut(
        plan_name=plan.key,
        subscription_status=effective_subscription_status(user, plan.key),
        current_period_end=user.subscription_current_period_end if effective_subscription_status(user, plan.key) != "free" else None,
        limits=plan_limits_out(plan),
        usage={**plan_usage(db, user), "extra_receipt_scan_credits": int(user.extra_receipt_scan_credits or 0)},
        new_user_offer=new_user_offer_for(user),
    )


@router.get("/plans", response_model=list[PlanOut])
def list_plans():
    return [plan_out(plan) for plan in PLANS.values()]


@router.get("/me", response_model=SubscriptionOut)
def get_subscription(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return subscription_out(user, db)


@router.get("/renewal-details", response_model=BillingRenewalOut)
def renewal_details(user: User = Depends(get_current_user)):
    plan = get_user_plan(user)
    status_value = effective_subscription_status(user, plan.key).lower()
    period_end = user.subscription_current_period_end

    if plan.key == PlanName.free or status_value == "free":
        return BillingRenewalOut(
            billing_source="none",
            plan_name=PlanName.free,
            current_period_end=None,
            auto_renews=False,
            next_payment_at=None,
            next_payment_amount=None,
            currency="CAD",
            message="Free Starter has no renewal payment.",
        )

    if status_value == "admin_granted":
        lifetime = period_end is None
        return BillingRenewalOut(
            billing_source="admin_granted",
            plan_name=plan.key,
            current_period_end=period_end,
            auto_renews=False,
            next_payment_at=None,
            next_payment_amount=None,
            currency="CAD",
            message="Admin-granted access does not charge your payment method." if not lifetime else "Lifetime admin-granted access does not expire or charge your payment method.",
        )

    auto_renews = status_value in {"active", "trialing", "past_due", "paid"}
    next_payment_at = period_end if auto_renews else None
    next_amount = None
    currency = "CAD"

    if settings.stripe_secret_key and user.stripe_subscription_id:
        stripe.api_key = settings.stripe_secret_key
        try:
            subscription = stripe.Subscription.retrieve(user.stripe_subscription_id)
            auto_renews = not bool(subscription.get("cancel_at_period_end")) and str(subscription.get("status") or status_value).lower() in {"active", "trialing", "past_due"}
            stripe_period_end = subscription.get("current_period_end")
            if stripe_period_end:
                period_end = datetime.fromtimestamp(int(stripe_period_end), tz=timezone.utc)
                next_payment_at = period_end if auto_renews else None
            try:
                item = (subscription.get("items") or {}).get("data", [])[0]
                price = item.get("price") or {}
                unit_amount = price.get("unit_amount")
                if unit_amount is not None:
                    next_amount = round(float(unit_amount) / 100, 2)
                if price.get("currency"):
                    currency = str(price.get("currency")).upper()
            except (IndexError, TypeError, AttributeError):
                pass

            if auto_renews and user.stripe_customer_id:
                try:
                    upcoming = stripe.Invoice.upcoming(customer=user.stripe_customer_id, subscription=user.stripe_subscription_id)
                    amount_due = upcoming.get("amount_due")
                    if amount_due is not None:
                        next_amount = round(float(amount_due) / 100, 2)
                    if upcoming.get("currency"):
                        currency = str(upcoming.get("currency")).upper()
                    next_attempt = upcoming.get("next_payment_attempt")
                    if next_attempt:
                        next_payment_at = datetime.fromtimestamp(int(next_attempt), tz=timezone.utc)
                except Exception:
                    # Keep the subscription price/date fallback if Stripe cannot preview the next invoice.
                    pass
        except Exception:
            # Profile must remain usable if Stripe is temporarily unavailable.
            pass

    if next_amount is None:
        next_amount = round(float(plan.price_monthly_cad), 2) if auto_renews else None

    return BillingRenewalOut(
        billing_source="stripe",
        plan_name=plan.key,
        current_period_end=period_end,
        auto_renews=auto_renews,
        next_payment_at=next_payment_at if auto_renews else None,
        next_payment_amount=next_amount if auto_renews else None,
        currency=currency,
        message="Your plan will renew automatically at the end of the current billing period." if auto_renews else "Automatic renewal is off. No further plan payment is scheduled after the current access period.",
    )


@router.get("/receipt-scan-packs", response_model=list[ReceiptScanPackOut])
def list_receipt_scan_packs():
    return [ReceiptScanPackOut(**pack) for pack in RECEIPT_SCAN_PACKS.values()]


@router.post("/receipt-scan-pack-checkout", response_model=CheckoutSessionOut)
def create_receipt_scan_pack_checkout(payload: ReceiptScanPackCheckoutIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pack = RECEIPT_SCAN_PACKS.get(payload.pack_key)
    if not pack:
        raise HTTPException(status_code=400, detail="Choose a valid extra scan pack.")
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured. Add STRIPE_SECRET_KEY before selling extra scans.")

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

    unit_amount = int(round(float(pack["price_cad"]) * 100))
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            customer=customer_id,
            line_items=[{
                "price_data": {
                    "currency": "cad",
                    "unit_amount": unit_amount,
                    "product_data": {
                        "name": f"{pack['scan_count']} extra Smart Receipt Scans",
                        "description": pack["description"],
                    },
                },
                "quantity": 1,
            }],
            success_url=f"{settings.frontend_url}/pricing?checkout=scan_pack_success",
            cancel_url=f"{settings.frontend_url}/pricing?checkout=cancelled",
            client_reference_id=str(user.id),
            metadata={
                "user_id": str(user.id),
                "kind": "extra_receipt_scan_pack",
                "pack_key": str(pack["key"]),
                "scan_count": str(pack["scan_count"]),
                "amount_cents": str(unit_amount),
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe checkout failed: {exc}")
    return CheckoutSessionOut(checkout_url=session["url"])


@router.post("/coupon/validate", response_model=CouponValidateOut)
def validate_coupon(payload: CouponValidateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    code = payload.code.strip()
    if not code:
        return CouponValidateOut(valid=False, message="Enter a coupon code.")
    if premium_access_is_active(user):
        return CouponValidateOut(
            valid=False,
            message=premium_access_lock_message(user) + " Coupon codes can be applied after the current premium access ends.",
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

    price_id = configured_price_ids(payload.billing_cycle).get(payload.plan_name)
    if not price_id:
        setting_hint = f"STRIPE_PRICE_{payload.plan_name.value.upper()}_{'ANNUAL' if payload.billing_cycle == 'annual' else 'MONTHLY'}"
        raise HTTPException(status_code=400, detail=f"Missing Stripe price ID for {payload.plan_name.value} ({payload.billing_cycle}). Add {setting_hint} in backend/.env.")

    if premium_access_is_active(user):
        raise HTTPException(status_code=400, detail=premium_access_lock_message(user))

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

    active_offer = new_user_offer_for(user)
    if active_offer and payload.plan_name == PlanName.basic and payload.billing_cycle == "monthly" and not payload.promotion_code_id and not settings.stripe_promotion_code_basic_new_user:
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
        "metadata": {"user_id": str(user.id), "plan_name": payload.plan_name.value, "billing_cycle": payload.billing_cycle},
        "subscription_data": {"metadata": {"user_id": str(user.id), "plan_name": payload.plan_name.value, "billing_cycle": payload.billing_cycle}},
    }
    if payload.promotion_code_id:
        # User-entered coupons take priority over the automatic Basic new-user offer.
        # This prevents discount stacking while keeping the coupon box usable.
        checkout_kwargs["discounts"] = [{"promotion_code": payload.promotion_code_id}]
    elif active_offer and payload.plan_name == PlanName.basic and payload.billing_cycle == "monthly" and settings.stripe_promotion_code_basic_new_user:
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

    if metadata.get("kind") == "extra_receipt_scan_pack":
        session_id = session.get("id")
        if session_id and db.query(ReceiptScanPurchase).filter(ReceiptScanPurchase.stripe_session_id == session_id).first():
            return
        payment_status = str(session.get("payment_status") or "").lower()
        if payment_status and payment_status not in {"paid", "no_payment_required"}:
            return
        try:
            scan_count = int(metadata.get("scan_count") or 0)
            amount_cents = int(metadata.get("amount_cents") or 0)
        except (TypeError, ValueError):
            scan_count = 0
            amount_cents = 0
        if scan_count <= 0:
            return
        user.extra_receipt_scan_credits = int(user.extra_receipt_scan_credits or 0) + scan_count
        if session_id:
            db.add(ReceiptScanPurchase(
                user_id=user.id,
                stripe_session_id=session_id,
                pack_key=metadata.get("pack_key") or "extra",
                scan_count=scan_count,
                amount_cents=amount_cents,
                status="paid",
            ))
        db.commit()
        return

    if subscription_id:
        user.stripe_subscription_id = subscription_id

    admin_offer_id = metadata.get("admin_offer_id")
    if admin_offer_id:
        try:
            admin_offer = db.get(AdminUserOffer, int(admin_offer_id))
        except (TypeError, ValueError):
            admin_offer = None
        if admin_offer:
            admin_offer.status = "accepted"
            admin_offer.accepted_at = datetime.now(timezone.utc)
            admin_offer.updated_at = datetime.now(timezone.utc)

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
