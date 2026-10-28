"""GHM merchandise ordering: CAD amounts, signed payments, wallet escrow, audit events.

Live checkout is feature-gated. Backend always derives price/stock/tax, never trusts
client totals. PrintKK order submission is a separate administrative workflow.
"""
from __future__ import annotations
import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Literal
import stripe
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.api.admin import require_admin
from app.api.credit_wallet import _balance, _increase, _decrease
from app.core.config import settings
from app.db.session import get_db
from app.models import MerchCatalogProduct, MerchOrder, MerchOrderEvent, MerchStoreControls, CreditWalletEvent, User

router = APIRouter(prefix='/merch', tags=['GHM Store orders'])
logger = logging.getLogger(__name__)

class Address(BaseModel):
    name: str = Field(min_length=2,max_length=140)
    line1: str = Field(min_length=5,max_length=180)
    line2: str = Field(default='',max_length=180)
    city: str = Field(min_length=2,max_length=120)
    province: str = Field(min_length=2,max_length=80)
    postal_code: str = Field(min_length=3,max_length=16)
    country: Literal['CA'] = 'CA'
    phone: str = Field(default='',max_length=30)
    @field_validator('province')
    @classmethod
    def valid_province(cls,value):
        value=value.upper().strip()
        if value not in {'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'}:
            raise ValueError('Select a Canadian province or territory')
        return value
    @field_validator('postal_code')
    @classmethod
    def valid_postal(cls,value):
        import re
        value=value.upper().replace(' ','').strip()
        if not re.fullmatch(r'[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][0-9][ABCEGHJ-NPRSTV-Z][0-9]',value):
            raise ValueError('Enter a valid Canadian postal code')
        return value[:3]+' '+value[3:]

class CartLine(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1,le=10)

class QuoteRequest(BaseModel):
    items: list[CartLine] = Field(min_length=1,max_length=15)
    shipping: Address
    tokens: int = Field(default=0,ge=0,le=500)

class CheckoutRequest(QuoteRequest):
    idempotency_key: str = Field(min_length=16,max_length=100,pattern=r'^[a-zA-Z0-9_-]+$')

class CancelRequest(BaseModel):
    reason: str = Field(default='Customer requested cancellation.',max_length=400)

class AdminAction(BaseModel):
    reason: str = Field(default='',max_length=500)


def missing_checkout_configuration():
    """Safe, descriptive readiness diagnostics (never return credential values)."""
    checks = (
        ('MERCH_CHECKOUT_ENABLED=true', settings.merch_checkout_enabled),
        ('MERCH_TAX_ENABLED=true', settings.merch_tax_enabled),
        ('STRIPE_SECRET_KEY', settings.stripe_secret_key),
        ('STRIPE_WEBHOOK_SECRET', settings.stripe_webhook_secret),
        ('PRINTKK_API_KEY', settings.printkk_api_key),
        ('MERCH_SHIPPING_CENTS_CAD (nonnegative)', settings.merch_shipping_cents_cad >= 0),
    )
    return [label for label, configured in checks if not configured]


def ready():
    return not missing_checkout_configuration()


def controls(db=None):
    """Existing installations retain pilot behavior until Admin saves settings."""
    if isinstance(db, Session):
        row = db.get(MerchStoreControls, 1)
        if row:
            return row
    # Preserve v150 legacy pilot rather than opening checkout after upgrade.
    return MerchStoreControls(id=1, checkout_audience=(
        'pilot' if settings.merch_pilot_email else 'paused'),
        pilot_email=settings.merch_pilot_email or '', fulfillment_mode='manual')


def effective_access(db=None, user=None):
    control = controls(db)
    audience = control.checkout_audience
    email = (control.pilot_email or '').strip().casefold()
    is_tester = bool(email and user and (user.email or '').strip().casefold() == email)
    allowed = bool(ready() and (audience == 'public' or (audience == 'pilot' and is_tester)))
    return {'checkout_available': allowed,
            'pilot_mode': audience == 'pilot', 'is_pilot_tester': is_tester,
            'audience': audience,
            'message': ('GHM Store is paused by its administrator.' if audience == 'paused' else
                        'Private pilot: only the designated GHM account may place orders.' if audience == 'pilot' and not is_tester else
                        'Checkout needs payment, tax, shipping and PrintKK configuration.' if not ready() else
                        'Secure checkout is available.')}


def require_ready(user=None, db=None):
    if not ready():
        raise HTTPException(503, 'GHM Store requires configured Stripe, Stripe Tax, shipping and PrintKK settings.')
    policy = effective_access(db, user)
    if not policy['checkout_available']:
        raise HTTPException(403, policy['message'])


@router.get('/access')
def checkout_access(user: User=Depends(get_current_user), db:Session=Depends(get_db)):
    return effective_access(db if isinstance(db, Session) else None, user)


def event(db, order, kind, detail='', key=None, actor=None):
    db.add(MerchOrderEvent(order_id=order.id,kind=kind,detail=detail[:1500],event_key=key,actor_user_id=actor))

def snapshot(db, body):
    ids=[x.product_id for x in body.items]
    if len(set(ids))!=len(ids):raise HTTPException(400,'Combine duplicate cart lines before checkout.')
    rows=db.query(MerchCatalogProduct).filter(MerchCatalogProduct.id.in_(ids)).all()
    lookup={x.id:x for x in rows}
    items=[]
    for line in body.items:
        p=lookup.get(line.product_id)
        if not p or not p.active or p.price_cents_cad<=0 or not p.printkk_design_id:
            raise HTTPException(400,f'Item {line.product_id} is unavailable or missing its PrintKK variant.')
        items.append({'product_id':p.id,'sku':p.sku,'name':p.name,'quantity':line.quantity,
            'unit_cents':p.price_cents_cad,'printkk_design_specification_code':p.printkk_design_id,
            'image_url':p.image_url})
    subtotal=sum(x['unit_cents']*x['quantity'] for x in items)
    if subtotal>2_000_000:raise HTTPException(400,'Cart exceeds the order maximum.')
    return items,subtotal

def tax_quote(subtotal,shipping_cents,address):
    """Stripe Tax must calculate the full taxable sale *before* GHM credit application.

    Merchant must activate and validate tax registrations in Stripe. The customer
    is not charged through this calculation; Checkout charges its fixed result.
    """
    if not settings.merch_tax_enabled:
        raise HTTPException(503,'Stripe Tax for GHM merchandise is not configured.')
    stripe.api_key=settings.stripe_secret_key
    try:
        result=stripe.tax.Calculation.create(currency='cad',
            customer_details={'address':{'line1':address.line1,'line2':address.line2 or None,
                'city':address.city,'state':address.province,'postal_code':address.postal_code,
                'country':'CA'},'address_source':'shipping'},
            line_items=[{'amount':subtotal,'reference':'ghm-merch-goods','tax_behavior':'exclusive'}],
            shipping_cost={'amount':shipping_cents,'tax_behavior':'exclusive'})
        amount_total=int(result['amount_total'])
        tax=int(result['tax_amount_exclusive']) if result.get('tax_amount_exclusive') is not None else amount_total-subtotal-shipping_cents
        if tax<0 or amount_total!=subtotal+shipping_cents+tax:raise ValueError('Inconsistent Stripe Tax result')
        return tax, str(result.get('id') or '')
    except Exception as exc:
        logger.exception('Merchandise tax calculation failed')
        raise HTTPException(503,'Unable to calculate delivery taxes. No purchase was made.') from exc

def quote(db,body,user_id,user=None):
    require_ready(user,db)
    items,sub=snapshot(db,body)
    delivery=int(settings.merch_shipping_cents_cad)
    tax,_=tax_quote(sub,delivery,body.shipping)
    total=sub+delivery+tax
    balance=_balance(db,'user',user_id)
    max_tokens=min(balance,settings.merch_max_tokens_per_order,total//100)
    if body.tokens>max_tokens:
        raise HTTPException(400,f'You can apply up to {max_tokens} available whole GHM Tokens to this order.')
    token_use=body.tokens
    due=total-token_use*100
    if 0<due<50:
        # Stripe's minimum CAD payment must be met; user can use one fewer token.
        raise HTTPException(400,'Card remainder must be at least CA$0.50. Reduce tokens by one.')
    return {'items':items,'subtotal_cents':sub,'shipping_cents':delivery,'tax_cents':tax,
      'total_cents':total,'tokens':token_use,'tokens_available':balance,
      'max_tokens':max_tokens,'card_cents':due,'currency':'CAD',
      'tax_note':'Customer sales tax calculated with Stripe Tax. Delivery is GHM’s configured customer shipping charge, not a live PrintKK freight quote.'}

def public_order(o, include_private=False):
    result={'id':o.public_id,'status':o.status,'items':json.loads(o.items_json),
        'subtotal_cents':o.subtotal_cents,'shipping_cents':o.shipping_cents,
        'tax_cents':o.tax_cents,'total_cents':o.total_cents,'tokens_used':o.tokens_reserved,
        'card_cents':o.stripe_due_cents,'created_at':o.created_at.isoformat() if o.created_at else None,
        'provider_stage':o.provider_stage,'provider_status':o.provider_status,
        'tracking_number':o.tracking_number,'tracking_url':o.tracking_url,'carrier':o.carrier,
        'cancellation_reason':o.cancellation_reason,'payment_confirmed':bool(o.payment_verified_at),'cancellation_pending':bool(o.cancellation_reason and o.status not in ('canceled','refunded'))}
    if include_private:
        result.update({'email':o.customer_email,'shipping_address':json.loads(o.shipping_address_json),
            'printkk_order_id':o.printkk_order_id,'provider_response':o.provider_response_json,
            'stripe_session_id':o.stripe_session_id,'stripe_refund_id':o.stripe_refund_id,
            'support_note':o.support_note})
    return result

@router.post('/quote')
def create_quote(body:QuoteRequest,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    return quote(db,body,user.id,user)

@router.post('/checkout')
def checkout(body:CheckoutRequest,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    require_ready(user,db)
    digest=hashlib.sha256(body.model_dump_json(exclude={'idempotency_key'}).encode()).hexdigest()
    old=db.query(MerchOrder).filter_by(user_id=user.id,client_key=body.idempotency_key).first()
    if old:
        if old.cart_hash!=digest:raise HTTPException(409,'Checkout key was already used for a different order.')
        if old.status in ('checkout_attention','awaiting_payment') and not old.stripe_checkout_url:
            raise HTTPException(409,'Checkout requires Stripe reconciliation. Contact GHM support with the order reference.')
        return {'order':public_order(old),'checkout_url':old.stripe_checkout_url,'reused':True}
    total=quote(db,body,user.id,user)
    order=MerchOrder(public_id='GHM-'+secrets.token_hex(7).upper(),user_id=user.id,
        client_key=body.idempotency_key,cart_hash=digest,
        status='awaiting_payment' if total['card_cents'] else 'paid',
        customer_name=body.shipping.name,customer_email=user.email,
        shipping_address_json=body.shipping.model_dump_json(),items_json=json.dumps(total['items']),
        subtotal_cents=total['subtotal_cents'],shipping_cents=total['shipping_cents'],
        tax_cents=total['tax_cents'],total_cents=total['total_cents'],
        tokens_reserved=total['tokens'],stripe_due_cents=total['card_cents'],
        payment_verified_at=datetime.now(timezone.utc) if not total['card_cents'] else None)
    try:
        if total['tokens'] and not _decrease(db,'user',user.id,total['tokens']):
            db.rollback();raise HTTPException(409,'GHM Token balance changed. Refresh checkout.')
        db.add(order);db.flush()
        if total['tokens']:
            db.add(CreditWalletEvent(owner_type='user',owner_id=user.id,actor_user_id=user.id,
                delta=-total['tokens'],event_type='merch_escrow',transfer_key=order.public_id,
                amount_cents=total['tokens']*100))
        event(db,order,'created',actor=user.id)
        if not total['card_cents']:event(db,order,'payment_verified','All-token checkout; securely debited.',actor=user.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        previous=db.query(MerchOrder).filter_by(user_id=user.id,client_key=body.idempotency_key).first()
        if previous and previous.cart_hash==digest:
            return {'order':public_order(previous),'checkout_url':previous.stripe_checkout_url,'reused':True}
        raise HTTPException(409,'Checkout collision. Please retry with a new order key.')
    if not total['card_cents']:
        return {'order':public_order(order),'checkout_url':None,'reused':False}
    stripe.api_key=settings.stripe_secret_key
    try:
        session=stripe.checkout.Session.create(mode='payment',payment_method_types=['card'],
            customer_email=user.email,
            line_items=[{'price_data':{'currency':'cad','unit_amount':total['card_cents'],
                'product_data':{'name':f'GHM Merchandise order {order.public_id}',
                   'description':f"Total CA${total['total_cents']/100:.2f}, including {total['tokens']} GHM Tokens and taxes"}},'quantity':1}],
            success_url=f"{settings.frontend_url.rstrip('/')}/merch?order={order.public_id}&payment=success",
            cancel_url=f"{settings.frontend_url.rstrip('/')}/merch?order={order.public_id}&payment=cancelled",
            client_reference_id=order.public_id,
            metadata={'kind':'ghm_merch','order_id':str(order.id),'public_id':order.public_id,
                'amount_cents':str(total['card_cents']),'user_id':str(user.id)},
            idempotency_key='ghm-merch-session-'+order.public_id)
        order.stripe_session_id=str(session.id);order.stripe_checkout_url=str(session.url)
        event(db,order,'stripe_checkout_created')
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception('Stripe merch session creation uncertain: %s',order.public_id)
        # Do not release escrow automatically: Stripe may have created a Session
        # before a timeout. Reconcile by idempotency key; avoid duplicate orders.
        order=db.get(MerchOrder,order.id)
        order.status='checkout_attention'
        event(db,order,'checkout_attention','Stripe creation result uncertain; admin reconciliation required.')
        db.commit()
        raise HTTPException(503,'Checkout requires review. No second order should be created. Contact GHM support.') from exc
    return {'order':public_order(order),'checkout_url':order.stripe_checkout_url,'reused':False}

@router.get('/orders')
def my_orders(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    return [public_order(o) for o in db.query(MerchOrder).filter_by(user_id=user.id).order_by(MerchOrder.id.desc()).limit(100)]

@router.get('/orders/{public_id}')
def order_detail(public_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    order=db.query(MerchOrder).filter_by(public_id=public_id,user_id=user.id).first()
    if not order:raise HTTPException(404,'Order not found.')
    return public_order(order)

# Public-safe milestones. Never expose raw supplier responses, addresses or internal notes.
CUSTOMER_MILESTONES = {
    'created': 'Order created',
    'stripe_checkout_created': 'Secure payment started',
    'payment_verified': 'Payment confirmed',
    'supplier_draft_created': 'Order received by fulfillment partner',
    'supplier_paid': 'Preparing your order',
    'tracking_updated': 'Tracking information available',
    'supplier_canceled': 'Fulfillment canceled',
    'cancel_requested': 'Cancellation requested',
    'checkout_expired': 'Unpaid checkout expired',
    'tokens_refunded': 'GHM Tokens refunded',
    'card_refund_completed': 'Card refund completed',
    'supplier_cancel_confirmed_by_admin': 'Fulfillment cancellation confirmed',
}

@router.get('/orders/{public_id}/timeline')
def order_timeline(public_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    o=db.query(MerchOrder).filter_by(public_id=public_id,user_id=user.id).first()
    if not o:raise HTTPException(404,'Order not found.')
    events=(db.query(MerchOrderEvent).filter_by(order_id=o.id)
            .order_by(MerchOrderEvent.id.asc()).limit(200).all())
    return [{'label':CUSTOMER_MILESTONES[e.kind], 'kind':e.kind,
             'date':e.created_at.isoformat() if e.created_at else None}
            for e in events if e.kind in CUSTOMER_MILESTONES]

@router.get('/orders/{public_id}/receipt')
def order_receipt(public_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    o=db.query(MerchOrder).filter_by(public_id=public_id,user_id=user.id).first()
    if not o:raise HTTPException(404,'Order not found.')
    if not o.payment_verified_at: raise HTTPException(409, 'A payment receipt is available only after verified payment.')
    return {'receipt_number':o.public_id,'date':o.created_at.isoformat() if o.created_at else None,
      'merchant':'Grocery House Manager','currency':'CAD','items':json.loads(o.items_json),
      'subtotal_cents':o.subtotal_cents,'shipping_cents':o.shipping_cents,
      'tax_cents':o.tax_cents,'total_cents':o.total_cents,'ghm_tokens_used':o.tokens_reserved,
      'stripe_paid_cents':o.stripe_due_cents,'payment_status':'paid' if o.payment_verified_at else 'unpaid',
      'status':o.status,'delivery':json.loads(o.shipping_address_json),
      'seller_name':settings.merch_seller_legal_name or 'Grocery House Manager',
      'seller_address':settings.merch_seller_address or '',
      'gst_hst_number':settings.merch_gst_hst_number or None}

@router.get('/orders/{public_id}/receipt.pdf')
def order_receipt_pdf(public_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    """Immutable paid-order receipt PDF; tax numbers only if merchant configured them.

    Tax on the receipt is GHM's Stripe Tax calculation, NOT PrintKK input tax.
    """
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import simpleSplit
    o=db.query(MerchOrder).filter_by(public_id=public_id,user_id=user.id).first()
    if not o:raise HTTPException(404,'Order not found.')
    if not o.payment_verified_at:raise HTTPException(409,'Receipt is available after confirmed payment.')
    a=json.loads(o.shipping_address_json); items=json.loads(o.items_json)
    out=io.BytesIO(); pdf=canvas.Canvas(out,pagesize=letter)
    pdf.setTitle(f'GHM merchandise receipt {o.public_id}')
    top=letter[1]-52
    def line(txt, y, size=10, bold=False):
        pdf.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
        for part in simpleSplit(str(txt),'Helvetica',size,500):
            pdf.drawString(50,y,part);y-=size+5
        return y
    y=line(settings.merch_seller_legal_name or 'Grocery House Manager',top,16,True)
    if settings.merch_seller_address:y=line(settings.merch_seller_address,y,9)
    if settings.merch_gst_hst_number:y=line('GST/HST registration: '+settings.merch_gst_hst_number,y,9)
    y-=13;y=line('PAYMENT RECEIPT  '+o.public_id,y,12,True)
    y=line('Paid: '+o.payment_verified_at.strftime('%Y-%m-%d %H:%M UTC'),y)
    y=line('Customer: '+o.customer_name,y)
    y=line('Deliver to: '+', '.join(filter(None,[a.get('line1'),a.get('line2'),a.get('city'),a.get('province'),a.get('postal_code'),'Canada'])),y)
    y-=12
    for item in items:
        if y<135:pdf.showPage();y=letter[1]-60
        y=line(f"{item['name']}  x{item['quantity']}   CAD {item['unit_cents']*item['quantity']/100:.2f}",y)
    y-=12
    for label,cents in [('Merchandise',o.subtotal_cents),('Shipping',o.shipping_cents),('Sales tax calculated by Stripe Tax',o.tax_cents),('Total CAD',o.total_cents),('Redeemed GHM Tokens',o.tokens_reserved*100),('Card payment',o.stripe_due_cents)]:
        if y<105:pdf.showPage();y=letter[1]-60
        y=line(f'{label}: CAD {cents/100:.2f}',y,10,label=='Total CAD')
    if o.status in ('refunded','refund_pending'):
        y=line('Refund status: '+o.status.replace('_',' ')+'. See refund confirmation for adjustments.',y-10,9)
    y=line('This is the GHM customer payment record, not a PrintKK supplier invoice.',y-12,8)
    pdf.save();out.seek(0)
    return Response(content=out.read(),media_type='application/pdf',headers={
      'Content-Disposition':f'attachment; filename="GHM-{o.public_id}-receipt.pdf"',
      'Cache-Control':'private, no-store'})

@router.post('/orders/{public_id}/cancel-request')
def request_cancel(public_id:str,body:CancelRequest,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    o=db.query(MerchOrder).filter_by(public_id=public_id,user_id=user.id).first()
    if not o:raise HTTPException(404,'Order not found.')
    if o.status in ('canceled','refunded','refund_pending'):
        return public_order(o)
    if o.status not in ('awaiting_payment','checkout_attention','paid','fulfillment_review','supplier_unpaid','submitted'):
        raise HTTPException(409,'This order is being fulfilled. Please contact support to discuss returns.')
    if o.cancellation_reason and o.status=='cancel_requested':
        return public_order(o)  # do not spam the admin audit queue
    o.cancellation_reason=body.reason
    if o.status in ('paid','fulfillment_review','supplier_unpaid','submitted'):
        o.status='cancel_requested'
    # Keep awaiting_payment / checkout_attention until Stripe verifies a payment;
    # the separate cancellation_pending flag still exposes these in Admin.
    event(db,o,'cancel_requested',body.reason,actor=user.id)
    db.commit()
    return public_order(o)

class StoreControlsUpdate(BaseModel):
    checkout_audience: Literal['paused', 'pilot', 'public']
    pilot_email: str = Field(default='', max_length=255)
    fulfillment_mode: Literal['manual', 'automatic']
    confirm_public_checkout: bool = False
    confirm_automatic_supplier_submissions: bool = False


@router.put('/admin/store-controls')
def admin_update_store_controls(body:StoreControlsUpdate, db:Session=Depends(get_db), user:User=Depends(require_admin)):
    # Explicit acknowledgement prevents an accidental public sales launch.
    if body.checkout_audience=='public':
        if not body.confirm_public_checkout:
            raise HTTPException(400,'Confirm that checkout will be open to all signed-in customers.')
        # Save the administrator's chosen audience even when server credentials
        # are missing. effective_access() and require_ready() STILL block all
        # customer quotes and payments until every configured gate passes.
    email=body.pilot_email.strip().lower()
    if body.checkout_audience=='pilot' and ('@' not in email or '.' not in email.split('@')[-1]):
        raise HTTPException(400,'Provide the exact GHM tester account email for private pilot.')
    if body.fulfillment_mode=='automatic':
        if not body.confirm_automatic_supplier_submissions:
            raise HTTPException(400,'Confirm automatic PrintKK draft submission after verified payment.')
        # Store the requested mode even if the worker is still turned off.
        # process_one()/process_batch() independently check
        # MERCH_AUTO_FULFILLMENT_ALLOWED before contacting PrintKK.
    record=db.get(MerchStoreControls,1)
    if not record:
        record=MerchStoreControls(id=1)
        db.add(record)
    record.checkout_audience=body.checkout_audience
    record.pilot_email=email
    record.fulfillment_mode=body.fulfillment_mode
    db.commit()
    logger.warning('GHM store settings changed by admin user %s: audience=%s fulfillment=%s',user.id,record.checkout_audience,record.fulfillment_mode)
    return {'checkout_audience':record.checkout_audience,'pilot_email':record.pilot_email,
            'fulfillment_mode':record.fulfillment_mode,'auto_worker_enabled':bool(settings.merch_auto_fulfillment_allowed),
            'checkout_live':bool(record.checkout_audience=='public' and ready()),
            'missing_configuration':missing_checkout_configuration()}


@router.get('/admin/readiness')
def admin_merch_readiness(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    active=db.query(MerchCatalogProduct).filter(MerchCatalogProduct.active.is_(True)).all()
    prepared=sum(1 for item in active if item.price_cents_cad>0 and item.printkk_design_id)
    ctrl=controls(db)
    return {'checkout_enabled':bool(settings.merch_checkout_enabled),
            'tax_enabled':bool(settings.merch_tax_enabled),
            'stripe_key_configured':bool(settings.stripe_secret_key),
            'stripe_webhook_configured':bool(settings.stripe_webhook_secret),
            'printkk_key_configured':bool(settings.printkk_api_key),
            'pilot_mode':ctrl.checkout_audience=='pilot',
            'pilot_email':ctrl.pilot_email or None,
            'checkout_audience':ctrl.checkout_audience,
            'fulfillment_mode':ctrl.fulfillment_mode,
            'auto_worker_enabled':bool(settings.merch_auto_fulfillment_allowed),
            'shipping_cents_cad':int(settings.merch_shipping_cents_cad),
            'active_products':len(active),'products_ready_for_checkout':prepared,
            'ready_configuration':ready(),
            'checkout_live':bool(ctrl.checkout_audience=='public' and ready()),
            'missing_configuration':missing_checkout_configuration(),
            'note':'Public is a saved access preference, not proof that checkout is live. Payment remains disabled until all server settings are ready. Configuration checks do not verify actual taxes, shipping charges, PrintKK designs, or settlement. Supplier wallet charges require manual approval.'}

@router.get('/admin/test-printkk-connection')
def admin_test_printkk_connection(_:User=Depends(require_admin)):
    if not settings.printkk_api_key:
        raise HTTPException(503,'PRINTKK_API_KEY is missing in the backend environment.')
    # Official documented catalog-category GET is read-only: no order and no wallet charge.
    try:
        PrintKKClient().call('GET','/api/v1/product/category')
    except PrintKKError as exc:
        raise HTTPException(502,f'PrintKK read-only connection check failed: {exc}') from exc
    return {'connected':True,'message':'PrintKK catalog API authentication succeeded. Order creation, actual shipping quote, supplier wallet payment and tracking are NOT yet verified.'}

def _printkk_design_rows(data):
    """Normalize only recognized response containers, never invent specification codes."""
    if isinstance(data,list): rows=data
    elif isinstance(data,dict):
        rows=next((data[k] for k in ('records','list','items','rows','data') if isinstance(data.get(k),list)),None)
        if rows is None:
            for key in ('page','result'):
                block=data.get(key)
                if isinstance(block,dict):
                    rows=next((block[k] for k in ('records','list','items','rows') if isinstance(block.get(k),list)),None)
                    if rows is not None:break
    else: rows=None
    if rows is None:raise HTTPException(502,'PrintKK returned an unrecognized design list format. No data was changed.')
    results=[]
    for item in rows[:30]:
        if not isinstance(item,dict):continue
        code=item.get('designCode') or item.get('code')
        if not code:continue
        results.append({'design_code':str(code),'name':str(item.get('designName') or item.get('name') or code)[:180],
                        'image_url':_printkk_image(item)})
    return results

def _printkk_image(obj):
    if not isinstance(obj,dict):return None
    candidate=next((obj.get(k) for k in ('mockupUrl','previewUrl','imageUrl','thumbnailUrl','coverUrl') if isinstance(obj.get(k),str)),None)
    if candidate and candidate.startswith('https://') and len(candidate)<=2000:return candidate
    return None

@router.get('/admin/printkk-designs')
def admin_printkk_designs(page:int=1, _:User=Depends(require_admin)):
    if not 1<=page<=100:raise HTTPException(400,'Page out of range.')
    try:
        data=PrintKKClient().design_page(page,15)
        return {'designs':_printkk_design_rows(data),'page':page}
    except PrintKKError as exc:raise HTTPException(502,str(exc)) from exc

@router.get('/admin/printkk-designs/{design_code}')
def admin_printkk_design_detail(design_code:str,_:User=Depends(require_admin)):
    try:data=PrintKKClient().design_detail(design_code)
    except PrintKKError as exc:raise HTTPException(502,str(exc)) from exc
    if not isinstance(data,dict):raise HTTPException(502,'Unexpected design-detail response from PrintKK.')
    raw=data.get('design') if isinstance(data.get('design'),dict) else data
    variants=raw.get('designSpecifications') or raw.get('specifications') or []
    if isinstance(variants,dict):variants=variants.get('list') or variants.get('records') or []
    if not isinstance(variants,list):variants=[]
    variants_out=[]
    for v in variants:
        if not isinstance(v,dict):continue
        code=v.get('designSpecificationCode')
        if not code:continue
        variants_out.append({'specification_code':str(code),'label':str(v.get('specificationName') or v.get('name') or v.get('color') or code)[:160],
                             'image_url':_printkk_image(v) or _printkk_image(raw)})
    return {'design_code':design_code,'name':str(raw.get('designName') or raw.get('name') or design_code)[:180],
            'category':str(raw.get('categoryName') or raw.get('productCategory') or '')[:80],
            'description':str(raw.get('description') or raw.get('productDescription') or '')[:3000],
            'image_url':_printkk_image(raw),'variants':variants_out,
            'note':'Choose an exact specification. Product descriptions and CAD retail pricing must be reviewed by GHM.'}

@router.get('/admin/orders/{public_id}/supplier-breakdown')
def admin_supplier_breakdown(public_id:str,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    """Read-only *supplier* costs after a PrintKK draft/order exists.

    These are never presented as GHM customer taxes or pre-checkout quotes.
    A missing currency/field is intentionally unknown, not guessed.
    """
    order=db.query(MerchOrder).filter_by(public_id=public_id).first()
    if not order or not order.printkk_order_id:
        raise HTTPException(404,'No supplier order exists yet. Exact PrintKK costs cannot be quoted here.')
    try:data=PrintKKClient().order_detail(order.printkk_order_id)
    except PrintKKError as exc:raise HTTPException(502,str(exc)) from exc
    info=data.get('order') if isinstance(data,dict) and isinstance(data.get('order'),dict) else data
    if not isinstance(info,dict):raise HTTPException(502,'Supplier cost response is not a recognized object.')
    def candidate(*keys):
        from decimal import Decimal,InvalidOperation
        for key in keys:
            value=info.get(key)
            if isinstance(value,(int,float,str)) and not isinstance(value,bool):
                try:
                    amount=Decimal(str(value))
                    if amount>=0 and amount.is_finite():return str(amount)
                except (InvalidOperation,ValueError):pass
        return None
    currency=info.get('currency') or info.get('currencyCode')
    return {'supplier_order_id':order.printkk_order_id,
            'currency':str(currency).upper() if currency else None,
            'shipping':candidate('shippingFee','shippingAmount','shippingCost'),
            'tax':candidate('taxFee','taxAmount','tax'),
            'product_cost':candidate('productAmount','productCost','productFee'),
            'supplier_total':candidate('totalPrice','totalAmount','orderAmount'),
            'note':'Read-only PrintKK supplier charges from an existing order. No currency conversion is applied, and these are not GHM customer taxes. Missing fields must be checked in PrintKK Dashboard.'}

@router.get('/admin/cancellation-requests')
def admin_cancellation_queue(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    rows=db.query(MerchOrder).filter(MerchOrder.cancellation_reason.isnot(None),
        MerchOrder.status.notin_(['canceled','refunded'])).order_by(MerchOrder.updated_at.desc()).limit(200).all()
    return [public_order(row,True) for row in rows]

@router.get('/admin/orders')
def admin_orders(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    return [public_order(o,True) for o in db.query(MerchOrder).order_by(MerchOrder.id.desc()).limit(300)]


def refund_tokens(db,o,actor=None):
    if o.tokens_reserved>0 and not o.tokens_refunded:
        _increase(db,'user',o.user_id,o.tokens_reserved)
        db.add(CreditWalletEvent(owner_type='user',owner_id=o.user_id,actor_user_id=actor,
             delta=o.tokens_reserved,event_type='merch_refund',transfer_key=o.public_id,
             amount_cents=o.tokens_reserved*100))
        o.tokens_refunded=True
        event(db,o,'tokens_refunded',f'{o.tokens_reserved} GHM Tokens restored.',actor=actor)


def verify_paid_session(db,session, event_id=None):
    """Called ONLY after Stripe signature verification and matching amount/currency."""
    md=session.get('metadata') or {}
    if md.get('kind')!='ghm_merch' or session.get('payment_status')!='paid':return False
    try:order_id=int(md['order_id'])
    except (KeyError,ValueError,TypeError):return False
    o=db.get(MerchOrder,order_id)
    if not o or o.stripe_due_cents<=0:return False
    if md.get('public_id')!=o.public_id or md.get('user_id')!=str(o.user_id):return False
    if str(session.get('id')) != str(o.stripe_session_id):
        # Stripe webhook can beat our DB commit: retry rather than silently accept
        # a payment bound to an uncommitted/unrecognized session.
        raise RuntimeError('Session ID mismatch or not yet persisted; retry webhook.')
    if str(session.get('currency','')).lower()!='cad' or int(session.get('amount_total') or -1)!=o.stripe_due_cents:
        logger.error('Merch checkout totals mismatch for order %s',o.public_id)
        raise RuntimeError('Stripe totals mismatch; manual review required.')
    if not o.payment_verified_at:
        o.payment_verified_at=datetime.now(timezone.utc)
        o.stripe_payment_intent_id=str(session.get('payment_intent') or '') or None
        if o.status in ('awaiting_payment','checkout_attention'):
            o.status='cancel_requested' if o.cancellation_reason else 'paid'
        event(db,o,'payment_verified',f'Checkout {session.get("id")}',key=event_id)
        db.commit()
    return True


def expire_checkout(db,session,event_id=None):
    md=session.get('metadata') or {}
    if md.get('kind')!='ghm_merch':return
    try:o=db.get(MerchOrder,int(md['order_id']))
    except (TypeError,ValueError,KeyError):return
    if not o or o.stripe_session_id!=session.get('id') or o.payment_verified_at:return
    if o.status not in ('awaiting_payment','checkout_attention'):return
    refund_tokens(db,o)
    o.status='canceled';event(db,o,'checkout_expired',key=event_id)
    db.commit()

from app.integrations.printkk import PrintKKClient, PrintKKError

def paid_ready(o):
    return bool(o.payment_verified_at and o.status in ('paid','fulfillment_review'))

@router.post('/admin/orders/{public_id}/submit')
def admin_submit(public_id:str,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Not found.')
    if not paid_ready(o):raise HTTPException(409,'Order is not fully paid or is canceled.')
    if o.provider_stage!='not_submitted' or o.printkk_order_id:
        raise HTTPException(409,'PrintKK submission previously attempted. Reconcile it rather than retry.')
    if not settings.printkk_api_key:raise HTTPException(503,'PrintKK API key is missing.')
    # Persist attempt marker BEFORE calling external API. Never auto-resubmit an
    # unknown outcome; operator must reconcile the supplier dashboard first.
    o.provider_stage='submission_uncertain';o.provider_attempted_at=datetime.now(timezone.utc)
    event(db,o,'supplier_submission_started',actor=user.id)
    db.commit()
    try:
        data=PrintKKClient().create_order(o)
        result=data.get('order') if isinstance(data.get('order'),dict) else data
        supplier_id=result.get('orderId') or result.get('id')
        if not supplier_id:raise PrintKKError('PrintKK response had no order ID; reconcile manually.')
        o.printkk_order_id=str(supplier_id)
        o.provider_stage='draft_unpaid';o.provider_status='pendingPayment'
        o.provider_response_json=json.dumps(data)[:5000]
        o.status='supplier_unpaid'
        event(db,o,'supplier_draft_created',f'PrintKK ID {supplier_id}',actor=user.id)
        db.commit()
    except PrintKKError as exc:
        o.provider_response_json=json.dumps({'issue':str(exc)})
        event(db,o,'supplier_submission_uncertain',str(exc),actor=user.id)
        db.commit()
        raise HTTPException(502,str(exc)) from exc
    return public_order(o,True)

@router.post('/admin/orders/{public_id}/pay-supplier')
def admin_pay_supplier(public_id:str,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Order not found.')
    if not paid_ready(o) and o.status!='supplier_unpaid':raise HTTPException(409,'Customer payment is not verified.')
    if o.provider_stage!='draft_unpaid' or not o.printkk_order_id:
        raise HTTPException(409,'No unpaid supplier draft. Reconcile before trying again.')
    o.provider_stage='supplier_payment_uncertain';event(db,o,'supplier_payment_started',actor=user.id);db.commit()
    try:
        data=PrintKKClient().pay(o.printkk_order_id)
        o.provider_stage='paid';o.provider_status='waitingForFulfillment';o.status='submitted'
        o.provider_response_json=json.dumps(data)[:5000]
        event(db,o,'supplier_paid',actor=user.id)
        db.commit()
    except PrintKKError as exc:
        event(db,o,'supplier_payment_uncertain',str(exc),actor=user.id);db.commit()
        raise HTTPException(502,str(exc)) from exc
    return public_order(o,True)

@router.post('/admin/orders/{public_id}/sync')
def admin_sync(public_id:str,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).first()
    if not o or not o.printkk_order_id:raise HTTPException(404,'No PrintKK order ID recorded.')
    try:
        data=PrintKKClient().order_detail(o.printkk_order_id)
    except PrintKKError as exc:raise HTTPException(502,str(exc)) from exc
    info=data.get('order') if isinstance(data.get('order'),dict) else data
    state=str(info.get('orderStatus') or info.get('status') or '')[:70]
    o.provider_status=state or o.provider_status
    if state in ('waitingForFulfillment','beingFulfilled','partiallyShipped','shipped','completed'):
        o.provider_stage='paid'
        if o.status not in ('cancel_requested','refund_pending','refunded'):
            o.status={'shipped':'shipped','completed':'completed'}.get(state,'processing')
    if state in ('canceled','closed'):
        o.provider_stage='supplier_canceled'
    # Courier records differ by supplier product; store explicit validated fields.
    o.tracking_number=str(info.get('trackingNumber') or o.tracking_number or '') or None
    o.carrier=str(info.get('carrier') or info.get('logisticsCompany') or o.carrier or '') or None
    url=str(info.get('trackingUrl') or o.tracking_url or '')
    if url.startswith('https://') or not url:o.tracking_url=url or None
    event(db,o,'supplier_status_synced',state,actor=user.id)
    db.commit()
    return public_order(o,True)

@router.post('/admin/orders/{public_id}/reconcile')
def admin_reconcile(public_id:str, supplier_order_id:str, db:Session=Depends(get_db),user:User=Depends(require_admin)):
    """Link a supplier order found manually after a timeout, never resend POST."""
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Order not found.')
    if o.printkk_order_id or o.provider_stage!='submission_uncertain':raise HTTPException(409,'Order is not awaiting supplier reconciliation.')
    if not supplier_order_id.isdecimal():raise HTTPException(400,'Invalid PrintKK order ID.')
    try:data=PrintKKClient().order_detail(supplier_order_id)
    except PrintKKError as exc:raise HTTPException(502,str(exc)) from exc
    # Operator must visually verify that supplier order items and ship-to match.
    o.printkk_order_id=supplier_order_id;o.provider_stage='draft_unpaid'
    o.provider_response_json=json.dumps(data)[:5000];o.status='supplier_unpaid'
    event(db,o,'supplier_order_reconciled',f'Admin linked {supplier_order_id}',actor=user.id)
    db.commit();return public_order(o,True)

@router.post('/admin/orders/{public_id}/cancel-and-refund')
def admin_cancel_and_refund(public_id:str,body:AdminAction,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Order not found.')
    if o.status=='refunded':return public_order(o,True)
    if o.status=='checkout_attention' and not o.stripe_session_id:
        raise HTTPException(409,'Stripe checkout outcome must be reconciled before releasing reserved tokens.')
    if o.stripe_refund_id and o.status=='refund_pending':
        stripe.api_key=settings.stripe_secret_key
        try:
            result=stripe.Refund.retrieve(o.stripe_refund_id)
            if str(result.get('status'))=='succeeded':
                refund_tokens(db,o,actor=user.id)
                o.status='refunded'
                event(db,o,'card_refund_succeeded',str(result.id),actor=user.id)
                db.commit()
        except Exception:
            raise HTTPException(503,'Refund needs reconciliation in Stripe before another action.')
        return public_order(o,True)
    if not o.payment_verified_at and o.stripe_session_id:
        stripe.api_key=settings.stripe_secret_key
        try:
            session=stripe.checkout.Session.expire(o.stripe_session_id)
            if session.get('status')=='expired':
                expire_checkout(db,session)
                return public_order(o,True)
        except Exception:
            raise HTTPException(409,'Unable to safely expire Stripe checkout. Verify payment state first.')
        raise HTTPException(409,'Stripe checkout was not confirmed expired. Check for a paid charge.')
    if o.provider_stage in ('submission_uncertain','supplier_payment_uncertain'):
        raise HTTPException(409,'Supplier outcome uncertain; reconcile before refund.')
    if o.printkk_order_id and o.provider_stage!='supplier_canceled':
        raise HTTPException(409,'Verify supplier cancellation first. Paid PrintKK orders may be non-cancelable.')
    if o.stripe_due_cents>0 and o.payment_verified_at and not o.stripe_payment_intent_id:
        raise HTTPException(409,'Missing verified Stripe payment intent; reconcile payment before refund.')
    if o.stripe_due_cents and o.payment_verified_at and not o.stripe_refund_id:
        stripe.api_key=settings.stripe_secret_key
        try:
            refund=stripe.Refund.create(payment_intent=o.stripe_payment_intent_id,
                reason='requested_by_customer',metadata={'ghm_merch_order':o.public_id},
                idempotency_key='ghm-merch-refund-'+o.public_id)
        except Exception as exc:
            raise HTTPException(503,'Stripe refund result uncertain; verify Stripe Dashboard before retrying.') from exc
        o.stripe_refund_id=refund.id
        o.status='refund_pending'
        event(db,o,'card_refund_initiated',str(refund.id),actor=user.id)
        if refund.get('status')=='succeeded':
            refund_tokens(db,o,actor=user.id)
            o.status='refunded'
            event(db,o,'card_refund_succeeded',str(refund.id),actor=user.id)
        db.commit()
        # When pending, a signed Stripe refund webhook must confirm completion.
        return public_order(o,True)
    refund_tokens(db,o,actor=user.id)
    o.status='refunded' if o.payment_verified_at else 'canceled'
    event(db,o,'order_refunded',body.reason,actor=user.id)
    db.commit();return public_order(o,True)


def confirm_refund(db,refund,event_id=None):
    """Signed refund.updated/refund.created callback; tokens released on success."""
    if refund.get('status')!='succeeded':return False
    order_ref=str((refund.get('metadata') or {}).get('ghm_merch_order') or '')
    if not order_ref:return False
    o=db.query(MerchOrder).filter_by(public_id=order_ref).first()
    if not o or o.stripe_refund_id != refund.get('id'):return False
    if o.status!='refunded':
        refund_tokens(db,o);o.status='refunded';event(db,o,'card_refund_succeeded',str(refund.get('id')),key=event_id);db.commit()
    return True

@router.post('/admin/orders/{public_id}/cancel-supplier')
def admin_cancel_supplier(public_id:str,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o or not o.printkk_order_id:raise HTTPException(404,'No PrintKK order for this reference.')
    if o.provider_stage!='draft_unpaid':
        raise HTTPException(409,'Only pending-payment PrintKK drafts can be canceled automatically. Contact supplier support for paid orders.')
    o.provider_stage='supplier_cancel_uncertain'
    event(db,o,'supplier_cancel_started',actor=user.id)
    db.commit()
    try:
        data=PrintKKClient().cancel(o.printkk_order_id)
        o.provider_response_json=json.dumps(data)[:5000]
        o.provider_stage='supplier_canceled'
        o.provider_status='canceled'
        event(db,o,'supplier_canceled',actor=user.id)
        db.commit()
    except PrintKKError as exc:
        event(db,o,'supplier_cancel_uncertain',str(exc),actor=user.id)
        db.commit()
        raise HTTPException(502,str(exc)) from exc
    return public_order(o,True)

class ReconcileStripeRequest(BaseModel):
    session_id: str = Field(min_length=8,max_length=255,pattern=r'^cs_[A-Za-z0-9_]+$')

@router.post('/admin/orders/{public_id}/reconcile-stripe')
def reconcile_stripe_checkout(public_id:str,body:ReconcileStripeRequest,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    """Recover Stripe session result after an uncertain create response.

    Never declare payment success based on admin input alone: retrieve Stripe's
    signed account API object, validate metadata, amount, order and currency.
    """
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Order not found.')
    if o.stripe_session_id and o.stripe_session_id!=body.session_id:
        raise HTTPException(409,'Different session already attached.')
    stripe.api_key=settings.stripe_secret_key
    try:session=stripe.checkout.Session.retrieve(body.session_id)
    except Exception:raise HTTPException(503,'Unable to verify this session through Stripe.')
    md=session.get('metadata') or {}
    if (md.get('kind')!='ghm_merch' or md.get('public_id')!=o.public_id or
        md.get('user_id')!=str(o.user_id) or md.get('order_id')!=str(o.id) or
        str(session.get('currency','')).lower()!='cad' or
        int(session.get('amount_total') or -1)!=o.stripe_due_cents):
        raise HTTPException(409,'Stripe session does not match the order and payment amount.')
    o.stripe_session_id=body.session_id
    o.stripe_checkout_url=session.get('url') or o.stripe_checkout_url
    event(db,o,'stripe_session_reconciled',body.session_id,actor=user.id)
    db.commit()
    if session.get('payment_status')=='paid':verify_paid_session(db,session)
    elif session.get('status')=='expired':expire_checkout(db,session)
    elif o.status=='checkout_attention':
        o.status='awaiting_payment';db.commit()
    return public_order(o,True)

class TrackingPatch(BaseModel):
    carrier: str = Field(min_length=2,max_length=120)
    tracking_number: str = Field(min_length=4,max_length=200)
    tracking_url: str | None = Field(default=None,max_length=500)

@router.put('/admin/orders/{public_id}/tracking')
def admin_tracking(public_id:str,body:TrackingPatch,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    o=db.query(MerchOrder).filter_by(public_id=public_id).first()
    if not o:raise HTTPException(404,'Order not found.')
    if o.provider_stage!='paid' or not o.printkk_order_id:
        raise HTTPException(409,'Cannot assign shipment tracking before confirmed supplier payment.')
    if body.tracking_url and not body.tracking_url.startswith('https://'):
        raise HTTPException(400,'Tracking URL must use HTTPS.')
    o.carrier=body.carrier;o.tracking_number=body.tracking_number;o.tracking_url=body.tracking_url
    o.status='shipped'
    event(db,o,'tracking_updated',body.carrier+' '+body.tracking_number,actor=user.id)
    db.commit()
    return public_order(o,True)

class CancelEvidence(BaseModel):
    reference: str = Field(min_length=20,max_length=400)

@router.post('/admin/orders/{public_id}/verify-supplier-canceled')
def admin_supplier_cancel_evidence(public_id:str,body:CancelEvidence,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    """Required only if PrintKK support cancels a paid order outside the API.

    Human verification must include supplier support confirmation reference. This
    authorizes later refund, not an immediate payout to the customer.
    """
    o=db.query(MerchOrder).filter_by(public_id=public_id).with_for_update().first()
    if not o:raise HTTPException(404,'Order not found.')
    if not o.printkk_order_id or o.provider_stage=='supplier_canceled':
        raise HTTPException(409,'Nothing to verify or already canceled.')
    if o.provider_stage in ('submission_uncertain','supplier_payment_uncertain'):
        raise HTTPException(409,'Reconcile the external charge and order before proceeding.')
    o.provider_stage='supplier_canceled'
    o.provider_status='canceled'
    o.support_note=body.reference
    event(db,o,'supplier_cancel_confirmed_by_admin',body.reference,actor=user.id)
    db.commit()
    return public_order(o,True)
