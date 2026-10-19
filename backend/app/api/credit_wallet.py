"""Closed-loop GHM service credits with Stripe-verified funding and atomic movements.

1 credit = CAD $1 at checkout; packs are fixed service entitlements. Credit
balances are not a bank account, cash, or redeemable money.
"""
import os, json, secrets
from typing import Literal
import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_house_member
from app.core.config import settings
from app.db.session import get_db
from app.models import (User, House, HouseMember, HouseRole, CreditWalletBalance,
                        CreditWalletEvent, HouseCreditBalance, HouseCreditEvent)

router = APIRouter(tags=['GHM Wallet'])

# Packs are purchased from the HOUSE pool by the owner or a house admin only.
# Rates other than receipt scans require explicit owner price configuration.
REDEMPTION_PACKS = [
    {'key':'receipt_4', 'feature':'receipt_scan', 'units':4, 'credits':2, 'label':'4 receipt scans'},
    {'key':'receipt_10', 'feature':'receipt_scan', 'units':10, 'credits':4, 'label':'10 receipt scans'},
    {'key':'grocery_3', 'feature':'grocery_scan', 'units':3, 'label':'3 grocery image scans'},
    {'key':'lookup_25', 'feature':'product_lookup', 'units':25, 'label':'25 product lookups'},
    {'key':'ask_25', 'feature':'ask_ghm', 'units':25, 'label':'25 Ask GHM responses'},
    {'key':'vision_2', 'feature':'kitchen_vision', 'units':2, 'label':'2 Kitchen Vision scans'},
    {'key':'price_3', 'feature':'paid_provider', 'units':3, 'label':'3 paid price/flyer requests'},
]

def redemption_packs():
    try: configured=json.loads(os.getenv('GHM_CREDIT_REDEMPTION_RATES','{}'))
    except (ValueError, TypeError): configured={}
    if not isinstance(configured,dict):configured={}
    result=[]
    for pack in REDEMPTION_PACKS:
        rate=configured.get(pack['key'],pack.get('credits'))
        result.append({**pack,'credits':int(rate) if isinstance(rate,int) and not isinstance(rate,bool) and 1 <= rate <= 500 else None})
    return result

class FundIn(BaseModel):
    credits: Literal[4,10,20]
    house_id: int | None = Field(default=None,gt=0)

class ContributeIn(BaseModel):
    credits: int = Field(ge=1,le=200)

class RedeemIn(BaseModel):
    pack_key: str = Field(min_length=3,max_length=80)

def _balance(db,owner_type,owner_id):
    row=db.query(CreditWalletBalance).filter_by(owner_type=owner_type,owner_id=owner_id).first()
    return max(0,int(row.balance)) if row else 0

def _increase(db,owner_type,owner_id,units):
    dialect=db.get_bind().dialect.name
    if dialect not in {'sqlite','postgresql'}: raise RuntimeError('Unsupported wallet database dialect')
    fn=sqlite_insert if dialect=='sqlite' else pg_insert
    stmt=fn(CreditWalletBalance).values(owner_type=owner_type,owner_id=owner_id,balance=units)
    db.execute(stmt.on_conflict_do_update(index_elements=[CreditWalletBalance.owner_type,CreditWalletBalance.owner_id],set_={'balance':CreditWalletBalance.balance+units}))

def _decrease(db,owner_type,owner_id,units):
    return db.execute(update(CreditWalletBalance).where(CreditWalletBalance.owner_type==owner_type, CreditWalletBalance.owner_id==owner_id, CreditWalletBalance.balance>=units).values(balance=CreditWalletBalance.balance-units).returning(CreditWalletBalance.id)).scalar_one_or_none() is not None

def _events(db,owner_type,owner_id):
    events=db.query(CreditWalletEvent).filter_by(owner_type=owner_type,owner_id=owner_id).order_by(CreditWalletEvent.id.desc()).limit(100).all()
    actor_ids={e.actor_user_id for e in events if e.actor_user_id is not None}
    actors={u.id:(u.full_name or 'House member') for u in db.query(User).filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    return [{'id':e.id,'kind':e.event_type,'delta':e.delta,'actor_user_id':e.actor_user_id,
             'actor_name':actors.get(e.actor_user_id,'Former member'), 'house_id':e.target_house_id,
             'service_pack':e.service_pack_key,'amount_cents':e.amount_cents,'created_at':e.created_at.isoformat()} for e in events]

@router.get('/credits/wallet')
def personal_wallet(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    return {'balance':_balance(db,'user',user.id),'events':_events(db,'user',user.id),'currency':'CAD','credit_unit_cents':100,'purchase_options':[4,10,20]}

@router.post('/credits/wallet/checkout')
def fund_checkout(body:FundIn,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    if body.house_id:require_house_member(body.house_id,user,db)
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(503,'Verified Stripe checkout is not configured.')
    stripe.api_key=settings.stripe_secret_key
    name=f'{body.credits} GHM service credits'+(' for your selected house' if body.house_id else ' for your account')
    try:
        session=stripe.checkout.Session.create(mode='payment',payment_method_types=['card'],customer_email=user.email,
            line_items=[{'price_data':{'currency':'cad','unit_amount':body.credits*100,
                'product_data':{'name':name,'description':'Closed-loop GHM service credits; not cash, non-withdrawable.'}},'quantity':1}],
            success_url=f"{settings.frontend_url.rstrip('/')}/houses/{body.house_id}/credits?payment=success" if body.house_id else f"{settings.frontend_url.rstrip('/')}/houses?wallet=success",
            cancel_url=f"{settings.frontend_url.rstrip('/')}/houses/{body.house_id}/credits?payment=cancelled" if body.house_id else f"{settings.frontend_url.rstrip('/')}/houses?wallet=cancelled",
            metadata={'kind':'ghm_wallet_funding','user_id':str(user.id),'house_id':str(body.house_id or ''),'credits':str(body.credits)},
            client_reference_id=str(user.id))
    except Exception:raise HTTPException(503,'Checkout unavailable. Please try again.')
    return {'checkout_url':session['url']}

def grant_funding(db:Session,session:dict):
    """Called only by signature-verified Stripe webhook, idempotent by session ID."""
    md=session.get('metadata') or {}
    if md.get('kind')!='ghm_wallet_funding' or session.get('payment_status')!='paid':return
    sid=str(session.get('id') or '')
    try:credits=int(md['credits']);uid=int(md['user_id']);hid=int(md['house_id']) if md.get('house_id') else None
    except (KeyError,TypeError,ValueError):return
    if not sid or credits not in (4,10,20) or int(session.get('amount_total') or -1)!=credits*100:return
    if (session.get('currency') or 'cad').lower()!='cad':return
    if not db.get(User,uid) or (hid and not db.get(House,hid)):return
    if db.query(CreditWalletEvent).filter_by(stripe_session_id=sid).first():return
    # The selected house is stored in signed session metadata; do not use caller input here.
    typ='house' if hid else 'user';owner_id=hid or uid
    _increase(db,typ,owner_id,credits)
    db.add(CreditWalletEvent(owner_type=typ,owner_id=owner_id,actor_user_id=uid,delta=credits,
                             event_type='direct_purchase' if hid else 'purchase',target_house_id=hid,
                             stripe_session_id=sid,amount_cents=credits*100))
    db.commit()

@router.get('/houses/{house_id}/credits/wallet')
def house_wallet(house_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    member=require_house_member(house_id,user,db)
    return {'house_id':house_id,'house_name':db.get(House,house_id).name,
            'house_balance':_balance(db,'house',house_id),'personal_balance':_balance(db,'user',user.id),
            'can_redeem':member.role in (HouseRole.owner,HouseRole.admin),
            'my_role':member.role.value,'redemptions':redemption_packs(),
            'house_events':_events(db,'house',house_id),'personal_events':_events(db,'user',user.id)}

@router.post('/houses/{house_id}/credits/wallet/contribute')
def contribute(house_id:int,body:ContributeIn,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    require_house_member(house_id,user,db)
    if not _decrease(db,'user',user.id,body.credits):
        db.rollback();raise HTTPException(400,'Insufficient personal credits.')
    _increase(db,'house',house_id,body.credits)
    transfer=secrets.token_hex(12)
    db.add_all([
        CreditWalletEvent(owner_type='user',owner_id=user.id,actor_user_id=user.id,delta=-body.credits,event_type='contributed',target_house_id=house_id,transfer_key=transfer),
        CreditWalletEvent(owner_type='house',owner_id=house_id,actor_user_id=user.id,delta=body.credits,event_type='contribution',target_house_id=house_id,transfer_key=transfer)
    ])
    db.commit()
    return {'ok':True,'house_balance':_balance(db,'house',house_id),'personal_balance':_balance(db,'user',user.id)}

@router.post('/houses/{house_id}/credits/wallet/redeem')
def redeem(house_id:int,body:RedeemIn,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    member=require_house_member(house_id,user,db)
    if member.role not in (HouseRole.owner,HouseRole.admin):raise HTTPException(403,'Only a house owner or admin can redeem shared credits.')
    pack=next((p for p in redemption_packs() if p['key']==body.pack_key),None)
    if not pack or pack['credits'] is None:raise HTTPException(400,'This redemption pack has not been priced yet.')
    if not _decrease(db,'house',house_id,pack['credits']):
        db.rollback();raise HTTPException(400,'Insufficient house credits.')
    dialect=db.get_bind().dialect.name
    fn=sqlite_insert if dialect=='sqlite' else pg_insert
    stmt=fn(HouseCreditBalance).values(house_id=house_id,feature_key=pack['feature'],balance=pack['units'])
    db.execute(stmt.on_conflict_do_update(index_elements=[HouseCreditBalance.house_id,HouseCreditBalance.feature_key],set_={'balance':HouseCreditBalance.balance+pack['units']}))
    db.add_all([
        CreditWalletEvent(owner_type='house',owner_id=house_id,actor_user_id=user.id,delta=-pack['credits'],event_type='redeemed',target_house_id=house_id,service_pack_key=pack['key']),
        HouseCreditEvent(house_id=house_id,actor_user_id=user.id,feature_key=pack['feature'],delta=pack['units'],event_type='wallet_redemption',pack_key=pack['key'])
    ])
    db.commit()
    return {'ok':True,'house_balance':_balance(db,'house',house_id),'service':pack['feature'],'new_units':pack['units']}
