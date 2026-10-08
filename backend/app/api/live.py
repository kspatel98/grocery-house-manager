import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import Activity, HouseMember, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/houses/{house_id}", tags=["live updates"])


def _authorize_and_snapshot(token: str | None, house_id: int) -> tuple[int | None, int]:
    """Authenticate with a *short-lived* DB session and return the initial snapshot.

    V110 kept one SQLAlchemy Session open for the entire WebSocket lifetime. Since
    the first SELECT checks out a connection until that session closes, every open
    browser tab permanently consumed one QueuePool slot. With pool_size=5 and
    max_overflow=3, eight live tabs/devices could starve every normal HTTP request.

    Live sockets must never own a database connection while they are merely waiting.
    """
    if not token:
        return None, 0
    subject = decode_access_token(token)
    if not subject:
        return None, 0

    with SessionLocal() as db:
        user = db.get(User, int(subject))
        if not user or not user.is_active:
            return None, 0
        membership = (
            db.query(HouseMember.id)
            .filter(HouseMember.house_id == house_id, HouseMember.user_id == user.id)
            .first()
        )
        if membership is None:
            return None, 0
        latest = db.query(func.max(Activity.id)).filter(Activity.house_id == house_id).scalar()
        return int(user.id), int(latest or 0)


def _latest_activity_id(house_id: int) -> int:
    """Read the activity cursor and immediately return the connection to the pool."""
    with SessionLocal() as db:
        value = db.query(func.max(Activity.id)).filter(Activity.house_id == house_id).scalar()
        return int(value or 0)


@router.websocket("/updates/ws")
async def house_updates(websocket: WebSocket, house_id: int):
    """Lightweight household update channel without pinning DB pool connections.

    Each database check uses a short session and is moved off the event loop. Polling
    backs off on transient database failures and the socket stays open instead of
    triggering reconnect storms.
    """
    token = websocket.query_params.get("token")

    try:
        user_id, last_seen = await asyncio.to_thread(_authorize_and_snapshot, token, house_id)
    except SQLAlchemyError as exc:
        logger.warning("Live socket auth DB check failed for house %s: %s", house_id, exc)
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return

    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "connected", "latest_activity_id": last_seen}))

    poll_delay = 3.0
    db_failure_delay = 3.0

    try:
        while True:
            await asyncio.sleep(poll_delay)
            try:
                current = await asyncio.to_thread(_latest_activity_id, house_id)
                db_failure_delay = 3.0
            except SQLAlchemyError as exc:
                # Do not tear down the socket for a temporary pool/PgBouncer issue.
                # A disconnect would make every client reconnect and increase load.
                logger.warning("Live update poll paused for house %s: %s", house_id, exc)
                await asyncio.sleep(db_failure_delay)
                db_failure_delay = min(db_failure_delay * 2, 30.0)
                continue

            if current != last_seen:
                last_seen = current
                await websocket.send_text(json.dumps({"type": "house_updated", "latest_activity_id": current}))
    except WebSocketDisconnect:
        return
    except RuntimeError:
        # Socket already closed while an awaited poll was finishing.
        return
