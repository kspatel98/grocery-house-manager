import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import Activity, HouseMember, User

router = APIRouter(prefix="/houses/{house_id}", tags=["live updates"])


def get_user_from_token(token: str | None, db):
    if not token:
        return None
    subject = decode_access_token(token)
    if not subject:
        return None
    user = db.get(User, int(subject))
    if not user or not user.is_active:
        return None
    return user


def is_house_member(house_id: int, user_id: int, db) -> bool:
    return db.query(HouseMember.id).filter(
        HouseMember.house_id == house_id,
        HouseMember.user_id == user_id,
    ).first() is not None


def latest_activity_id(house_id: int, db) -> int:
    value = db.query(func.max(Activity.id)).filter(Activity.house_id == house_id).scalar()
    return int(value or 0)


@router.websocket("/updates/ws")
async def house_updates(websocket: WebSocket, house_id: int):
    """Tiny near-real-time update channel for local development.

    The client reconnects automatically. Each connection checks the latest activity
    id every second and sends a message when anything in that house changes.
    """
    token = websocket.query_params.get("token")
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        if not user or not is_house_member(house_id, user.id, db):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await websocket.accept()
        last_seen = latest_activity_id(house_id, db)
        await websocket.send_text(json.dumps({"type": "connected", "latest_activity_id": last_seen}))

        while True:
            await asyncio.sleep(1)
            db.expire_all()
            current = latest_activity_id(house_id, db)
            if current != last_seen:
                last_seen = current
                await websocket.send_text(json.dumps({"type": "house_updated", "latest_activity_id": current}))
    except WebSocketDisconnect:
        return
    finally:
        db.close()
