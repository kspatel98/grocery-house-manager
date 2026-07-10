from datetime import datetime, timedelta, timezone
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_house_limit, ensure_member_limit, get_house_plan
from app.core.config import settings
from app.db.session import get_db
from app.models import Activity, House, HouseMember, HouseRole, Invite, Section, User
from app.schemas import ActivityOut, HouseCreate, HouseMemberOut, HouseOut, InviteOut, InvitePreviewOut, PlanLimitsOut, PlanOut

router = APIRouter(prefix="/houses", tags=["houses"])

DEFAULT_SECTIONS = [
    ("Fruits", "🍎"),
    ("Vegetables", "🥦"),
    ("Dairy", "🥛"),
    ("Snacks", "🍿"),
    ("Bakery", "🍞"),
    ("Frozen", "🧊"),
    ("Household", "🧽"),
]


def serialize_member(member: HouseMember) -> HouseMemberOut:
    return HouseMemberOut(
        id=member.id,
        user_id=member.user_id,
        full_name=member.user.full_name,
        email=None,
        avatar_url=member.user.avatar_url,
        role=member.role,
        joined_at=member.joined_at,
    )


def serialize_activity(activity: Activity) -> ActivityOut:
    return ActivityOut(
        id=activity.id,
        house_id=activity.house_id,
        action=activity.action,
        message=activity.message,
        entity_type=activity.entity_type,
        entity_id=activity.entity_id,
        created_at=activity.created_at,
        user=activity.user,
    )


def serialize_house(house: House, role: HouseRole | None, db: Session) -> HouseOut:
    owner = db.get(User, house.created_by_id) if house else None
    return HouseOut(
        id=house.id,
        name=house.name,
        role=role,
        owner_name=display_name(owner) if owner else None,
        owner_plan_name=owner.plan_name if owner else None,
        created_at=house.created_at,
    )


def serialize_plan(plan) -> PlanOut:
    return PlanOut(
        key=plan.key,
        name=plan.name,
        price_monthly_cad=plan.price_monthly_cad,
        regular_price_monthly_cad=plan.regular_price_monthly_cad,
        discount_percent=plan.discount_percent,
        discount_label=plan.discount_label,
        tagline=plan.tagline,
        limits=PlanLimitsOut(
            houses=plan.limits.houses,
            products_per_house=plan.limits.products_per_house,
            active_lists_per_house=plan.limits.active_lists_per_house,
            members_per_house=plan.limits.members_per_house,
            receipt_scans_per_month=plan.limits.receipt_scans_per_month,
        ),
        features=plan.features,
        recommended=plan.recommended,
    )


def require_house_owner(house_id: int, user: User, db: Session) -> HouseMember:
    membership = db.query(HouseMember).filter(
        HouseMember.house_id == house_id,
        HouseMember.user_id == user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this house")
    if membership.role != HouseRole.owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the house owner can do this")
    return membership


def house_member_count(house_id: int, db: Session) -> int:
    return db.query(HouseMember).filter(HouseMember.house_id == house_id).count()


@router.get("", response_model=list[HouseOut])
def list_houses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    memberships = db.query(HouseMember).filter(HouseMember.user_id == user.id).all()
    result = []
    for membership in memberships:
        house = db.get(House, membership.house_id)
        result.append(serialize_house(house, membership.role, db))
    return result


@router.post("", response_model=HouseOut)
def create_house(payload: HouseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_house_limit(db, user)
    house = House(name=payload.name, created_by_id=user.id)
    db.add(house)
    db.flush()
    db.add(HouseMember(house_id=house.id, user_id=user.id, role=HouseRole.owner))
    for index, (name, icon) in enumerate(DEFAULT_SECTIONS):
        db.add(Section(house_id=house.id, name=name, icon=icon, sort_order=index))
    log_activity(
        db,
        house_id=house.id,
        user=user,
        action="house_created",
        message=f"House {house.name} created by {display_name(user)}.",
        entity_type="house",
        entity_id=house.id,
    )
    db.commit()
    db.refresh(house)
    return serialize_house(house, HouseRole.owner, db)


@router.get("/{house_id}", response_model=HouseOut)
def get_house(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    membership = require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    return serialize_house(house, membership.role, db)


@router.get("/{house_id}/plan", response_model=PlanOut)
def get_house_subscription_plan(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return serialize_plan(get_house_plan(db, house_id))


@router.get("/{house_id}/members", response_model=list[HouseMemberOut])
def list_house_members(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    members = (
        db.query(HouseMember)
        .options(joinedload(HouseMember.user))
        .filter(HouseMember.house_id == house_id)
        .order_by(HouseMember.joined_at.asc())
        .all()
    )
    return [serialize_member(member) for member in members]


@router.get("/{house_id}/activities", response_model=list[ActivityOut])
def list_house_activities(
    house_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    activities = (
        db.query(Activity)
        .options(joinedload(Activity.user))
        .filter(Activity.house_id == house_id)
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .limit(limit)
        .all()
    )
    return [serialize_activity(activity) for activity in activities]


@router.post("/{house_id}/invite", response_model=InviteOut)
def create_invite(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    invite = Invite(house_id=house_id, token=token, created_by_id=user.id, expires_at=expires_at)
    db.add(invite)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="invite_created",
        message=f"Invite link created by {display_name(user)}.",
        entity_type="invite",
    )
    db.commit()
    join_url = f"{settings.frontend_url}/join/{token}"
    return InviteOut(token=token, join_url=join_url, expires_at=expires_at)


@router.get("/join/{token}/preview", response_model=InvitePreviewOut)
def preview_invite(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    invite = db.query(Invite).filter(Invite.token == token, Invite.is_active == True).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or inactive")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite has expired")

    house = db.get(House, invite.house_id)
    inviter = db.get(User, invite.created_by_id)
    membership = db.query(HouseMember).filter(
        HouseMember.house_id == invite.house_id,
        HouseMember.user_id == user.id,
    ).first()
    if not house:
        raise HTTPException(status_code=404, detail="House not found")

    return InvitePreviewOut(
        token=token,
        house_id=house.id,
        house_name=house.name,
        inviter_name=display_name(inviter) if inviter else "Someone",
        inviter_email=None,
        expires_at=invite.expires_at,
        already_member=membership is not None,
    )


@router.post("/join/{token}", response_model=HouseOut)
def join_house(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    invite = db.query(Invite).filter(Invite.token == token, Invite.is_active == True).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or inactive")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite has expired")
    membership = db.query(HouseMember).filter(
        HouseMember.house_id == invite.house_id,
        HouseMember.user_id == user.id,
    ).first()
    if not membership:
        # Free users are allowed to join invited houses. House capacity is controlled by
        # the owner's plan, not the joining member's plan.
        ensure_member_limit(db, invite.house_id, user)
        membership = HouseMember(house_id=invite.house_id, user_id=user.id, role=HouseRole.member)
        db.add(membership)
        log_activity(
            db,
            house_id=invite.house_id,
            user=user,
            action="member_joined",
            message=f"{display_name(user)} joined this house.",
            entity_type="member",
            entity_id=user.id,
        )
        db.commit()
    house = db.get(House, invite.house_id)
    return serialize_house(house, membership.role, db)


@router.post("/{house_id}/leave")
def leave_house(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    membership = require_house_member(house_id, user, db)
    if membership.role == HouseRole.owner:
        raise HTTPException(
            status_code=400,
            detail="Owners cannot leave their own house. Remove other members first, then delete the house.",
        )

    user_name = display_name(user)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="member_left",
        message=f"{user_name} left this house.",
        entity_type="member",
        entity_id=user.id,
    )
    db.flush()
    db.delete(membership)
    db.commit()
    return {"ok": True}


@router.delete("/{house_id}")
def delete_house(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_owner(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")

    count = house_member_count(house_id, db)
    if count > 1:
        raise HTTPException(
            status_code=400,
            detail="You can delete this house only when you are the only remaining member. Remove other members first.",
        )

    db.delete(house)
    db.commit()
    return {"ok": True}


@router.delete("/{house_id}/members/{member_id}")
def remove_house_member(house_id: int, member_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_owner(house_id, user, db)
    target = (
        db.query(HouseMember)
        .options(joinedload(HouseMember.user))
        .filter(HouseMember.id == member_id, HouseMember.house_id == house_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="House member not found")
    if target.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot kick yourself. Delete the house when you are the only member.")
    if target.role == HouseRole.owner:
        raise HTTPException(status_code=400, detail="The house owner cannot be kicked out")

    target_name = display_name(target.user)
    db.delete(target)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="member_removed",
        message=f"{target_name} was removed from this house by {display_name(user)}.",
        entity_type="member",
        entity_id=target.user_id,
    )
    db.commit()
    return {"ok": True}
