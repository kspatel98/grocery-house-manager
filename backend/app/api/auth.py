from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import AuthProvider, User
from app.schemas import GoogleLoginIn, LoginIn, RegisterIn, TokenOut, UserProfileOut, UserProfileUpdate

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

