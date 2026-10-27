"""Owner-only live checkout gate and private order timeline, without network calls."""
import os, sys, types
os.environ.setdefault('DATABASE_URL','sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY','test-only-secret')
sys.modules.setdefault('stripe', types.ModuleType('stripe'))
try:
    import jose, passlib
except ModuleNotFoundError:
    deps=types.ModuleType('app.api.deps')
    deps.get_current_user=lambda:None
    deps.require_house_member=lambda *a:None
    sys.modules['app.api.deps']=deps
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import Base
from app.models import User, MerchOrder, MerchOrderEvent
from app.api import merch_orders


def test_owner_only_pilot_gate(monkeypatch):
    for attr,val in [('merch_checkout_enabled',True),('merch_tax_enabled',True),
                     ('stripe_secret_key','sk_test'),('stripe_webhook_secret','whsec_test'),
                     ('printkk_api_key','test_key'),('merch_shipping_cents_cad',999),
                     ('merch_pilot_email','pilot@example.org')]:
        monkeypatch.setattr(merch_orders.settings,attr,val)
    approved=User(email='Pilot@Example.org'); other=User(email='someone@example.org')
    assert merch_orders.checkout_access(approved)['checkout_available'] is True
    assert merch_orders.checkout_access(approved)['pilot_mode'] is True
    assert merch_orders.checkout_access(other)['checkout_available'] is False
    merch_orders.require_ready(approved)
    with pytest.raises(HTTPException) as err:merch_orders.require_ready(other)
    assert err.value.status_code==403
    with pytest.raises(HTTPException) as err:merch_orders.require_ready()
    assert err.value.status_code==403


def test_timeline_is_order_owner_scoped_and_public_safe():
    engine=create_engine('sqlite:///:memory:');Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine)
    with Session() as db:
        owner=User(email='owner@example.org');other=User(email='other@example.org')
        db.add_all([owner,other]);db.flush()
        order=MerchOrder(public_id='GHM-ORDER-ONE',user_id=owner.id,client_key='pilot_key',cart_hash='f'*64,
            status='paid',customer_name='Pilot Owner',customer_email=owner.email,
            shipping_address_json='{}',items_json='[]',subtotal_cents=1000,
            shipping_cents=0,tax_cents=0,total_cents=1000,tokens_reserved=0,stripe_due_cents=1000)
        db.add(order);db.flush()
        db.add_all([MerchOrderEvent(order_id=order.id,kind='created',detail='PRIVATE DETAILS'),
                    MerchOrderEvent(order_id=order.id,kind='payment_verified',detail='PRIVATE STRIPE ID'),
                    MerchOrderEvent(order_id=order.id,kind='supplier_submission_uncertain',detail='SECRET SUPPLIER DEBUG')])
        db.commit()
        result=merch_orders.order_timeline(order.public_id,db,owner)
        assert [e['label'] for e in result]==['Order created','Payment confirmed']
        assert all('PRIVATE' not in str(e) and 'SECRET' not in str(e) for e in result)
        with pytest.raises(HTTPException) as err:merch_orders.order_timeline(order.public_id,db,other)
        assert err.value.status_code==404
