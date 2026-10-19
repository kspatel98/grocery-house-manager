"""GHM credit pricing manager: persisted settings, owner/admin authentication and checkout snapshots."""
import os, json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.api.admin import require_admin
from app.db.session import get_db
from app.models import User, GhmCreditPackPricing

router=APIRouter(prefix='/admin/credit-pricing',tags=['GHM pricing manager'])
TOPUP_SIZES=(4,10,20)
SERVICE_PACKS=(
 ('receipt_4','receipt_scan',4,'4 receipt scans',2),
 ('receipt_10','receipt_scan',10,'10 receipt scans',4),
 ('grocery_3','grocery_scan',3,'3 grocery image scans',None),
 ('grocery_8','grocery_scan',8,'8 grocery image scans',None),
 ('lookup_25','product_lookup',25,'25 product lookups',None),
 ('lookup_75','product_lookup',75,'75 product lookups',None),
 ('ask_25','ask_ghm',25,'25 Ask GHM responses',None),
 ('ask_75','ask_ghm',75,'75 Ask GHM responses',None),
 ('vision_2','kitchen_vision',2,'2 Kitchen Vision scans',None),
 ('vision_5','kitchen_vision',5,'5 Kitchen Vision scans',None),
 ('price_3','paid_provider',3,'3 paid price/flyer requests',None),
 ('price_8','paid_provider',8,'8 paid price/flyer requests',None),
)
def all_packs(db:Session):
    rows={r.pack_key:r for r in db.query(GhmCreditPackPricing).all()}
    try: env_rates=json.loads(os.getenv('GHM_CREDIT_REDEMPTION_RATES','{}'))
    except (ValueError,TypeError):env_rates={}
    if not isinstance(env_rates,dict): env_rates={}
    items=[]
    for credits in TOPUP_SIZES:
        key=f'token_{credits}';row=rows.get(key)
        items.append({'key':key,'kind':'token','label':f'{credits} GHM Tokens','feature':'ghm_token','units':credits,
            'price_cents':row.price_cents if row else credits*100,
            'exchange_credits':None,'provider_cost_cents':row.provider_cost_cents if row else None,
            'enabled':row.enabled if row else True})
    for key,feature,units,label,default_rate in SERVICE_PACKS:
        row=rows.get(key);default=env_rates.get(key,default_rate)
        if type(default)!=int or default<=0:default=None
        items.append({'key':key,'kind':'service','label':label,'feature':feature,'units':units,
            'price_cents':None,'exchange_credits':row.exchange_credits if row else default,
            'provider_cost_cents':row.provider_cost_cents if row else None,
            'enabled':row.enabled if row else default is not None})
    return items

def get_pack(db:Session,key:str):
    return next((p for p in all_packs(db) if p['key']==key),None)

class PackUpdate(BaseModel):
    enabled:bool
    price_cents:int|None=Field(default=None,ge=50,le=200000)
    exchange_credits:int|None=Field(default=None,ge=1,le=10000)
    provider_cost_cents:int|None=Field(default=None,ge=0,le=200000)

@router.get('')
def list_prices(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    return {'packs':all_packs(db),'payment_fee_percent':2.9,'payment_fee_fixed_cents':30,
            'notice':'Costs are administrator estimates. Stripe or provider invoices determine actual costs; margin is not guaranteed.'}

@router.put('/{pack_key}')
def save_price(pack_key:str,body:PackUpdate,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    pack=get_pack(db,pack_key)
    if not pack:raise HTTPException(404,'Unknown package')
    if pack['kind']=='token':
        if body.price_cents is None or body.exchange_credits is not None:raise HTTPException(400,'Token packs need a CAD price and cannot set a service exchange rate.')
    else:
        if body.price_cents is not None:raise HTTPException(400,'Service packs can only be purchased using GHM Tokens.')
        if body.enabled and body.exchange_credits is None:raise HTTPException(400,'Set an exchange price in tokens before enabling this service.')
    row=db.get(GhmCreditPackPricing,pack_key)
    if row is None:row=GhmCreditPackPricing(pack_key=pack_key);db.add(row)
    row.enabled=body.enabled
    row.price_cents=body.price_cents if pack['kind']=='token' else None
    row.exchange_credits=body.exchange_credits if pack['kind']=='service' else None
    row.provider_cost_cents=body.provider_cost_cents
    db.commit()
    return get_pack(db,pack_key)
