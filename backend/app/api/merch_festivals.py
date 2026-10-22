"""GHM merchandise catalog and editable cultural meal calendar.

No fabricated payments/orders: merchandise is browseable until PrintKK order handling,
signature-verified payment and atomic token redemption are deployed and tested.
"""
from datetime import date, timedelta
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.api.admin import require_admin
from app.db.session import get_db
from app.models import User, MerchCatalogProduct, FestivalMealRule

router = APIRouter(tags=['Merchandise and festivals'])

class ProductIn(BaseModel):
    sku: str = Field(min_length=2,max_length=80,pattern=r'^[A-Za-z0-9_-]+$')
    name: str = Field(min_length=2,max_length=180)
    category: str = Field(default='Other',max_length=80)
    description: str = Field(default='',max_length=3000)
    image_url: Optional[str] = Field(default=None,max_length=2000)
    price_cents_cad: int = Field(ge=0,le=2_000_000)
    printkk_design_id: Optional[str] = Field(default=None,max_length=140)
    active: bool = False
    priority: int = Field(default=0,ge=-5000,le=5000)


def product_dict(row):
    return {key:getattr(row,key) for key in ('id','sku','name','category','description','image_url',
               'price_cents_cad','printkk_design_id','active','priority')}

@router.get('/merch')
def products(db:Session=Depends(get_db)):
    return {'currency':'CAD','token_value_cents':100,'checkout_available':False,
      'message':'Catalog preview. Merch checkout will open after fulfillment and payments have been verified.',
      'products':[product_dict(row) for row in db.query(MerchCatalogProduct)
          .filter(MerchCatalogProduct.active.is_(True)).order_by(MerchCatalogProduct.priority.desc(),MerchCatalogProduct.id.desc()).all()]}

@router.get('/merch/admin')
def admin_products(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    return [product_dict(row) for row in db.query(MerchCatalogProduct).order_by(MerchCatalogProduct.id.desc()).all()]

@router.post('/merch/admin')
def admin_add_product(body:ProductIn,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    if db.query(MerchCatalogProduct).filter_by(sku=body.sku).first():
        raise HTTPException(409,'This SKU already exists.')
    item=MerchCatalogProduct(**body.model_dump())
    db.add(item);db.commit();db.refresh(item)
    return product_dict(item)

@router.put('/merch/admin/{product_id}')
def admin_update_product(product_id:int,body:ProductIn,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    item=db.get(MerchCatalogProduct,product_id)
    if not item:raise HTTPException(404,'Product not found.')
    conflict=db.query(MerchCatalogProduct).filter_by(sku=body.sku).first()
    if conflict and conflict.id != item.id:raise HTTPException(409,'SKU already exists.')
    for k,v in body.model_dump().items():setattr(item,k,v)
    db.commit();db.refresh(item)
    return product_dict(item)

@router.delete('/merch/admin/{product_id}')
def admin_delete_product(product_id:int,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    item=db.get(MerchCatalogProduct,product_id)
    if not item:raise HTTPException(404,'Product not found.')
    db.delete(item);db.commit()
    return {'deleted':True}

@router.post('/merch/checkout')
def merch_checkout_disabled(user:User=Depends(get_current_user)):
    raise HTTPException(503,'Merchandise checkout is not yet enabled. GHM Tokens have not been deducted.')

class FestivalIn(BaseModel):
    name: str = Field(min_length=2,max_length=140)
    festival_date: date
    region: str = Field(default='Gujarati / Indian',max_length=120)
    dishes: list[str] = Field(default_factory=list,max_length=12)
    reminder_days: int = Field(default=7,ge=1,le=30)
    active: bool = True


def festival_dict(item):
    return {'id':item.id,'name':item.name,'festival_date':item.festival_date.isoformat(),
            'region':item.region,'dishes':json.loads(item.dishes_json or '[]'),
            'reminder_days':item.reminder_days,'active':item.active}

@router.get('/festival-meals/upcoming')
def upcoming_festivals(db:Session=Depends(get_db), user:User=Depends(get_current_user)):
    today=date.today()
    events=db.query(FestivalMealRule).filter(FestivalMealRule.active.is_(True),
        FestivalMealRule.festival_date>=today,FestivalMealRule.festival_date<=today+timedelta(days=30)).all()
    result=[festival_dict(event) for event in events if (event.festival_date-today).days <= event.reminder_days]
    # Annual fixed-date example only. Lunar calendar festivals are admin-curated.
    for year in (today.year,today.year+1):
        stamp=date(year,1,14)
        if today<=stamp<=today+timedelta(days=7) and not any(e['name'].lower().startswith('makar') for e in result):
            result.append({'id':-year,'name':'Makar Sankranti / Uttarayan','festival_date':stamp.isoformat(),
              'region':'Gujarati / Indian','dishes':['Undhiyu','Jalebi','Chikki'],
              'reminder_days':7,'active':True})
    # Curated regional example for the next Dussehra; do not project variable
    # Hindu festival dates into later years mathematically.
    if today <= date(2027,10,9) <= today + timedelta(days=7):
        if not any('dussehra' in x['name'].lower() or 'dasara' in x['name'].lower() for x in result):
            result.append({'id':-20271009,'name':'Dussehra / Vijayadashami (2027)',
                'festival_date':'2027-10-09','region':'Gujarati / western Indian (confirm your local calendar)',
                'dishes':['Fafda','Jalebi'],'reminder_days':7,'active':True})
    return sorted(result,key=lambda row:row['festival_date'])

@router.get('/festival-meals/admin')
def list_festival_rules(db:Session=Depends(get_db),_:User=Depends(require_admin)):
    return [festival_dict(x) for x in db.query(FestivalMealRule).order_by(FestivalMealRule.festival_date).all()]

@router.post('/festival-meals/admin')
def create_festival_rule(body:FestivalIn,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    item=FestivalMealRule(name=body.name,festival_date=body.festival_date,region=body.region,
      dishes_json=json.dumps(body.dishes),reminder_days=body.reminder_days,active=body.active)
    db.add(item);db.commit();db.refresh(item);return festival_dict(item)

@router.put('/festival-meals/admin/{rule_id}')
def update_festival_rule(rule_id:int,body:FestivalIn,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    item=db.get(FestivalMealRule,rule_id)
    if not item:raise HTTPException(404,'Festival rule not found')
    item.name=body.name;item.festival_date=body.festival_date;item.region=body.region
    item.dishes_json=json.dumps(body.dishes);item.reminder_days=body.reminder_days;item.active=body.active
    db.commit();return festival_dict(item)

@router.delete('/festival-meals/admin/{rule_id}')
def delete_festival_rule(rule_id:int,db:Session=Depends(get_db),_:User=Depends(require_admin)):
    item=db.get(FestivalMealRule,rule_id)
    if not item:raise HTTPException(404,'Festival rule not found')
    db.delete(item);db.commit();return {'deleted':True}
