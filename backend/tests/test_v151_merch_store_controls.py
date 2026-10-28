"""Public storefront controls and safe automatic PrintKK draft regression tests."""
from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException
from app.db.session import Base
from app.models import User, MerchOrder, MerchStoreControls
from app.api import merch_orders as shop
from app.services import merch_auto_fulfillment as auto


def memory_db():
    engine=create_engine('sqlite:///:memory:', connect_args={'check_same_thread':False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def mock_readiness(monkeypatch):
    for attr,val in [('merch_checkout_enabled',True),('merch_tax_enabled',True),
                     ('stripe_secret_key','sk_test_dummy'),('stripe_webhook_secret','whsec_dummy'),
                     ('printkk_api_key','printkk_dummy'),('merch_shipping_cents_cad',999)]:
        monkeypatch.setattr(shop.settings,attr,val)


def test_public_mode_requires_admin_confirmation_and_persists(monkeypatch):
    mock_readiness(monkeypatch)
    monkeypatch.setattr(shop.settings,'merch_pilot_email','pilot@example.org')
    Session=memory_db()
    with Session() as db:
        tester=User(email='pilot@example.org'); another=User(email='new@example.org')
        db.add_all([tester,another]);db.commit()
        assert shop.checkout_access(another,db)['checkout_available'] is False
        assert shop.checkout_access(tester,db)['checkout_available'] is True
        body=shop.StoreControlsUpdate(checkout_audience='public',pilot_email='pilot@example.org',fulfillment_mode='manual')
        try:
            shop.admin_update_store_controls(body,db,tester)
        except HTTPException as exc:
            assert exc.status_code==400
        else:raise AssertionError('Public toggle must require confirmation')
        body.confirm_public_checkout=True
        shop.admin_update_store_controls(body,db,tester)
        assert shop.checkout_access(another,db)['checkout_available'] is True
        assert db.get(MerchStoreControls,1).checkout_audience == 'public'
        body.checkout_audience='paused'
        shop.admin_update_store_controls(body,db,tester)
        assert shop.checkout_access(another,db)['checkout_available'] is False
        assert shop.checkout_access(tester,db)['checkout_available'] is False


def test_automatic_drafts_created_once_and_never_auto_pay(monkeypatch):
    mock_readiness(monkeypatch)
    monkeypatch.setattr(shop.settings,'merch_auto_fulfillment_allowed',True)
    Session=memory_db()
    fake_calls=[]
    class FakeSupplier:
        def create_order(self,o):
            fake_calls.append(o.public_id)
            return {'order':{'orderId':1234}}
        def pay(self,*args):
            raise AssertionError('Supplier payment must never occur in automatic draft mode')
    monkeypatch.setattr(auto,'PrintKKClient',FakeSupplier)
    monkeypatch.setattr(auto,'SessionLocal',Session)
    with Session() as db:
        user=User(email='buyer@example.org');db.add(user);db.flush()
        db.add(MerchStoreControls(id=1,checkout_audience='public',pilot_email='',fulfillment_mode='automatic'))
        db.add(MerchOrder(public_id='GHM-AUTO-TEST',user_id=user.id,client_key='auto',cart_hash='a'*64,
            status='paid',customer_name='Buyer',customer_email=user.email,
            shipping_address_json='{}',items_json='[]',subtotal_cents=1000,shipping_cents=0,
            tax_cents=0,total_cents=1000,tokens_reserved=0,stripe_due_cents=1000,
            payment_verified_at=datetime.now(timezone.utc)))
        db.commit()
    assert auto.process_batch()==1
    assert auto.process_batch()==0
    assert fake_calls==['GHM-AUTO-TEST']
    with Session() as db:
        o=db.query(MerchOrder).one()
        assert o.status=='supplier_unpaid' and o.provider_stage=='draft_unpaid'
        assert o.printkk_order_id=='1234'


def test_public_preference_persists_while_checkout_is_unconfigured(monkeypatch):
    mock_readiness(monkeypatch)
    # This was the v151 regression: an administrator could not save Public
    # while their backend .env was still configured for a private pilot.
    monkeypatch.setattr(shop.settings, 'merch_checkout_enabled', False)
    monkeypatch.setattr(shop.settings, 'merch_tax_enabled', False)
    monkeypatch.setattr(shop.settings, 'merch_pilot_email', 'pilot@example.org')
    Session = memory_db()
    with Session() as db:
        admin = User(email='pilot@example.org')
        buyer = User(email='customer@example.org')
        db.add_all([admin, buyer]); db.commit()
        body = shop.StoreControlsUpdate(checkout_audience='public',
              fulfillment_mode='manual', confirm_public_checkout=True)
        result = shop.admin_update_store_controls(body, db, admin)
        assert result['checkout_audience'] == 'public'
        assert result['checkout_live'] is False
        assert 'MERCH_CHECKOUT_ENABLED=true' in result['missing_configuration']
        assert db.get(MerchStoreControls, 1).checkout_audience == 'public'
        assert shop.checkout_access(buyer, db)['checkout_available'] is False
        assert shop.admin_merch_readiness(db, admin)['checkout_audience'] == 'public'
        assert shop.admin_merch_readiness(db, admin)['checkout_live'] is False
        with pytest.raises(HTTPException) as blocked:
            shop.require_ready(buyer, db)
        assert blocked.value.status_code == 503
        # Once backend readiness is restored, the saved public setting takes effect.
        monkeypatch.setattr(shop.settings, 'merch_checkout_enabled', True)
        monkeypatch.setattr(shop.settings, 'merch_tax_enabled', True)
        assert shop.checkout_access(buyer, db)['checkout_available'] is True


def test_automatic_preference_persists_without_worker_permission(monkeypatch):
    mock_readiness(monkeypatch)
    monkeypatch.setattr(shop.settings, 'merch_auto_fulfillment_allowed', False)
    Session = memory_db()
    with Session() as db:
        admin = User(email='admin@example.org')
        db.add(admin); db.commit()
        body = shop.StoreControlsUpdate(checkout_audience='public',
            fulfillment_mode='automatic', confirm_public_checkout=True,
            confirm_automatic_supplier_submissions=True)
        result = shop.admin_update_store_controls(body, db, admin)
        assert result['checkout_audience'] == 'public'
        assert result['fulfillment_mode'] == 'automatic'
        assert result['auto_worker_enabled'] is False
        assert db.get(MerchStoreControls, 1).fulfillment_mode == 'automatic'
        # Service layer still hard-blocks actual supplier submission.
        assert auto.process_batch() == 0
