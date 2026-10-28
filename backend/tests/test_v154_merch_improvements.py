"""v154: safe admin cancellation queue, read-only design import and paid PDF receipt."""
import io
import json
import sys
import types
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.db.session import Base, get_db
from app.api.admin import require_admin
from app.api import merch_orders
from app.models import User,MerchOrder


def test_cancel_queue_includes_unpaid_and_returns_unique_paid_pdf(monkeypatch):
    engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        admin=User(email='admin-v154@example.test')
        db.add(admin);db.commit();db.refresh(admin)
        order=MerchOrder(public_id='GHM-V154-CANCEL',user_id=admin.id,client_key='v154checkkey123456',cart_hash='abc',
            status='awaiting_payment',customer_name='Test Shopper',customer_email=admin.email,
            shipping_address_json=json.dumps({'name':'Test Shopper','line1':'1 Main St','city':'Hamilton','province':'ON','postal_code':'L8P 1A1'}),
            items_json=json.dumps([{'sku':'GHM-T','name':'Test tote','quantity':1,'unit_cents':2499}]),
            subtotal_cents=2499,shipping_cents=500,tax_cents=390,total_cents=3389,
            tokens_reserved=0,stripe_due_cents=3389,cancellation_reason='Please cancel before shipment')
        db.add(order);db.commit()
        api=FastAPI();api.include_router(merch_orders.router)
        api.dependency_overrides[get_db]=lambda: db
        api.dependency_overrides[require_admin]=lambda: admin
        api.dependency_overrides[merch_orders.get_current_user]=lambda: admin
        c=TestClient(api)
        q=c.get('/merch/admin/cancellation-requests')
        assert q.status_code==200,q.text
        assert q.json()[0]['id']=='GHM-V154-CANCEL'
        assert q.json()[0]['cancellation_pending'] is True
        unpaid=c.get('/merch/orders/GHM-V154-CANCEL/receipt.pdf')
        assert unpaid.status_code==409
        order.payment_verified_at=datetime.now(timezone.utc)
        db.commit()
        paid=c.get('/merch/orders/GHM-V154-CANCEL/receipt.pdf')
        assert paid.status_code==200,paid.text
        assert paid.content.startswith(b'%PDF')
        assert paid.headers['content-type']=='application/pdf'
        assert 'attachment' in paid.headers['content-disposition']


def test_printkk_design_api_reads_only_and_has_variant_selector(monkeypatch):
    from app.integrations import printkk
    class ReadOnly:
        def __init__(self,*a,**kw):pass
        def design_page(self,page,size):return {'records':[{'designCode':'ABC01','designName':'GHM Apron'}]}
        def design_detail(self,code):return {'designCode':code,'designName':'GHM Apron','designSpecifications':[
            {'designSpecificationCode':'SPEC-WHITE','specificationName':'White'},
            {'designSpecificationCode':'SPEC-BLACK','specificationName':'Black'}]}
    monkeypatch.setattr(merch_orders,'PrintKKClient',ReadOnly)
    engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        admin=User(email='admin-v154@example.test');db.add(admin);db.commit()
        api=FastAPI();api.include_router(merch_orders.router)
        api.dependency_overrides[get_db]=lambda: db
        api.dependency_overrides[require_admin]=lambda: admin
        c=TestClient(api)
        listing=c.get('/merch/admin/printkk-designs?page=1')
        assert listing.status_code==200,listing.text
        assert listing.json()['designs'][0]['design_code']=='ABC01'
        details=c.get('/merch/admin/printkk-designs/ABC01')
        assert details.status_code==200,details.text
        assert details.json()['variants'][1]['specification_code']=='SPEC-BLACK'
