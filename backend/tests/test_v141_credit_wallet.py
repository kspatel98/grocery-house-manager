"""Focused wallet accounting tests; run with full project requirements installed."""
import os,sys,types
os.environ.setdefault('DATABASE_URL','sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY','test-only-secret')
try:
 import stripe
except ModuleNotFoundError:
 sys.modules['stripe']=types.ModuleType('stripe')
# Deps for isolated test when auth packages aren't available in build environment.
try:
 import jose,passlib
except ModuleNotFoundError:
 fake=types.ModuleType('app.api.deps')
 def require_house_member(house_id,user,db):
  from app.models import HouseMember
  from fastapi import HTTPException
  membership=db.query(HouseMember).filter_by(house_id=house_id,user_id=user.id).first()
  if not membership:raise HTTPException(403,'Not a member')
  return membership
 fake.require_house_member=require_house_member
 fake.get_current_user=lambda:None
 sys.modules['app.api.deps']=fake
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException
from app.db.session import Base
from app.models import User,House,HouseMember,HouseRole,HouseCreditBalance,CreditWalletEvent
from app.api.credit_wallet import grant_funding,contribute,redeem,house_wallet,ContributeIn,RedeemIn

def test_v141_credit_flow():
 engine=create_engine('sqlite:///:memory:')
 Base.metadata.create_all(engine)
 session=sessionmaker(bind=engine)
 with session() as db:
  owner=User(email='test-owner@example.test'); member=User(email='test-member@example.test');db.add_all([owner,member]);db.flush()
  house=House(name='Test Home',created_by_id=owner.id);db.add(house);db.flush()
  db.add_all([HouseMember(house_id=house.id,user_id=owner.id,role=HouseRole.owner),HouseMember(house_id=house.id,user_id=member.id,role=HouseRole.member)]);db.commit()
  paid={'id':'cs_v141_unique_1','payment_status':'paid','amount_total':400,'metadata':{'kind':'ghm_wallet_funding','credits':'4','user_id':str(member.id),'house_id':''}}
  grant_funding(db,paid);grant_funding(db,paid)  # duplicate webhook cannot credit twice
  assert house_wallet(house.id,db,member)['personal_balance']==4
  assert contribute(house.id,ContributeIn(credits=4),db,member)['house_balance']==4
  assert house_wallet(house.id,db,member)['personal_balance']==0
  try:redeem(house.id,RedeemIn(pack_key='receipt_4'),db,member)
  except HTTPException as e:assert e.status_code==403
  else:raise AssertionError('Ordinary member must not be able to redeem')
  assert redeem(house.id,RedeemIn(pack_key='receipt_4'),db,owner)['house_balance']==2
  assert db.query(HouseCreditBalance).filter_by(house_id=house.id,feature_key='receipt_scan').one().balance==4
  assert redeem(house.id,RedeemIn(pack_key='receipt_4'),db,owner)['house_balance']==0
  try:redeem(house.id,RedeemIn(pack_key='receipt_4'),db,owner)
  except HTTPException as e:assert e.status_code==400
  else:raise AssertionError('Spending past zero must fail')
  assert db.query(HouseCreditBalance).filter_by(house_id=house.id,feature_key='receipt_scan').one().balance==8
  direct={'id':'cs_v141_unique_2','payment_status':'paid','amount_total':1000,'metadata':{'kind':'ghm_wallet_funding','credits':'10','user_id':str(member.id),'house_id':str(house.id)}}
  grant_funding(db,direct);grant_funding(db,direct)
  assert house_wallet(house.id,db,owner)['house_balance']==10
  assert db.query(CreditWalletEvent).filter_by(stripe_session_id='cs_v141_unique_2').count()==1

if __name__=='__main__':
 test_v141_credit_flow();print('V141 wallet accounting checks passed')
