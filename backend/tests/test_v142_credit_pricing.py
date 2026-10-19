"""SQLite-based smoke tests for GHM token configuration and accounting; no external payment required."""
import os,sys,types
os.environ.setdefault('DATABASE_URL','sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY','test-only-secret')
try: import stripe
except ModuleNotFoundError:sys.modules['stripe']=types.ModuleType('stripe')
try: import jose,passlib
except ModuleNotFoundError:
    fake=types.ModuleType('app.api.deps')
    def require_house_member(house_id,user,db):
        from app.models import HouseMember
        from fastapi import HTTPException
        member=db.query(HouseMember).filter_by(house_id=house_id,user_id=user.id).first()
        if not member:raise HTTPException(403,'Not a member')
        return member
    fake.require_house_member=require_house_member;fake.get_current_user=lambda:None
    sys.modules['app.api.deps']=fake
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException
from app.db.session import Base
from app.models import House,HouseMember,HouseRole,User,CreditWalletEvent,HouseCreditBalance
from app.api.credit_pricing import list_prices,save_price,PackUpdate,get_pack
from app.api.credit_wallet import grant_funding,contribute,redeem,house_wallet,ContributeIn,RedeemIn

def test_v142():
    engine=create_engine('sqlite:///:memory:');Base.metadata.create_all(engine)
    session=sessionmaker(bind=engine)
    with session() as db:
        owner=User(email='owner@example.test');member=User(email='member@example.test');db.add_all([owner,member]);db.flush()
        house=House(name='Example household',created_by_id=owner.id);db.add(house);db.flush()
        db.add_all([HouseMember(house_id=house.id,user_id=owner.id,role=HouseRole.owner),HouseMember(house_id=house.id,user_id=member.id,role=HouseRole.member)]);db.commit()
        packs=list_prices(db,owner)['packs']
        assert len([p for p in packs if p['kind']=='token'])==3
        assert len([p for p in packs if p['kind']=='service'])==12
        assert get_pack(db,'token_4')['price_cents']==400
        assert get_pack(db,'grocery_3')['exchange_credits'] is None
        save_price('token_4',PackUpdate(enabled=True,price_cents=500,provider_cost_cents=90),db,owner)
        assert get_pack(db,'token_4')['price_cents']==500
        # Simulate payment initiated at old $4, then admin changes it to $5.
        old={'id':'cs_old','payment_status':'paid','amount_total':400,'currency':'cad','metadata':{'kind':'ghm_wallet_funding','credits':'4','user_id':str(member.id),'house_id':'','amount_cents':'400'}}
        grant_funding(db,old);grant_funding(db,old)
        assert house_wallet(house.id,db,member)['personal_balance']==4
        assert db.query(CreditWalletEvent).filter_by(stripe_session_id='cs_old').count()==1
        # Bad amount doesn't credit.
        bad={**old,'id':'cs_bad','amount_total':100}
        grant_funding(db,bad)
        assert house_wallet(house.id,db,member)['personal_balance']==4
        save_price('grocery_3',PackUpdate(enabled=True,exchange_credits=2,provider_cost_cents=40),db,owner)
        assert get_pack(db,'grocery_3')['exchange_credits']==2
        assert contribute(house.id,ContributeIn(credits=4),db,member)['house_balance']==4
        try:redeem(house.id,RedeemIn(pack_key='grocery_3'),db,member)
        except HTTPException as exc:assert exc.status_code==403
        else:raise AssertionError('Non-admin could redeem service tokens')
        assert redeem(house.id,RedeemIn(pack_key='grocery_3'),db,owner)['house_balance']==2
        assert db.query(HouseCreditBalance).filter_by(house_id=house.id,feature_key='grocery_scan').one().balance==3
        save_price('grocery_3',PackUpdate(enabled=False,exchange_credits=2,provider_cost_cents=40),db,owner)
        try:redeem(house.id,RedeemIn(pack_key='grocery_3'),db,owner)
        except HTTPException as exc:assert exc.status_code==400
        else:raise AssertionError('Disabled service was redeemed')
        assert get_pack(db,'grocery_3')['enabled'] is False
    print('V142 credit/pricing smoke test passed')

if __name__=='__main__':test_v142()
