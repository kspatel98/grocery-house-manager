"""Automatic PrintKK DRAFT submission, run from GHM's existing server lifecycle.

Never automatically pay the supplier wallet. Actual supplier amount is not
verified through an authoritative CAD shipping quote, so payment is a human
approval gate. If a provider request times out, mark uncertain and never retry
blindly. This is intentionally conservative even in automatic mode.
"""
from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import MerchOrder, MerchStoreControls
from app.core.config import settings
from app.integrations.printkk import PrintKKClient, PrintKKError

log = logging.getLogger(__name__)


def process_one(public_id: str):
    if not settings.merch_auto_fulfillment_allowed:
        return False
    from app.api.merch_orders import event, paid_ready
    with SessionLocal() as db:
        ctrl = db.get(MerchStoreControls, 1)
        if not ctrl or ctrl.fulfillment_mode != 'automatic' or ctrl.checkout_audience == 'paused':
            return False
        o = db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
        if not o or not paid_ready(o) or o.provider_stage!='not_submitted' or o.printkk_order_id:
            return False
        # Commit the durable barrier BEFORE any network request.
        o.provider_stage='submission_uncertain'
        o.provider_attempted_at=datetime.now(timezone.utc)
        event(db,o,'supplier_auto_submission_started')
        db.commit()
        try:
            response=PrintKKClient().create_order(o)
            result=response.get('order') if isinstance(response.get('order'),dict) else response
            supplier_id=result.get('orderId') or result.get('id')
            if not supplier_id:
                raise PrintKKError('Supplier did not return an order ID. Reconcile in PrintKK.')
            o.printkk_order_id=str(supplier_id)
            o.provider_stage='draft_unpaid'
            o.provider_status='pendingPayment'
            o.provider_response_json=json.dumps(response)[:5000]
            o.status='supplier_unpaid'
            event(db,o,'supplier_draft_created',f'PrintKK ID {supplier_id} (automatic draft)')
            db.commit()
            return True
        except Exception as exc:
            log.error('GHM auto fulfillment uncertain for %s: %s',public_id,exc)
            o.provider_response_json=json.dumps({'issue':str(exc)[:500]})
            event(db,o,'supplier_submission_uncertain',str(exc)[:500])
            db.commit()
            return False


def process_batch(limit=3):
    if not settings.merch_auto_fulfillment_allowed:
        return 0
    with SessionLocal() as db:
        ctrl=db.get(MerchStoreControls,1)
        if not ctrl or ctrl.fulfillment_mode!='automatic' or ctrl.checkout_audience=='paused':
            return 0
        refs=[o.public_id for o in db.query(MerchOrder).filter(
            MerchOrder.provider_stage=='not_submitted',
            MerchOrder.status.in_(['paid','fulfillment_review']),
            MerchOrder.payment_verified_at.is_not(None)
        ).order_by(MerchOrder.id.asc()).limit(limit).all()]
    return sum(bool(process_one(ref)) for ref in refs)
