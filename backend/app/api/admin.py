from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
import stripe

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import House, HouseMember, PlanName, Product, Receipt, User
from app.schemas import AdminActionOut, AdminEmailStatusOut, AdminEmailTestIn, AdminPlanAssignIn, AdminRefundIn, AdminSummaryOut, AdminUserOut
from app.utils.location import currency_for_country
from app.utils.emailer import email_configured, send_password_reset_code, smtp_status_details

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not settings.is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access only")
    return user


def plan_value(value: object) -> PlanName:
    raw = getattr(value, "value", value) or PlanName.free.value
    try:
        return PlanName(str(raw))
    except ValueError:
        return PlanName.free


def admin_user_out(db: Session, user: User) -> AdminUserOut:
    houses_owned = db.query(House).filter(House.created_by_id == user.id).count()
    memberships = db.query(HouseMember).filter(HouseMember.user_id == user.id).count()
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        country=user.country,
        city=user.city,
        currency_code=currency_for_country(user.country),
        plan_name=plan_value(user.plan_name),
        subscription_status=user.subscription_status or "free",
        created_at=user.created_at,
        houses_owned=houses_owned,
        memberships=memberships,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
    )


@router.get("/email/status", response_model=AdminEmailStatusOut)
def admin_email_status(_: User = Depends(require_admin)):
    details = smtp_status_details()
    configured = bool(details["configured"])
    missing = list(details["missing"])
    provider = str(details.get("provider") or "smtp")
    if configured:
        if provider == "resend":
            message = "Resend HTTPS Email API is configured. This avoids blocked SMTP ports because it uses HTTPS 443."
        else:
            message = "SMTP settings are present. If test email times out, the server/provider is blocking outbound SMTP port 587."
    else:
        message = f"{provider.upper()} email is missing: {', '.join(missing)}. Forgot-password emails will not be delivered until backend/.env is fixed and backend is restarted."
    return AdminEmailStatusOut(
        email_configured=configured,
        provider=provider,
        smtp_configured=bool(details["smtp_configured"]),
        smtp_host=details.get("smtp_host"),
        smtp_port=details.get("smtp_port"),
        smtp_from_email=details.get("smtp_from_email"),
        smtp_username=details.get("smtp_username"),
        smtp_use_tls=bool(details.get("smtp_use_tls")),
        smtp_force_ipv4=bool(details.get("smtp_force_ipv4")),
        resend_configured=bool(details.get("resend_configured")),
        resend_from_email=details.get("resend_from_email"),
        missing_settings=missing,
        message=message,
    )


@router.post("/email/test", response_model=AdminActionOut)
def admin_send_test_email(payload: AdminEmailTestIn, admin: User = Depends(require_admin)):
    if not email_configured():
        raise HTTPException(status_code=503, detail="Email provider is not configured. Add Resend or SMTP settings to backend/.env and restart backend.")
    code = "123456"
    sent = send_password_reset_code(payload.email, "Admin test", code)
    if not sent:
        raise HTTPException(status_code=503, detail="Test email failed. Check backend logs with: docker compose logs backend --tail=100")
    return AdminActionOut(ok=True, message=f"Test password-reset email sent to {payload.email} by {admin.email}.")


@router.get("/summary", response_model=AdminSummaryOut)
def admin_summary(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(User).count()
    paid_or_granted_users = db.query(User).filter(User.plan_name != PlanName.free).count()
    total_houses = db.query(House).count()
    total_products = db.query(Product).count()
    total_receipts = db.query(Receipt).count()
    plan_rows = db.query(User.plan_name, func.count(User.id)).group_by(User.plan_name).all()
    users_by_plan = {str(getattr(plan, "value", plan) or "free"): int(count) for plan, count in plan_rows}
    return AdminSummaryOut(
        total_users=total_users,
        paid_or_granted_users=paid_or_granted_users,
        total_houses=total_houses,
        total_products=total_products,
        total_receipts=total_receipts,
        users_by_plan=users_by_plan,
    )


@router.get("/users", response_model=list[AdminUserOut])
def admin_users(
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(User)
    if search:
        token = f"%{search.strip()}%"
        query = query.filter(or_(User.email.ilike(token), User.full_name.ilike(token), User.city.ilike(token), User.country.ilike(token)))
    users = query.order_by(User.created_at.desc(), User.id.desc()).limit(limit).all()
    return [admin_user_out(db, user) for user in users]


@router.post("/users/{user_id}/plan", response_model=AdminActionOut)
def assign_user_plan(user_id: int, payload: AdminPlanAssignIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.plan_name = payload.plan_name
    if payload.plan_name == PlanName.free:
        target.subscription_status = "free"
        message = f"{target.email} was reset to Free Starter."
    else:
        target.subscription_status = "admin_granted"
        message = f"{target.email} was granted {payload.plan_name.value} by admin {admin.email}."
    db.commit()
    return AdminActionOut(ok=True, message=message)


@router.post("/users/{user_id}/cancel-subscription", response_model=AdminActionOut)
def admin_cancel_subscription(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.stripe_subscription_id:
        target.plan_name = PlanName.free
        target.subscription_status = "free"
        db.commit()
        return AdminActionOut(ok=True, message="No Stripe subscription was connected. User was reset to Free Starter.")
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured on the server.")
    stripe.api_key = settings.stripe_secret_key
    try:
        stripe.Subscription.modify(target.stripe_subscription_id, cancel_at_period_end=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe cancellation failed: {exc}")
    target.subscription_status = "cancel_at_period_end"
    db.commit()
    return AdminActionOut(ok=True, message="Subscription cancellation scheduled at period end.")


@router.post("/users/{user_id}/refund-latest", response_model=AdminActionOut)
def refund_latest_payment(user_id: int, payload: AdminRefundIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Refund was not confirmed.")
    if not target.stripe_customer_id:
        raise HTTPException(status_code=400, detail="This user has no Stripe customer ID.")
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured on the server.")

    stripe.api_key = settings.stripe_secret_key
    try:
        invoices = stripe.Invoice.list(customer=target.stripe_customer_id, status="paid", limit=10, expand=["data.payment_intent"])
        chosen = None
        for invoice in invoices.get("data", []):
            if invoice.get("amount_paid", 0) > 0:
                chosen = invoice
                break
        if not chosen:
            raise HTTPException(status_code=404, detail="No paid Stripe invoice found for this user.")

        payment_intent = chosen.get("payment_intent")
        payment_intent_id = payment_intent.get("id") if isinstance(payment_intent, dict) else payment_intent
        if not payment_intent_id:
            charge_id = chosen.get("charge")
            if not charge_id:
                raise HTTPException(status_code=400, detail="Could not find a refundable payment intent or charge for the latest paid invoice.")
            refund = stripe.Refund.create(charge=charge_id, amount=payload.amount_cents)
        else:
            refund = stripe.Refund.create(payment_intent=payment_intent_id, amount=payload.amount_cents)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Stripe refund failed: {exc}")

    amount = payload.amount_cents or chosen.get("amount_paid")
    dollars = f"{(amount or 0) / 100:.2f}"
    return AdminActionOut(ok=True, message=f"Refund created by {admin.email} for {target.email}: {dollars} {chosen.get('currency', '').upper()}. Stripe refund ID: {refund.get('id')}")
