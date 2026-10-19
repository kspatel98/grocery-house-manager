"""Focused isolated regressions; run with pytest and valid test Settings env."""
import pytest
import sys, types
try:
    import stripe
except ImportError:
    sys.modules["stripe"] = types.ModuleType("stripe")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import Base
from app.models import User, House, HouseMember, HouseRole, PlanName, OwnerProviderBudget, HouseCreditEvent, HouseCreditBalance
try:
    import jose
except ImportError:
    stub = types.ModuleType('app.api.deps')
    def get_current_user(): pass
    def require_house_member(*args, **kwargs): pass
    stub.get_current_user = get_current_user
    stub.require_house_member = require_house_member
    sys.modules['app.api.deps'] = stub
from app.api.house_credits import grant_completed_checkout
from app.utils.house_credits import spend, balance

@pytest.fixture
def db_session(tmp_path):
    engine=create_engine(f'sqlite:///{tmp_path}/budget.db')
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine,autoflush=False)
    with Session() as db:
        yield db,Session
    engine.dispose()

def test_verified_credit_grant_once_and_atomic_spend(db_session):
    db,_=db_session
    u=User(email='owner@example.org',full_name='Owner',plan_name=PlanName.pro)
    db.add(u);db.flush()
    h=House(name='House 1',created_by_id=u.id);db.add(h);db.flush()
    db.add(HouseMember(house_id=h.id,user_id=u.id,role=HouseRole.owner));db.commit()
    sid='cs_test_same_payment'
    session={'id':sid,'payment_status':'paid','amount_total':200,'metadata':{'kind':'house_credit_pack','user_id':str(u.id),'house_id':str(h.id),'pack_key':'receipt_4','feature_key':'receipt_scan','units':'4'}}
    grant_completed_checkout(db,session)
    grant_completed_checkout(db,session)
    assert balance(db,h.id,'receipt_scan')==4
    assert db.query(HouseCreditEvent).filter_by(stripe_session_id=sid).count()==1
    assert spend(db,h.id,u.id,'receipt_scan')
    db.commit()
    assert balance(db,h.id,'receipt_scan')==3

def test_provider_limits_shared_by_owner_across_houses(db_session,monkeypatch):
    db,Session=db_session
    from app.utils import provider_budget
    from app.core.config import settings
    monkeypatch.setattr(provider_budget,'SessionLocal',Session)
    monkeypatch.setattr(settings,'trip_provider_daily_limit',10)
    monkeypatch.setattr(settings,'trip_provider_monthly_limit',30)
    owner=User(email='owner2@example.org',full_name='Owner',plan_name=PlanName.pro)
    db.add(owner);db.flush()
    h1=House(name='House A',created_by_id=owner.id)
    h2=House(name='House B',created_by_id=owner.id)
    db.add_all([h1,h2]);db.flush()
    db.add_all([HouseMember(house_id=h1.id,user_id=owner.id,role=HouseRole.owner),HouseMember(house_id=h2.id,user_id=owner.id,role=HouseRole.owner)]);db.commit()
    for i in range(10):assert provider_budget.consume_house_provider_run(h1.id if i%2==0 else h2.id,actor_id=owner.id)
    assert not provider_budget.consume_house_provider_run(h2.id,actor_id=owner.id)
    db.expire_all()
    assert db.query(OwnerProviderBudget).filter(OwnerProviderBudget.owner_id==owner.id,OwnerProviderBudget.period_key.like('day:%')).one().count==10


def test_owner_control_prevents_member_spending(db_session):
    db,_=db_session
    from app.models import HouseCreditPolicy
    a=User(email='a@example.org',full_name='A',plan_name=PlanName.pro)
    b=User(email='b@example.org',full_name='B',plan_name=PlanName.free)
    db.add_all([a,b]);db.flush()
    h=House(name='Shared',created_by_id=a.id);db.add(h);db.flush()
    db.add_all([HouseMember(house_id=h.id,user_id=a.id,role=HouseRole.owner),HouseMember(house_id=h.id,user_id=b.id,role=HouseRole.member)])
    db.add(HouseCreditBalance(house_id=h.id,feature_key='grocery_scan',balance=2))
    db.add(HouseCreditPolicy(house_id=h.id,members_can_spend=False));db.commit()
    assert not spend(db,h.id,b.id,'grocery_scan')
    assert balance(db,h.id,'grocery_scan')==2
    assert spend(db,h.id,a.id,'grocery_scan')
    db.commit()
    assert balance(db,h.id,'grocery_scan')==1
