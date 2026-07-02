from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.api.deps import get_current_user
from app.api.activity_utils import display_name, log_activity
from app.models import AuthProvider, House, HouseMember, HouseRole, User
from app.schemas import AccountDeleteIn, GoogleLoginIn, LoginIn, RegisterIn, TokenOut, UserProfileOut, UserProfileUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


def issue_token(user: User) -> TokenOut:
    token = create_access_token(user.id, timedelta(minutes=settings.access_token_expire_minutes))
    return TokenOut(access_token=token, user=user)


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
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

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


@router.patch("/me", response_model=UserProfileOut)
def update_me(payload: UserProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    updates = payload.model_dump(exclude_unset=True)
    if "full_name" in updates:
        user.full_name = updates["full_name"]
    if "avatar_url" in updates:
        user.avatar_url = updates["avatar_url"]
    db.commit()
    db.refresh(user)
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

@router.post("/me/edit", response_model=UserProfileOut)
def update_me_via_post(payload: UserProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return update_me(payload, db, user)



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
