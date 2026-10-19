"""Stripe-verified member contributions to a particular house's service pool."""
from datetime import datetime, timezone
import json, os
import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_house_member
from app.core.config import settings
from app.db.session import get_db
from app.models import House, HouseCreditBalance, HouseCreditEvent, HouseCreditPolicy, User
from app.utils.house_credits import FEATURES, may_spend

router = APIRouter(prefix='/houses/{house_id}/credits', tags=['House credits'])

PACKS = [
    {'key':'receipt_4','feature':'receipt_scan','units':4,'label':'4 receipt scans'},
    {'key':'receipt_10','feature':'receipt_scan','units':10,'label':'10 receipt scans'},
    {'key':'grocery_3','feature':'grocery_scan','units':3,'label':'3 grocery image scans'},
    {'key':'grocery_8','feature':'grocery_scan','units':8,'label':'8 grocery image scans'},
    {'key':'lookup_25','feature':'product_lookup','units':25,'label':'25 product lookups'},
    {'key':'lookup_75','feature':'product_lookup','units':75,'label':'75 product lookups'},
    {'key':'ask_25','feature':'ask_ghm','units':25,'label':'25 Ask GHM responses'},
    {'key':'ask_75','feature':'ask_ghm','units':75,'label':'75 Ask GHM responses'},
    {'key':'vision_2','feature':'kitchen_vision','units':2,'label':'2 Kitchen Vision scans'},
    {'key':'vision_5','feature':'kitchen_vision','units':5,'label':'5 Kitchen Vision scans'},
    {'key':'price_3','feature':'paid_provider','units':3,'label':'3 paid price/flyer requests'},
    {'key':'price_8','feature':'paid_provider','units':8,'label':'8 paid price/flyer requests'},
]
# Existing receipt-pack price points are carried forward. Other packs require
# explicit prices in backend/.env before being offered for purchase.
DEFAULT_PRICES = {'receipt_4':200, 'receipt_10':400}

def priced_packs():
    try:
        raw = json.loads(os.getenv('GHM_HOUSE_CREDIT_PACK_PRICES_CENTS', '{}'))
        if not isinstance(raw, dict): raw = {}
    except (TypeError, ValueError):
        raw = {}
    configured = {**DEFAULT_PRICES, **raw}
    return [{**p, 'price_cents': int(configured[p['key']]) if str(configured.get(p['key'], '')).isdigit() and int(configured[p['key']]) >= 50 else None,
             'currency':'CAD'} for p in PACKS]

class CheckoutIn(BaseModel):
    pack_key: str = Field(min_length=3, max_length=48)

class PolicyIn(BaseModel):
    members_can_spend: bool

@router.get('')
def get_credits(house_id:int, db:Session=Depends(get_db), user:User=Depends(get_current_user)):
    member = require_house_member(house_id,user,db)
    policy = db.get(HouseCreditPolicy,house_id)
    rows = db.query(HouseCreditBalance).filter_by(house_id=house_id).all()
    ledger = db.query(HouseCreditEvent).filter_by(house_id=house_id).order_by(HouseCreditEvent.id.desc()).limit(60).all()
    people = {u.id: u.full_name or 'House member' for u in db.query(User).filter(User.id.in_([x.actor_user_id for x in ledger if x.actor_user_id])).all()}
    return {'balances':{f:next((int(row.balance) for row in rows if row.feature_key==f),0) for f in FEATURES},
            'packs':priced_packs(), 'members_can_spend':policy.members_can_spend if policy else True,
            'can_spend':may_spend(db,house_id,user.id), 'is_owner':db.get(House,house_id).created_by_id == user.id,
            'events':[{'id':e.id,'feature':e.feature_key,'delta':e.delta,'kind':e.event_type,'actor':people.get(e.actor_user_id,'Former member'),
                       'amount_cents':e.amount_cents,'created_at':e.created_at.isoformat()} for e in ledger]}

@router.put('/policy')
def update_policy(house_id:int, body:PolicyIn, db:Session=Depends(get_db), user:User=Depends(get_current_user)):
    require_house_member(house_id,user,db)
    house = db.get(House,house_id)
    if house.created_by_id != user.id:
        raise HTTPException(403,'Only the house owner may change shared-credit spending permissions.')
    policy = db.get(HouseCreditPolicy,house_id)
    if not policy: policy = HouseCreditPolicy(house_id=house_id);db.add(policy)
    policy.members_can_spend = body.members_can_spend
    db.commit()
    return {'members_can_spend':policy.members_can_spend}

@router.post('/checkout')
def checkout(house_id:int,body:CheckoutIn,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    require_house_member(house_id,user,db)
    raise HTTPException(410,'Service packs are now exchanged using GHM Tokens in Wallet. Existing completed purchases remain valid.')
    pack = next((x for x in priced_packs() if x['key']==body.pack_key),None)
    if not pack: raise HTTPException(400,'Unknown service-credit pack.')
    if pack['price_cents'] is None:raise HTTPException(400,'This credit pack is not yet priced. Admin must configure its price first.')
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(503,'Stripe and a signed Stripe webhook must both be configured before accepting payments.')
    stripe.api_key=settings.stripe_secret_key
    try:
        session=stripe.checkout.Session.create(
            mode='payment',payment_method_types=['card'],customer_email=user.email,
            line_items=[{'price_data':{'currency':'cad','unit_amount':pack['price_cents'],
                         'product_data':{'name':f"GHM House Credits — {pack['label']}",
                                         'description':'Prepaid service credits for one selected household, not cash.'}},'quantity':1}],
            client_reference_id=str(user.id),
            success_url=f'{settings.frontend_url}/houses/{house_id}/credits?payment=success',
            cancel_url=f'{settings.frontend_url}/houses/{house_id}/credits?payment=cancelled',
            metadata={'kind':'house_credit_pack','user_id':str(user.id),'house_id':str(house_id),
                      'pack_key':pack['key'],'feature_key':pack['feature'],'units':str(pack['units']),
                      'amount_cents':str(pack['price_cents'])},
        )
    except Exception:
        raise HTTPException(503,'Checkout is temporarily unavailable. Please try again.')
    return {'checkout_url':session['url']}

def grant_completed_checkout(db:Session, session:dict)->None:
    """Call only from Stripe signature-verified webhook; duplicate session safe."""
    md=session.get('metadata') or {}
    if md.get('kind') != 'house_credit_pack' or session.get('payment_status') != 'paid':return
    pack=next((p for p in priced_packs() if p['key']==md.get('pack_key')),None)
    if not pack or pack['price_cents'] is None:return
    sid=str(session.get('id') or '')
    try: house_id=int(md['house_id']); user_id=int(md['user_id'])
    except (ValueError,KeyError,TypeError):return
    if not sid or not db.get(House,house_id) or not db.get(User,user_id):return
    amount=int(session.get('amount_total') or -1)
    if amount != pack['price_cents'] or pack['feature']!=md.get('feature_key') or int(md.get('units') or 0)!=pack['units']:return
    if db.query(HouseCreditEvent).filter_by(stripe_session_id=sid).first():return
    db.add(HouseCreditEvent(house_id=house_id, actor_user_id=user_id,feature_key=pack['feature'],
                             delta=pack['units'],event_type='purchase',pack_key=pack['key'],stripe_session_id=sid,
                             amount_cents=amount))
    dialect=db.get_bind().dialect.name
    if dialect not in {'sqlite','postgresql'}:return
    insert=sqlite_insert if dialect=='sqlite' else pg_insert
    stmt=insert(HouseCreditBalance).values(house_id=house_id,feature_key=pack['feature'],balance=pack['units'])
    stmt=stmt.on_conflict_do_update(index_elements=[HouseCreditBalance.house_id,HouseCreditBalance.feature_key],
                                    set_={'balance':HouseCreditBalance.balance+pack['units']})
    db.execute(stmt)
    db.commit()
