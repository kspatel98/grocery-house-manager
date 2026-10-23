"""V148 isolated integration-like tests with mocked payment and provider APIs.
No live Stripe charges or PrintKK orders are attempted.
"""
import os,sys,types
os.environ.setdefault('DATABASE_URL','sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY','test-only-secret')
stripe=types.ModuleType('stripe')
sys.modules.setdefault('stripe',stripe)
try:import jose,passlib
except ModuleNotFoundError:
    deps=types.ModuleType('app.api.deps')
    deps.get_current_user=lambda:None
    deps.require_house_member=lambda *a:None
    sys.modules['app.api.deps']=deps
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException
from app.db.session import Base
from app.models import User, MerchCatalogProduct, MerchOrder, CreditWalletEvent
from app.api.credit_wallet import _increase,_balance
from app.api import merch_orders as shop

def test_merch_checkout_verified_and_idempotent(monkeypatch):
    engine=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine)
    monkeypatch.setattr(shop.settings,'merch_checkout_enabled',True)
    monkeypatch.setattr(shop.settings,'merch_tax_enabled',True)
    monkeypatch.setattr(shop.settings,'stripe_secret_key','sk_test_fake')
    monkeypatch.setattr(shop.settings,'stripe_webhook_secret','whsec_fake')
    monkeypatch.setattr(shop.settings,'printkk_api_key','printkk_test_fake')
    monkeypatch.setattr(shop.settings,'merch_shipping_cents_cad',900)
    sessions=[]
    def new_session(**kw):
        num=len(sessions)+1
        data=types.SimpleNamespace(id=f'cs_{num}',url=f'https://checkout.stripe.com/test/{num}')
        sessions.append(kw)
        return data
    stripe.tax=types.SimpleNamespace(Calculation=types.SimpleNamespace(create=lambda **kw:{'amount_total':kw['line_items'][0]['amount']+kw['shipping_cost']['amount']+350,'tax_amount_exclusive':350,'id':'tax_1'}))
    stripe.checkout=types.SimpleNamespace(Session=types.SimpleNamespace(create=new_session))
    with Session() as db:
        user=User(email='merch@example.org')
        db.add(user);db.flush()
        db.add(MerchCatalogProduct(sku='GHM-TOTE',name='GHM Tote',price_cents_cad=2499,
            printkk_design_id='DESIGN_SPEC_VARIANT_1',active=True))
        _increase(db,'user',user.id,20)
        db.commit()
        address=shop.Address(name='Demo Shopper',line1='123 Example Street',city='Hamilton',province='ON',postal_code='L8P 1A1')
        body=shop.CheckoutRequest(items=[shop.CartLine(product_id=1,quantity=1)],shipping=address,tokens=10,idempotency_key='checkout_key_1234567890')
        q=shop.quote(db,body,user.id)
        assert q['subtotal_cents']==2499 and q['tax_cents']==350 and q['card_cents']==2749
        result=shop.checkout(body,db,user)
        assert result['checkout_url']=='https://checkout.stripe.com/test/1'
        assert _balance(db,'user',user.id)==10
        assert shop.checkout(body,db,user)['reused'] is True
        assert len(sessions)==1
        session={'id':'cs_1','metadata':{'kind':'ghm_merch','order_id':'1','public_id':result['order']['id'],'user_id':str(user.id)},'payment_status':'paid','currency':'cad','amount_total':2749,'payment_intent':'pi_1'}
        assert shop.verify_paid_session(db,session,event_id='evt_1')
        assert shop.verify_paid_session(db,session,event_id='evt_1')
        assert db.query(MerchOrder).one().status=='paid'
        assert _balance(db,'user',user.id)==10
        try:
            shop.verify_paid_session(db,{**session,'amount_total':99},event_id='evt_wrong')
        except RuntimeError:pass
        else:raise AssertionError('Must not accept mismatched Stripe totals')
        assert db.query(CreditWalletEvent).filter_by(event_type='merch_escrow').count()==1

def test_merch_expired_restores_tokens_once(monkeypatch):
    engine=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine)
    with Session() as db:
        user=User(email='cancel@example.org');db.add(user);db.flush()
        _increase(db,'user',user.id,10)
        assert shop._decrease(db,'user',user.id,5)
        o=MerchOrder(public_id='GHM-TEST2',user_id=user.id,client_key='key',cart_hash='f'*64,
            status='awaiting_payment',customer_name='Test',customer_email=user.email,
            shipping_address_json='{}',items_json='[]',subtotal_cents=1500,shipping_cents=0,
            tax_cents=0,total_cents=1500,tokens_reserved=5,stripe_due_cents=1000,
            stripe_session_id='cs_expired')
        db.add(o);db.commit()
        sess={'id':'cs_expired','metadata':{'kind':'ghm_merch','order_id':str(o.id)}}
        shop.expire_checkout(db,sess,'evt_expired')
        shop.expire_checkout(db,sess,'evt_expired')
        assert db.get(MerchOrder,o.id).status=='canceled'
        assert _balance(db,'user',user.id)==10
        assert db.query(CreditWalletEvent).filter_by(event_type='merch_refund').count()==1

def test_supplier_submission_retries_blocked(monkeypatch):
    engine=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine)
    monkeypatch.setattr(shop.settings,'printkk_api_key','test_key')
    calls=[]
    class FakeSupplier:
        def create_order(self,order):
            calls.append(order.public_id)
            return {'orderId':'9001'}
        def pay(self,order_id):return {'orderId':order_id,'paid':True}
        def order_detail(self,order_id):return {'orderId':order_id,'status':'shipped','trackingNumber':'ABC123456','trackingUrl':'https://carrier.example/ABC123456'}
    monkeypatch.setattr(shop,'PrintKKClient',FakeSupplier)
    with Session() as db:
        user=User(email='supplier@example.org');db.add(user);db.flush()
        o=MerchOrder(public_id='GHM-SUPPLIER',user_id=user.id,client_key='supplier_key',cart_hash='f'*64,
            status='paid',customer_name='Supplier Test',customer_email=user.email,
            shipping_address_json='{"name":"Supplier Test"}',items_json='[]',subtotal_cents=1000,
            shipping_cents=0,tax_cents=0,total_cents=1000,tokens_reserved=0,stripe_due_cents=0,
            payment_verified_at=shop.datetime.now(shop.timezone.utc))
        db.add(o);db.commit()
        result=shop.admin_submit(o.public_id,db,user)
        assert result['provider_stage']=='draft_unpaid' and len(calls)==1
        try:shop.admin_submit(o.public_id,db,user)
        except HTTPException as e:assert e.status_code==409
        else:raise AssertionError('Duplicate PrintKK order submission accepted')
        assert shop.admin_pay_supplier(o.public_id,db,user)['provider_stage']=='paid'
        assert shop.admin_sync(o.public_id,db,user)['tracking_number']=='ABC123456'
        assert len(calls)==1

def test_token_only_refund_idempotent():
    engine=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine)
    with Session() as db:
        user=User(email='token-refund@example.org');db.add(user);db.flush()
        o=MerchOrder(public_id='GHM-TOKENREFUND',user_id=user.id,client_key='tokenrefundkey',cart_hash='f'*64,
            status='paid',customer_name='Test Refund',customer_email=user.email,
            shipping_address_json='{}',items_json='[]',subtotal_cents=500,shipping_cents=0,
            tax_cents=0,total_cents=500,tokens_reserved=5,stripe_due_cents=0,
            payment_verified_at=shop.datetime.now(shop.timezone.utc))
        db.add(o);db.commit()
        result=shop.admin_cancel_and_refund(o.public_id,shop.AdminAction(reason='No PrintKK order placed'),db,user)
        assert result['status']=='refunded' and _balance(db,'user',user.id)==5
        again=shop.admin_cancel_and_refund(o.public_id,shop.AdminAction(),db,user)
        assert again['status']=='refunded' and _balance(db,'user',user.id)==5

def test_merch_product_address_rejection():
    try:shop.Address(name='Test User',line1='Some Road',city='Hamilton',province='ON',postal_code='not valid')
    except Exception:pass
    else:raise AssertionError('Invalid postal code accepted')

if __name__=='__main__':
 from pytest import MonkeyPatch
 mp=MonkeyPatch();test_merch_checkout_verified_and_idempotent(mp);mp.undo();mp=MonkeyPatch();test_merch_expired_restores_tokens_once(mp);mp.undo();mp=MonkeyPatch();test_supplier_submission_retries_blocked(mp);mp.undo();test_token_only_refund_idempotent();test_merch_product_address_rejection();print('V148 merch tests passed')
