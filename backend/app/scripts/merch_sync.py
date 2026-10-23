"""Poll PrintKK order state. Run periodically (e.g. cron every 30 minutes).

Never creates or pays a supplier order. It updates only orders already linked to
PrintKK. Supplier has no guaranteed webhook, so polling keeps tracking fresh.
"""
import json
import logging
from app.db.session import SessionLocal
from app.models import MerchOrder, MerchOrderEvent
from app.integrations.printkk import PrintKKClient,PrintKKError

logging.basicConfig(level=logging.INFO)
log=logging.getLogger(__name__)

def sync_once(limit=100):
    client=PrintKKClient()
    with SessionLocal() as db:
        orders=db.query(MerchOrder).filter(MerchOrder.printkk_order_id.isnot(None),
            MerchOrder.status.notin_(['completed','refunded','canceled'])).order_by(MerchOrder.id.desc()).limit(limit).all()
        for order in orders:
            try:
                data=client.order_detail(order.printkk_order_id)
                obj=data.get('order') if isinstance(data.get('order'),dict) else data
                state=str(obj.get('orderStatus') or obj.get('status') or '')[:70]
                order.provider_status=state or order.provider_status
                if state in ('waitingForFulfillment','beingFulfilled','partiallyShipped','shipped','completed'):
                    order.provider_stage='paid'
                    if order.status not in ('cancel_requested','refund_pending','refunded'):
                        order.status={'shipped':'shipped','completed':'completed'}.get(state,'processing')
                elif state in ('canceled','closed'):
                    order.provider_stage='supplier_canceled'
                order.tracking_number=str(obj.get('trackingNumber') or order.tracking_number or '') or None
                order.carrier=str(obj.get('carrier') or order.carrier or '') or None
                tracking=str(obj.get('trackingUrl') or '')
                if tracking.startswith('https://'):order.tracking_url=tracking
                db.add(MerchOrderEvent(order_id=order.id,kind='supplier_poll',detail=state))
                db.commit()
            except PrintKKError as exc:
                db.rollback();log.warning('PrintKK sync blocked for order=%s: %s',order.public_id,exc)
            except Exception:
                db.rollback();log.exception('Merch supplier reconciliation error for order %s',order.public_id)

if __name__=='__main__':
    sync_once()
