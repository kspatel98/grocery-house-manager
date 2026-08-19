from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.admin import require_admin
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import AdminUserOffer, PlanName, User
from app.schemas import AdminOfferAcceptIn, AdminOfferActionOut, AdminOfferCreateIn, AdminOfferOut, CheckoutSessionOut

router = APIRouter(prefix="/offers", tags=["offers"])

PLAN_LABELS = {
    "basic": "Basic Home",
    "family": "Family Plus",
    "pro": "Household Pro",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def price_ids() -> dict[str, str | None]:
    return {
        "basic": settings.stripe_price_basic_monthly,
        "family": settings.stripe_price_family_monthly,
        "pro": settings.stripe_price_pro_monthly,
    }


def normalize_plan(value: object | None) -> str | None:
    if value is None:
        return None
    raw = getattr(value, "value", value)
    if not raw:
        return None
    raw = str(raw)
    if raw not in PLAN_LABELS:
        raise HTTPException(status_code=400, detail="Choose Basic, Family, or Pro.")
    return raw


def readable_duration(offer: AdminUserOffer) -> str:
    if offer.offer_kind == "free_plan_access":
        if offer.access_lifetime:
            return "lifetime"
        if offer.access_duration_days:
            days = int(offer.access_duration_days)
            if days >= 365 and days % 365 == 0:
                return f"{days // 365} year(s)"
            if days >= 30 and days % 30 == 0:
                return f"{days // 30} month(s)"
            return f"{days} day(s)"
        return "limited time"
    if offer.stripe_duration == "forever":
        return "lifetime discount"
    if offer.stripe_duration == "repeating":
        return f"{offer.duration_months or 1} month(s)"
    return "first bill only"


def offer_summary(offer: AdminUserOffer) -> str:
    plan = PLAN_LABELS.get(offer.plan_name or "", "any paid plan")
    if offer.offer_kind == "free_plan_access":
        return f"Free {plan} access for {readable_duration(offer)}."
    return f"{offer.discount_percent}% off {plan} for {readable_duration(offer)}."


def offer_out(offer: AdminUserOffer, viewer: User | None = None) -> AdminOfferOut:
    expired = offer.expires_at <= now_utc()
    status_value = "expired" if offer.status in {"pending", "checkout_started"} and expired else offer.status
    return AdminOfferOut(
        id=offer.id,
        user_id=offer.user_id,
        user_email=offer.user.email if offer.user else None,
        user_name=offer.user.full_name if offer.user else None,
        offer_kind=offer.offer_kind,
        plan_name=offer.plan_name,
        plan_label=PLAN_LABELS.get(offer.plan_name or "") if offer.plan_name else None,
        title=offer.title,
        message=offer.message,
        discount_percent=offer.discount_percent,
        stripe_duration=offer.stripe_duration,
        duration_months=offer.duration_months,
        access_duration_days=offer.access_duration_days,
        access_lifetime=bool(offer.access_lifetime),
        use_limit=offer.use_limit,
        status=status_value,
        expires_at=offer.expires_at,
        accepted_at=offer.accepted_at,
        declined_at=offer.declined_at,
        cancelled_at=offer.cancelled_at,
        created_at=offer.created_at,
        stripe_promotion_code=offer.stripe_promotion_code,
        universal=offer.offer_kind == "discount" and not offer.plan_name,
        can_accept=bool(viewer and viewer.id == offer.user_id and status_value in {"pending", "checkout_started"}),
        summary=offer_summary(offer),
    )


def ensure_stripe_customer(db: Session, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    stripe.api_key = settings.stripe_secret_key
    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name or user.email,
        metadata={"user_id": str(user.id)},
    )
    user.stripe_customer_id = customer["id"]
    db.commit()
    db.refresh(user)
    return user.stripe_customer_id


def create_stripe_discount_for_offer(db: Session, offer: AdminUserOffer, user: User) -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured. Add STRIPE_SECRET_KEY before creating discount offers.")
    stripe.api_key = settings.stripe_secret_key
    customer_id = ensure_stripe_customer(db, user)

    duration = offer.stripe_duration or "once"
    coupon_kwargs = {
        "percent_off": int(offer.discount_percent or 0),
        "duration": duration,
        "name": offer.title[:80],
        "metadata": {
            "app": "grocery_house_manager",
            "offer_id": str(offer.id),
            "user_id": str(user.id),
            "plan_name": offer.plan_name or "universal",
            "offer_kind": "admin_discount",
        },
    }
    if duration == "repeating":
        coupon_kwargs["duration_in_months"] = int(offer.duration_months or 1)
    coupon = stripe.Coupon.create(**coupon_kwargs)

    code = f"GHM-{secrets.token_hex(4).upper()}"
    promo_kwargs = {
        "coupon": coupon["id"],
        "code": code,
        "customer": customer_id,
        "expires_at": int(offer.expires_at.timestamp()),
        "metadata": {
            "app": "grocery_house_manager",
            "offer_id": str(offer.id),
            "user_id": str(user.id),
            "plan_name": offer.plan_name or "universal",
        },
    }
    if offer.use_limit:
        promo_kwargs["max_redemptions"] = int(offer.use_limit)
    promotion_code = stripe.PromotionCode.create(**promo_kwargs)
    offer.stripe_coupon_id = coupon["id"]
    offer.stripe_promotion_code_id = promotion_code["id"]
    offer.stripe_promotion_code = promotion_code.get("code") or code
    offer.updated_at = now_utc()
    db.commit()


@router.get("/mine", response_model=list[AdminOfferOut])
def my_offers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    offers = (
        db.query(AdminUserOffer)
        .filter(AdminUserOffer.user_id == user.id)
        .filter(AdminUserOffer.status.in_(["pending", "checkout_started"]))
        .filter(AdminUserOffer.expires_at > now_utc())
        .order_by(AdminUserOffer.expires_at.asc(), AdminUserOffer.id.desc())
        .all()
    )
    return [offer_out(offer, viewer=user) for offer in offers]


@router.post("/{offer_id}/accept", response_model=AdminOfferActionOut)
def accept_offer(offer_id: int, payload: AdminOfferAcceptIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    offer = db.query(AdminUserOffer).filter(AdminUserOffer.id == offer_id, AdminUserOffer.user_id == user.id).first()
    if not offer or offer.status not in {"pending", "checkout_started"} or offer.expires_at <= now_utc():
        raise HTTPException(status_code=404, detail="This offer is not available anymore.")

    if offer.offer_kind == "free_plan_access":
        plan = normalize_plan(offer.plan_name)
        if not plan:
            raise HTTPException(status_code=400, detail="This free access offer is missing a plan.")
        user.plan_name = PlanName(plan)
        user.subscription_status = "admin_granted"
        user.subscription_current_period_end = None if offer.access_lifetime else now_utc() + timedelta(days=int(offer.access_duration_days or 1))
        offer.status = "accepted"
        offer.accepted_at = now_utc()
        offer.updated_at = now_utc()
        db.commit()
        db.refresh(offer)
        return AdminOfferActionOut(ok=True, message=f"Accepted. {PLAN_LABELS[plan]} access is active.", offer=offer_out(offer, viewer=user))

    plan = normalize_plan(offer.plan_name) or normalize_plan(payload.plan_name)
    if not plan:
        raise HTTPException(status_code=400, detail="Choose which paid plan to use with this universal discount.")
    price_id = price_ids().get(plan)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Missing Stripe price ID for {PLAN_LABELS[plan]} in backend .env.")
    if not offer.stripe_promotion_code_id:
        create_stripe_discount_for_offer(db, offer, user)
        db.refresh(offer)

    stripe.api_key = settings.stripe_secret_key
    customer_id = ensure_stripe_customer(db, user)
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            discounts=[{"promotion_code": offer.stripe_promotion_code_id}],
            success_url=f"{settings.frontend_url}/pricing?checkout=success&offer={offer.id}",
            cancel_url=f"{settings.frontend_url}/pricing?checkout=cancelled&offer={offer.id}",
            client_reference_id=str(user.id),
            metadata={"user_id": str(user.id), "plan_name": plan, "admin_offer_id": str(offer.id), "kind": "admin_discount_offer"},
            subscription_data={"metadata": {"user_id": str(user.id), "plan_name": plan, "admin_offer_id": str(offer.id), "kind": "admin_discount_offer"}},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe checkout failed: {exc}")
    offer.status = "checkout_started"
    offer.updated_at = now_utc()
    db.commit()
    return AdminOfferActionOut(ok=True, message="Continue to Stripe checkout to complete this offer.", checkout_url=session["url"], offer=offer_out(offer, viewer=user))


@router.post("/{offer_id}/decline", response_model=AdminOfferActionOut)
def decline_offer(offer_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    offer = db.query(AdminUserOffer).filter(AdminUserOffer.id == offer_id, AdminUserOffer.user_id == user.id).first()
    if not offer or offer.status not in {"pending", "checkout_started"}:
        raise HTTPException(status_code=404, detail="Offer not found")
    offer.status = "declined"
    offer.declined_at = now_utc()
    offer.updated_at = now_utc()
    db.commit()
    return AdminOfferActionOut(ok=True, message="Offer declined.", offer=offer_out(offer, viewer=user))


@router.get("/admin", response_model=list[AdminOfferOut])
def admin_list_offers(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    offers = db.query(AdminUserOffer).order_by(AdminUserOffer.created_at.desc()).limit(200).all()
    return [offer_out(offer) for offer in offers]


@router.post("/admin", response_model=AdminOfferOut, status_code=status.HTTP_201_CREATED)
def admin_create_offer(payload: AdminOfferCreateIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target_user = db.get(User, payload.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    offer_kind = payload.offer_kind
    plan = normalize_plan(payload.plan_name)
    if offer_kind == "free_plan_access" and not plan:
        raise HTTPException(status_code=400, detail="Free plan access offers must choose Basic, Family, or Pro.")
    if offer_kind == "discount" and not payload.discount_percent:
        raise HTTPException(status_code=400, detail="Discount offers need a discount percent.")
    if offer_kind == "discount" and payload.stripe_duration == "repeating" and not payload.duration_months:
        raise HTTPException(status_code=400, detail="Repeating discounts need a number of months.")
    if offer_kind == "free_plan_access" and not payload.access_lifetime and not payload.access_duration_days:
        raise HTTPException(status_code=400, detail="Choose a free access duration or lifetime access.")

    expires_at = now_utc() + timedelta(days=int(payload.expires_in_days))
    offer = AdminUserOffer(
        user_id=target_user.id,
        created_by_id=admin.id,
        offer_kind=offer_kind,
        plan_name=plan,
        title=payload.title.strip(),
        message=(payload.message or "").strip() or None,
        discount_percent=payload.discount_percent if offer_kind == "discount" else None,
        stripe_duration=payload.stripe_duration if offer_kind == "discount" else None,
        duration_months=payload.duration_months if offer_kind == "discount" and payload.stripe_duration == "repeating" else None,
        access_duration_days=payload.access_duration_days if offer_kind == "free_plan_access" and not payload.access_lifetime else None,
        access_lifetime=bool(payload.access_lifetime) if offer_kind == "free_plan_access" else False,
        use_limit=payload.use_limit if offer_kind == "discount" else None,
        status="pending",
        expires_at=expires_at,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    if offer.offer_kind == "discount":
        create_stripe_discount_for_offer(db, offer, target_user)
        db.refresh(offer)
    return offer_out(offer)


@router.post("/admin/{offer_id}/cancel", response_model=AdminOfferActionOut)
def admin_cancel_offer(offer_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    offer = db.get(AdminUserOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.status in {"accepted", "declined", "cancelled", "expired"}:
        raise HTTPException(status_code=400, detail=f"This offer is already {offer.status}.")
    if offer.stripe_promotion_code_id and settings.stripe_secret_key:
        try:
            stripe.api_key = settings.stripe_secret_key
            stripe.PromotionCode.modify(offer.stripe_promotion_code_id, active=False)
        except Exception:
            # Keep app cancellation possible even if Stripe is temporarily unavailable.
            pass
    offer.status = "cancelled"
    offer.cancelled_at = now_utc()
    offer.updated_at = now_utc()
    db.commit()
    return AdminOfferActionOut(ok=True, message="Offer cancelled.", offer=offer_out(offer))
