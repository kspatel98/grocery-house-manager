"""v155: safe unconfirmed-checkout lifecycle and product gallery regression."""
import json
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from app.db.session import Base,get_db
from app.api.deps import get_current_user
from app.api.admin import require_admin
from app.api import merch_orders,merch_festivals
from app.models import User, MerchCatalogProduct, MerchOrder

def test_gallery_api_and_no_schema_migration_required():
    engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        admin=User(email='admin-v155@example.test');db.add(admin);db.commit()
        api=FastAPI();api.include_router(merch_festivals.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[require_admin]=lambda:admin
        c=TestClient(api)
        body={'sku':'GHM-155','name':'GHM Apron','category':'Kitchen','description':'Test',
              'image_url':'https://example.com/front.jpg','image_urls':['https://example.com/front.jpg','https://example.com/back.jpg'],
              'price_cents_cad':3299,'printkk_design_id':'ABC-1','active':True,'priority':10}
        r=c.post('/merch/admin',json=body);assert r.status_code==200,r.text
        assert r.json()['image_urls']==body['image_urls']
        assert c.get('/merch').json()['products'][0]['image_urls']==body['image_urls']
        body['image_urls']=['https://example.com/front.jpg','https://example.com/side.jpg']
        r=c.put(f"/merch/admin/{r.json()['id']}",json=body);assert r.status_code==200,r.text
        assert r.json()['image_urls']==body['image_urls']

def test_customer_cancels_only_verified_unpaid_checkout(monkeypatch):
    engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        user=User(email='buyer-v155@example.test');db.add(user);db.flush()
        o=MerchOrder(public_id='GHM-155-TEST',user_id=user.id,client_key='key-155',cart_hash='x'*64,
            status='awaiting_payment',customer_name='Buyer',customer_email=user.email,
            shipping_address_json='{}',items_json='[]',subtotal_cents=1999,shipping_cents=500,tax_cents=200,total_cents=2699,
            tokens_reserved=0,stripe_due_cents=2699,stripe_session_id='cs_test_v155')
        db.add(o);db.commit()
        api=FastAPI();api.include_router(merch_orders.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[get_current_user]=lambda:user
        c=TestClient(api)
        monkeypatch.setattr(merch_orders.stripe,'checkout',SimpleNamespace(Session=SimpleNamespace(
            retrieve=lambda key:{'id':key,'status':'open','payment_status':'unpaid'},
            expire=lambda key:{'id':key,'status':'expired','payment_status':'unpaid'})),raising=False)
        assert c.post('/merch/orders/GHM-155-TEST/cancel-request',json={'reason':'No payment'}).status_code==409
        r=c.post('/merch/orders/GHM-155-TEST/cancel-unpaid');assert r.status_code==200,r.text
        assert r.json()['status']=='canceled'
        assert db.get(MerchOrder,o.id).status=='canceled'

def test_printkk_readonly_errors_are_actionable(monkeypatch):
    import requests
    from app.integrations.printkk import PrintKKClient,PrintKKError
    from app.core.config import settings
    monkeypatch.setattr(settings,'printkk_api_key','test-key',raising=False)
    def bad_request(*args,**kwargs):
        res=requests.Response();res.status_code=403;res.url='https://api.printkk.com/pkk-openapi/api/v1/design/page'
        raise requests.HTTPError(response=res)
    monkeypatch.setattr(requests,'request',bad_request)
    try:PrintKKClient().design_page()
    except PrintKKError as e:assert 'HTTP 403' in str(e)
    else:raise AssertionError('HTTP error should be descriptive')

def test_design_images_normalize_multiple_mockups():
    d={'designCode':'DEMO','designName':'Tote','mockupUrl':'https://example.com/front.jpg',
       'mockups':[{'imageUrl':'https://example.com/side.jpg'},'https://example.com/back.jpg']}
    result=merch_orders._printkk_design_rows({'records':[d]})[0]
    assert len(result['image_urls'])==3
    assert result['image_url']=='https://example.com/front.jpg'

def test_barcode_photo_reads_real_ean13_bars_without_guessing():
    import asyncio
    import io
    from pathlib import Path
    from fastapi import UploadFile
    from starlette.datastructures import Headers
    from app.api.market import barcode_photo
    sample=(Path(__file__).parent/'fixtures'/'ean13_sample.png').read_bytes()
    upload=UploadFile(file=io.BytesIO(sample),filename='ean13.png',headers=Headers({'content-type':'image/png'}))
    result=asyncio.run(barcode_photo(file=upload,_=User(email='barcode-v155@example.test')))
    assert result['barcode']=='5901234123457'
    assert result['method']=='optical-barcode-decoder'
