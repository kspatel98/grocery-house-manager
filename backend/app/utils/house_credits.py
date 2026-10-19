"""House-specific purchased service credits. Never a cash wallet or transferable currency."""
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.models import HouseCreditBalance, HouseCreditEvent, HouseCreditPolicy, House, HouseMember, HouseRole

FEATURES = ('receipt_scan', 'grocery_scan', 'product_lookup', 'ask_ghm', 'kitchen_vision', 'paid_provider')

def balance(db: Session, house_id: int, feature: str) -> int:
    row = db.query(HouseCreditBalance).filter_by(house_id=house_id, feature_key=feature).first()
    return max(0, int(row.balance)) if row else 0

def may_spend(db: Session, house_id: int, actor_id: int | None) -> bool:
    house = db.get(House, house_id)
    if not house or actor_id is None:
        return False
    member = db.query(HouseMember).filter_by(house_id=house_id, user_id=actor_id).first()
    if not member:
        return False
    policy = db.get(HouseCreditPolicy, house_id)
    return member.role in (HouseRole.owner, HouseRole.admin) or not policy or bool(policy.members_can_spend)

def spend(db: Session, house_id: int, actor_id: int | None, feature: str) -> bool:
    """Atomic single-unit deduction; caller commits in its transaction or commits this session.

    Guard with a SQL UPDATE conditional to prevent two concurrent scans spending
    the same final credit; do not fall back to unmetered AI requests.
    """
    if feature not in FEATURES or not may_spend(db, house_id, actor_id):
        return False
    updated = db.execute(
        update(HouseCreditBalance)
        .where(HouseCreditBalance.house_id == house_id,
               HouseCreditBalance.feature_key == feature,
               HouseCreditBalance.balance > 0)
        .values(balance=HouseCreditBalance.balance - 1)
        .returning(HouseCreditBalance.id)
    ).scalar_one_or_none()
    if updated is None:
        return False
    db.add(HouseCreditEvent(house_id=house_id, actor_user_id=actor_id, feature_key=feature,
                            delta=-1, event_type='spent'))
    return True
