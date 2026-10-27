"""GHM merchandise catalog and editable cultural meal calendar.

No fabricated payments/orders: merchandise is browseable until PrintKK order handling,
signature-verified payment and atomic token redemption are deployed and tested.
"""
from datetime import date, timedelta
from pathlib import Path
import io
import secrets
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.api.admin import require_admin
from app.db.session import get_db
from app.models import User, MerchCatalogProduct, FestivalMealRule
from app.core.config import settings
from PIL import Image, ImageOps, UnidentifiedImageError

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

    @field_validator('image_url')
    @classmethod
    def validate_image_url(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        value = value.strip()
        # Merch images are either securely hosted by GHM or a public HTTPS image.
        if value.startswith('/uploads/merch/') and '..' not in value and '?' not in value and '#' not in value:
            return value
        from urllib.parse import urlparse
        url = urlparse(value)
        if url.scheme == 'https' and url.hostname and not url.username and not url.password:
            return value
        raise ValueError('Use a secure HTTPS photo URL or upload an image through GHM.')


def product_dict(row):
    return {key:getattr(row,key) for key in ('id','sku','name','category','description','image_url',
               'price_cents_cad','printkk_design_id','active','priority')}

@router.post('/merch/admin/upload-image')
async def admin_upload_merch_image(file: UploadFile = File(...), _: User = Depends(require_admin)):
    """Admin-only product photography upload to the existing persistent uploads volume.

    Never trust the original extension or filename. Decode, resize and re-encode
    raster data to WebP so HTML/polyglot files cannot be served as images.
    """
    if file.content_type not in {'image/png', 'image/jpeg', 'image/webp'}:
        raise HTTPException(415, 'Upload a JPG, PNG or WebP image.')
    content = await file.read(5 * 1024 * 1024 + 1)
    await file.close()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, 'Product image must be 5 MB or smaller.')
    if not content:
        raise HTTPException(400, 'Select an image to upload.')
    try:
        with Image.open(io.BytesIO(content)) as source:
            if source.format not in {'JPEG', 'PNG', 'WEBP'}:
                raise HTTPException(415, 'Upload a JPG, PNG or WebP image.')
            if source.width * source.height > 20_000_000:
                raise HTTPException(413, 'Image dimensions exceed the safety limit.')
            # Loads the complete pixel data, catching truncated or malformed files.
            source.load()
            normalized = ImageOps.exif_transpose(source)
            normalized.thumbnail((1600, 1600))
            data = io.BytesIO()
            normalized.convert('RGB').save(data, format='WEBP', quality=85, method=4)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, 'This image could not be decoded safely.')
    folder = Path(settings.upload_dir) / 'merch'
    folder.mkdir(parents=True, exist_ok=True)
    filename = f'{secrets.token_hex(20)}.webp'
    (folder / filename).write_bytes(data.getvalue())
    return {'url': f'/uploads/merch/{filename}'}


@router.get('/merch')
def products(db:Session=Depends(get_db)):
    return {'currency':'CAD','token_value_cents':100,'checkout_available':bool(settings.merch_checkout_enabled and settings.merch_tax_enabled and settings.stripe_secret_key and settings.stripe_webhook_secret and settings.printkk_api_key),
      'pilot_mode':False,'message':'Merch checkout is controlled by payment, tax and fulfillment readiness checks.',
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
