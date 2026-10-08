from datetime import datetime, timedelta, timezone
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_house_limit, ensure_member_limit, get_house_plan
from app.core.config import settings
from app.db.session import get_db
from app.models import Activity, House, HouseMember, HouseMessageReaction, HouseRole, Invite, Section, User
from app.schemas import ActivityOut, HouseCreate, HouseMemberOut, HouseMessageIn, HouseMessageReactionIn, HouseMessageReactionOut, HouseOut, HouseUpdate, InviteOut, InvitePreviewOut, PlanLimitsOut, PlanOut

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


_CHAT_REACTIONS = {"👍", "❤️", "😂", "😮", "😢", "🙏", "🎉"}


def serialize_chat_activities(db: Session, activities: list[Activity], viewer_id: int) -> list[ActivityOut]:
    if not activities:
        return []
    reply_ids = {int(row.reply_to_id) for row in activities if getattr(row, "reply_to_id", None)}
    reply_by_id: dict[int, Activity] = {}
    if reply_ids:
        reply_rows = (
            db.query(Activity)
            .options(joinedload(Activity.user))
            .filter(Activity.id.in_(reply_ids), Activity.action == "house_message")
            .all()
        )
        reply_by_id = {row.id: row for row in reply_rows}

    ids = [row.id for row in activities]
    reaction_rows = (
        db.query(HouseMessageReaction)
        .filter(HouseMessageReaction.activity_id.in_(ids))
        .order_by(HouseMessageReaction.id.asc())
        .all()
    )
    reactions_by_activity: dict[int, dict[str, list[int]]] = {}
    for row in reaction_rows:
        reactions_by_activity.setdefault(row.activity_id, {}).setdefault(row.emoji, []).append(row.user_id)

    output: list[ActivityOut] = []
    for activity in activities:
        reply_to_id = getattr(activity, "reply_to_id", None)
        reply = reply_by_id.get(reply_to_id) if reply_to_id else None
        grouped = reactions_by_activity.get(activity.id, {})
        reactions = [
            HouseMessageReactionOut(
                emoji=emoji,
                count=len(user_ids),
                user_ids=user_ids,
                reacted_by_me=viewer_id in user_ids,
            )
            for emoji, user_ids in grouped.items()
        ]
        output.append(ActivityOut(
            id=activity.id,
            house_id=activity.house_id,
            action=activity.action,
            message=activity.message or "",
            entity_type=activity.entity_type,
            entity_id=activity.entity_id,
            reply_to_id=reply_to_id,
            reply_to_message=((reply.message or reply.attachment_title or "Shared item")[:180] if reply else None),
            reply_to_user_name=(display_name(reply.user) if reply and reply.user else ("House member" if reply else None)),
            attachment_type=getattr(activity, "attachment_type", None),
            attachment_title=getattr(activity, "attachment_title", None),
            attachment_subtitle=getattr(activity, "attachment_subtitle", None),
            attachment_url=getattr(activity, "attachment_url", None),
            reactions=reactions,
            created_at=activity.created_at,
            user=activity.user,
        ))
    return output


def serialize_chat_activity(db: Session, activity: Activity, viewer_id: int) -> ActivityOut:
    return serialize_chat_activities(db, [activity], viewer_id)[0]


def serialize_house(house: House, role: HouseRole | None, db: Session) -> HouseOut:
    owner = db.get(User, house.created_by_id) if house else None
    return HouseOut(
        id=house.id,
        name=house.name,
        role=role,
        owner_name=display_name(owner) if owner else None,
        owner_plan_name=owner.plan_name if owner else None,
        contribute_community_prices=bool(house.contribute_community_prices),
        household_type=house.household_type or "family",
        expense_book_mode=(house.expense_book_mode or "auto"),
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
    house = House(name=payload.name, created_by_id=user.id, household_type=payload.household_type)
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


@router.patch("/{house_id}", response_model=HouseOut)
def update_house(house_id: int, payload: HouseUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    membership = require_house_member(house_id, user, db)
    if membership.role not in {HouseRole.owner, HouseRole.admin}:
        raise HTTPException(status_code=403, detail="Only a house owner or admin can change household settings.")
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(house, key, value)
    log_activity(db, house_id=house_id, user=user, action="house_settings_updated", message=f"Household settings updated by {display_name(user)}.", entity_type="house", entity_id=house.id)
    db.commit()
    db.refresh(house)
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
        .filter(Activity.house_id == house_id, Activity.action != "house_message")
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .limit(limit)
        .all()
    )
    return [serialize_activity(activity) for activity in activities]


@router.get("/{house_id}/chat", response_model=list[ActivityOut])
def list_house_chat(
    house_id: int,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    rows = (
        db.query(Activity)
        .options(joinedload(Activity.user))
        .filter(Activity.house_id == house_id, Activity.action == "house_message")
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return serialize_chat_activities(db, rows, user.id)


@router.post("/{house_id}/chat", response_model=ActivityOut)
def post_house_chat(
    house_id: int,
    payload: HouseMessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    clean = " ".join((payload.message or "").split()).strip()
    attachment_title = " ".join((payload.attachment_title or "").split()).strip()
    if not clean and not (payload.attachment_type and attachment_title):
        raise HTTPException(status_code=400, detail="Write a message or attach a GHM item.")

    reply_to = None
    if payload.reply_to_id is not None:
        reply_to = db.query(Activity).filter(
            Activity.id == payload.reply_to_id,
            Activity.house_id == house_id,
            Activity.action == "house_message",
        ).first()
        if not reply_to:
            raise HTTPException(status_code=400, detail="The message you are replying to is no longer available.")

    attachment_url = (payload.attachment_url or "").strip() or None
    if attachment_url and not attachment_url.startswith("/"):
        raise HTTPException(status_code=400, detail="House chat attachments must link to a GHM page.")

    activity = log_activity(
        db,
        house_id=house_id,
        user=user,
        action="house_message",
        message=clean[:1200],
        entity_type="house_chat",
    )
    activity.reply_to_id = reply_to.id if reply_to else None
    activity.attachment_type = payload.attachment_type
    activity.attachment_title = attachment_title[:180] if attachment_title else None
    activity.attachment_subtitle = (payload.attachment_subtitle or "").strip()[:500] or None
    activity.attachment_url = attachment_url
    db.commit()
    db.refresh(activity)
    activity = db.query(Activity).options(joinedload(Activity.user)).filter(Activity.id == activity.id).first()
    return serialize_chat_activity(db, activity, user.id)


@router.post("/{house_id}/chat/{message_id}/reactions", response_model=ActivityOut)
def toggle_house_chat_reaction(
    house_id: int,
    message_id: int,
    payload: HouseMessageReactionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    emoji = payload.emoji.strip()
    if emoji not in _CHAT_REACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported reaction.")
    activity = (
        db.query(Activity)
        .options(joinedload(Activity.user))
        .filter(Activity.id == message_id, Activity.house_id == house_id, Activity.action == "house_message")
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Message not found")
    existing = db.query(HouseMessageReaction).filter(
        HouseMessageReaction.activity_id == message_id,
        HouseMessageReaction.user_id == user.id,
        HouseMessageReaction.emoji == emoji,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(HouseMessageReaction(activity_id=message_id, user_id=user.id, emoji=emoji))
    db.commit()
    return serialize_chat_activity(db, activity, user.id)


@router.delete("/{house_id}/chat/{message_id}")
def delete_house_chat(
    house_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    activity = db.query(Activity).filter(Activity.id == message_id, Activity.house_id == house_id, Activity.action == "house_message").first()
    if not activity:
        raise HTTPException(status_code=404, detail="Message not found")
    # House chat is personal communication: even owners/admins may delete only
    # their own messages. Administrative moderation belongs in a separate audit flow.
    if activity.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    db.delete(activity)
    db.commit()
    return {"ok": True}


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
