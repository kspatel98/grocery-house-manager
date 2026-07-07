from datetime import datetime, timedelta, timezone
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.api.deps import get_current_user
from app.api.activity_utils import display_name, log_activity
from app.models import AuthProvider, House, HouseMember, HouseRole, PasswordResetCode, User, Receipt, ProductStorePrice, PlanName
from app.utils.location import currency_for_country, normalize_country
from app.utils.emailer import send_password_reset_code
from app.schemas import AccountDeleteIn, AccountDeletePreviewOut, ForgotPasswordRequestIn, ForgotPasswordRequestOut, ForgotPasswordResetIn, ForgotPasswordVerifyIn, ForgotPasswordVerifyOut, GoogleLoginIn, LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut, UserProfileOut, UserProfileUpdate, PersonalInsightsOut

router = APIRouter(prefix="/auth", tags=["auth"])


def reset_code_message() -> str:
    return "If a matching email/password account exists, a password reset code has been sent."


def generate_reset_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def find_matching_reset_code(db: Session, user: User, code: str) -> PasswordResetCode | None:
    now = datetime.now(timezone.utc)
    records = (
        db.query(PasswordResetCode)
        .filter(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.used_at.is_(None),
            PasswordResetCode.expires_at >= now,
            PasswordResetCode.attempts < 5,
        )
        .order_by(PasswordResetCode.created_at.desc(), PasswordResetCode.id.desc())
        .limit(5)
        .all()
    )
    clean_code = code.strip()
    for record in records:
        try:
            if verify_password(clean_code, record.code_hash):
                return record
        except Exception:
            continue
    if records:
        records[0].attempts = int(records[0].attempts or 0) + 1
        db.commit()
    return None


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        country=user.country,
        city=user.city,
        currency_code=currency_for_country(user.country),
    )


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


def issue_token(user: User) -> TokenOut:
    token = create_access_token(user.id, timedelta(minutes=settings.access_token_expire_minutes))
    return TokenOut(access_token=token, user=user_out(user))


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        full_name=payload.full_name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        auth_provider=AuthProvider.email,
        country=normalize_country(payload.country),
        city=normalize_country(payload.city),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return issue_token(user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return issue_token(user)


@router.post("/change-password")
def change_password(payload: PasswordChangeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.password_hash or user.auth_provider != AuthProvider.email:
        raise HTTPException(status_code=400, detail="Password change is available only for email/password accounts. Google sign-in accounts do not have a local password.")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Old password is incorrect.")
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Password updated successfully."}


@router.post("/forgot-password/request", response_model=ForgotPasswordRequestOut)
def request_forgot_password(payload: ForgotPasswordRequestIn, db: Session = Depends(get_db)):
    message = reset_code_message()
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    debug_code = None

    if user and user.password_hash:
        code = generate_reset_code()
        db.query(PasswordResetCode).filter(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None)).delete(synchronize_session=False)
        db.add(PasswordResetCode(
            user_id=user.id,
            code_hash=get_password_hash(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        ))
        db.commit()
        sent = False
        try:
            sent = send_password_reset_code(user.email, user.full_name, code)
        except Exception:
            sent = False
        if not sent and (settings.environment or "development").lower() != "production":
            debug_code = code

    return ForgotPasswordRequestOut(ok=True, message=message, debug_code=debug_code)


@router.post("/forgot-password/verify", response_model=ForgotPasswordVerifyOut)
def verify_forgot_password_code(payload: ForgotPasswordVerifyIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    record = find_matching_reset_code(db, user, payload.code)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    return ForgotPasswordVerifyOut(verified=True, message="Verification code accepted. You can now set a new password.")


@router.post("/forgot-password/reset")
def reset_forgotten_password(payload: ForgotPasswordResetIn, db: Session = Depends(get_db)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    record = find_matching_reset_code(db, user, payload.code)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    user.password_hash = get_password_hash(payload.new_password)
    record.used_at = datetime.now(timezone.utc)
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.id != record.id,
        PasswordResetCode.used_at.is_(None),
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "message": "Password reset successfully. Please login with your new password."}


@router.post("/google", response_model=TokenOut)
def google_login(payload: GoogleLoginIn, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID is not configured")
    try:
        info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Google sign-in could not be verified. Make sure backend GOOGLE_CLIENT_ID and "
                "frontend VITE_GOOGLE_CLIENT_ID are the exact same Google OAuth Web Client ID, "
                "and that https://grocery-house-manager.com is added to Authorized JavaScript origins."
            ),
        ) from exc

    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account did not provide an email")

    user = db.query(User).filter(User.email == email.lower()).first()
    if user:
        user.google_sub = user.google_sub or info.get("sub")
        user.avatar_url = user.avatar_url or info.get("picture")
        user.full_name = user.full_name or info.get("name")
    else:
        user = User(
            email=email.lower(),
            full_name=info.get("name"),
            auth_provider=AuthProvider.google,
            google_sub=info.get("sub"),
            avatar_url=info.get("picture"),
        )
        db.add(user)
    db.commit()
    db.refresh(user)
    return issue_token(user)


@router.get("/me", response_model=UserProfileOut)
def get_me(user: User = Depends(get_current_user)):
    return user_profile_out(user)


@router.patch("/me", response_model=UserProfileOut)
def update_me(payload: UserProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    updates = payload.model_dump(exclude_unset=True)
    if "full_name" in updates:
        user.full_name = updates["full_name"]
    if "avatar_url" in updates:
        user.avatar_url = updates["avatar_url"]
    if "country" in updates:
        user.country = normalize_country(updates["country"])
    if "city" in updates:
        user.city = normalize_country(updates["city"])
    db.commit()
    db.refresh(user)
    return user_profile_out(user)

@router.post("/me/edit", response_model=UserProfileOut)
def update_me_via_post(payload: UserProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return update_me(payload, db, user)



@router.get("/me/insights", response_model=PersonalInsightsOut)
def get_personal_insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    plan_value = user.plan_name if isinstance(user.plan_name, PlanName) else PlanName(str(user.plan_name or "free"))
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




def account_delete_preview_data(db: Session, user: User) -> AccountDeletePreviewOut:
    owned_memberships = db.query(HouseMember).filter(
        HouseMember.user_id == user.id,
        HouseMember.role == HouseRole.owner,
    ).all()

    blocked_house_names: list[str] = []
    solo_house_names: list[str] = []
    for membership in owned_memberships:
        member_count = db.query(HouseMember).filter(HouseMember.house_id == membership.house_id).count()
        house = db.get(House, membership.house_id)
        house_name = house.name if house else f"House #{membership.house_id}"
        if member_count > 1:
            blocked_house_names.append(house_name)
        else:
            solo_house_names.append(house_name)

    if blocked_house_names:
        return AccountDeletePreviewOut(
            can_delete=False,
            blocked_shared_houses=blocked_house_names,
            solo_owned_houses=solo_house_names,
            message=(
                "You own shared house(s) with other members. For other members' data security, "
                "remove those members or delete/handle those houses first, then try deleting your account again."
            ),
        )

    if solo_house_names:
        return AccountDeletePreviewOut(
            can_delete=True,
            blocked_shared_houses=[],
            solo_owned_houses=solo_house_names,
            message=(
                "Deleting your account will also permanently delete your owned house(s), products, sections, "
                "shopping lists, receipts, prices, and activity history because you are the only member."
            ),
        )

    return AccountDeletePreviewOut(
        can_delete=True,
        blocked_shared_houses=[],
        solo_owned_houses=[],
        message="Your account can be deleted. Houses you joined but do not own will remain for other members.",
    )


@router.get("/me/delete-preview", response_model=AccountDeletePreviewOut)
def get_account_delete_preview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return account_delete_preview_data(db, user)


@router.post("/me/delete")
def delete_my_account(payload: AccountDeleteIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    expected_name = (user.full_name or user.email or "").strip()
    if payload.confirm_name.strip() != expected_name:
        raise HTTPException(
            status_code=400,
            detail=f"To delete this account, type exactly: {expected_name}",
        )

    owned_memberships = db.query(HouseMember).filter(
        HouseMember.user_id == user.id,
        HouseMember.role == HouseRole.owner,
    ).all()

    blocked_house_names: list[str] = []
    owned_solo_house_ids: list[int] = []
    for membership in owned_memberships:
        member_count = db.query(HouseMember).filter(HouseMember.house_id == membership.house_id).count()
        house = db.get(House, membership.house_id)
        if member_count > 1:
            blocked_house_names.append(house.name if house else f"House #{membership.house_id}")
        else:
            owned_solo_house_ids.append(membership.house_id)

    if blocked_house_names:
        names = ", ".join(blocked_house_names)
        raise HTTPException(
            status_code=400,
            detail=f"You own shared house(s): {names}. Remove other members or transfer/delete those houses before deleting your account.",
        )

    user_name = display_name(user)

    # Leave houses the user does not own, keeping those houses for the remaining members.
    non_owner_memberships = db.query(HouseMember).filter(
        HouseMember.user_id == user.id,
        HouseMember.role != HouseRole.owner,
    ).all()
    for membership in non_owner_memberships:
        log_activity(
            db,
            house_id=membership.house_id,
            user=user,
            action="member_left",
            message=f"{user_name} left this house by deleting their account.",
            entity_type="member",
            entity_id=user.id,
        )
        db.delete(membership)

    # Delete houses the user owns only when they are the sole member.
    for house_id in owned_solo_house_ids:
        house = db.get(House, house_id)
        if house:
            db.delete(house)

    db.flush()
    db.delete(user)
    db.commit()
    return {"ok": True}
