"""V157: real routing and moderated community regression tests.

Run with the application's installed backend dependencies (and native zbar library).
"""
import os
import sys
import types
os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY', 'test-only-secret')
try:
    import stripe
except ImportError:
    sys.modules.setdefault('stripe', types.ModuleType('stripe'))
try:
    import jose
except ImportError:
    fake_deps = types.ModuleType('app.api.deps')
    fake_deps.get_current_user = lambda: None
    fake_deps.require_house_member = lambda *args: None
    sys.modules.setdefault('app.api.deps', fake_deps)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db.session import Base, get_db
from app.models import CommunityTip, House, HouseMember, HouseRole, PlanName, User
from app.api.admin import require_admin
from app.api.deps import get_current_user
from app.api import community_tips, expenses


def _test_store():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread':False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine,sessionmaker(bind=engine)


def test_community_submissions_are_private_until_approved():
    engine,Session=_test_store()
    with Session() as db:
        user=User(email='tipper@example.org',full_name='GHM Member')
        admin=User(email='admin-v157@example.org',full_name='Admin')
        db.add_all([user,admin]);db.commit()
        api=FastAPI();api.include_router(community_tips.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[get_current_user]=lambda:user
        api.dependency_overrides[require_admin]=lambda:admin
        c=TestClient(api)
        body={'kind':'restaurant','place_name':'Example Indian Kitchen','city':'Hamilton','title':'Undhiyu',
              'diet_tags':['vegetarian','swaminarayan'], 'tax_basis':'before','price_amount':14.95,
              'currency_code':'CAD','notes':'Confirm no onion and garlic with the kitchen.'}
        post=c.post('/community/tips',json=body)
        assert post.status_code==201,post.text
        id=post.json()['id']
        assert post.json()['status']=='pending'
        assert c.get('/community/tips').json()==[]
        mine=c.get('/community/tips',params={'mine':'true'}).json()
        assert len(mine)==1 and mine[0]['is_mine']
        pending=c.get('/community/tips/admin').json()
        assert len(pending)==1
        approved=c.put(f'/community/tips/admin/{id}/moderate?{ "action=approve" }')
        assert approved.status_code==200,approved.text
        public=c.get('/community/tips').json()
        assert len(public)==1 and public[0]['title']=='Undhiyu'
        assert 'email' not in public[0]
        hidden=c.put(f'/community/tips/admin/{id}/moderate?action=hide')
        assert hidden.status_code==200
        assert c.get('/community/tips').json()==[]
    engine.dispose()


def test_community_validates_data_and_limits_daily_spam():
    engine,Session=_test_store()
    with Session() as db:
        user=User(email='tipper2@example.org');db.add(user);db.commit()
        api=FastAPI();api.include_router(community_tips.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[get_current_user]=lambda:user
        c=TestClient(api)
        body={'kind':'offer','place_name':'Grocer','city':'Hamilton','title':'Bread promotion','price_amount':2.5}
        assert c.post('/community/tips',json={**body,'tax_basis':'incorrect'}).status_code==422
        assert c.post('/community/tips',json={**body,'currency_code':'XYZ'}).status_code==422
        for _ in range(5):assert c.post('/community/tips',json=body).status_code==201
        assert c.post('/community/tips',json=body).status_code==429
    engine.dispose()


def test_expenses_settings_route_is_static_not_numeric_id():
    # Request with an empty JSON body must report a missing month_mode field,
    # NOT try to parse the literal word 'settings' as expense_id.
    api=FastAPI();api.include_router(expenses.router)
    matches=[route for route in api.routes if getattr(route,'path','')=='/houses/{house_id}/expenses/settings']
    assert matches
    edit=[route for route in api.routes if getattr(route,'path','')=='/houses/{house_id}/expenses/{expense_id}' and 'PUT' in getattr(route,'methods',set())]
    assert not edit, 'Typed numeric URL converter prevents /settings from being captured'
    typed=[route for route in api.routes if getattr(route,'path','')=='/houses/{house_id}/expenses/{expense_id}'+'/'+'int']
    assert any('{expense_id:int}' in getattr(route,'path','') for route in api.routes)


def test_expenses_custom_mode_actual_http_request(monkeypatch):
    from types import SimpleNamespace
    engine,Session=_test_store()
    with Session() as db:
        user=User(email='expense-v157@example.org',full_name='Owner',plan_name=PlanName.pro)
        db.add(user);db.flush()
        home=House(name='Expense V157',created_by_id=user.id)
        db.add(home);db.flush()
        db.add(HouseMember(house_id=home.id,user_id=user.id,role=HouseRole.owner))
        db.commit()
        monkeypatch.setattr(expenses,'require_house_member',lambda *args:SimpleNamespace(role=HouseRole.owner))
        api=FastAPI();api.include_router(expenses.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[get_current_user]=lambda:user
        api.dependency_overrides[expenses.require_expense_feature]=lambda: user
        c=TestClient(api)
        response=c.put(f'/houses/{home.id}/expenses/settings',json={'month_mode':'custom'})
        assert response.status_code==200,response.text
        assert response.json()['month_mode']=='custom'
        db.refresh(home)
        assert home.expense_book_mode=='custom'
    engine.dispose()


def test_photos_are_reencoded_and_require_new_review(tmp_path, monkeypatch):
    from io import BytesIO
    from PIL import Image
    from app.core.config import settings
    monkeypatch.setattr(settings,'upload_dir',str(tmp_path))
    engine,Session=_test_store()
    with Session() as db:
        user=User(email='tip-photo-v157@example.org');db.add(user);db.commit()
        api=FastAPI();api.include_router(community_tips.router)
        api.dependency_overrides[get_db]=lambda:db
        api.dependency_overrides[get_current_user]=lambda:user
        api.dependency_overrides[require_admin]=lambda:user
        c=TestClient(api)
        response=c.post('/community/tips',json={
            'kind':'offer','place_name':'Demo Grocery','city':'Hamilton','title':'Fresh vegetables 20% off'
        })
        tip_id=response.json()['id'];assert response.status_code==201
        c.put(f'/community/tips/admin/{tip_id}/moderate?action=approve')
        img=BytesIO();Image.new('RGB',(220,150),'white').save(img,'JPEG')
        response=c.post(f'/community/tips/{tip_id}/photos',files={'file':('offer.jpg',img.getvalue(),'image/jpeg')})
        assert response.status_code==200,response.text
        assert response.json()['status']=='pending'
        images=response.json()['images'];assert len(images)==1
        assert images[0].endswith('.webp')
        disk=tmp_path / images[0].removeprefix('/uploads/')
        assert disk.exists()
        assert disk.read_bytes()[:4]==b'RIFF'
        assert c.get('/community/tips').json()==[]
        assert c.post(f'/community/tips/{tip_id}/photos',files={'file':('evil.gif',b'GIF89a','image/gif')}).status_code==400
    engine.dispose()
