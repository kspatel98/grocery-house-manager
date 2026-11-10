"""Opt-in community food recommendations and price/discount notices.

Moderation is required before publication; photos are checked and re-encoded.
Google Places search is optional, and precise location is never requested by the
backend without an explicit browser action. Community claims are user-reported.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.admin import require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import CommunityTip, CommunityTipReport, CommunityPlaceLookupCounter, User, utc_now

router = APIRouter(prefix='/community/tips', tags=['community-tips'])
MAX_IMAGE_SIZE = 5 * 1024 * 1024


def _read_images(tip: CommunityTip) -> list[str]:
    try:
        data = json.loads(tip.images_json or '[]')
        return [str(x) for x in data if isinstance(x, str)] if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


def _serialize(tip: CommunityTip, current_user_id: int) -> dict:
    # Deliberately avoid exposing email or house membership to the community.
    return {
        'id': tip.id, 'kind': tip.kind, 'place_name': tip.place_name,
        'city': tip.city, 'address': tip.address, 'maps_url': tip.maps_url,
        'title': tip.title, 'diet_tags': json.loads(tip.diet_tags_json or '[]'),
        'price_amount': tip.price_amount, 'currency_code': tip.currency_code,
        'tax_basis': tip.tax_basis, 'notes': tip.notes,
        'offer_code': tip.offer_code, 'offer_expires': tip.offer_expires.isoformat() if tip.offer_expires else None,
        'images': _read_images(tip), 'status': tip.status, 'reports': tip.report_count,
        'is_mine': tip.user_id == current_user_id,
        'created_at': tip.created_at.isoformat() if tip.created_at else None,
        'attribution': 'GHM community member', 'source_type': 'community_reported',
    }


class TipInput(BaseModel):
    kind: str
    place_id: str | None = Field(default=None, max_length=255)
    place_name: str = Field(min_length=2, max_length=180)
    city: str = Field(min_length=2, max_length=120)
    address: str | None = Field(default=None, max_length=300)
    maps_url: str | None = Field(default=None, max_length=1000)
    title: str = Field(min_length=2, max_length=180)
    diet_tags: list[str] = Field(default_factory=list, max_length=8)
    price_amount: float | None = Field(default=None, ge=0, le=100000)
    currency_code: str = Field(default='CAD', max_length=3)
    tax_basis: str = 'unknown'
    notes: str = Field(default='', max_length=1600)
    offer_code: str | None = Field(default=None, max_length=80)
    offer_expires: date | None = None

    @field_validator('kind')
    @classmethod
    def valid_kind(cls, value: str) -> str:
        if value not in {'restaurant', 'offer'}:
            raise ValueError('Choose restaurant or offer.')
        return value

    @field_validator('currency_code')
    @classmethod
    def valid_currency(cls, value: str) -> str:
        if value not in {'CAD', 'USD', 'INR', 'GBP', 'EUR', 'AUD'}:
            raise ValueError('Unsupported currency code.')
        return value

    @field_validator('tax_basis')
    @classmethod
    def valid_tax_basis(cls, value: str) -> str:
        if value not in {'before', 'after', 'unknown'}:
            raise ValueError('Choose before, after, or unknown tax.')
        return value

    @field_validator('diet_tags')
    @classmethod
    def valid_diets(cls, values: list[str]) -> list[str]:
        allowed = {'vegetarian', 'non_vegetarian', 'vegan', 'swaminarayan', 'jain', 'unknown'}
        if any(v not in allowed for v in values):
            raise ValueError('Invalid dietary label.')
        return list(dict.fromkeys(values))


@router.get('/places')
def find_place(
    q: str = Query(min_length=2, max_length=100),
    city: str = Query(default='', max_length=120),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search Places only after a user explicitly types or shares location."""
    from app.api.food import _search_places, _place_out
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=400, detail='Supply both coordinates or neither.')
    if not settings.food_places_enabled or not settings.google_places_api_key:
        raise HTTPException(status_code=503, detail='Restaurant lookup is not connected. Enter the place manually.')
    day_key=datetime.now(timezone.utc).strftime('%Y-%m-%d')
    # Bounded paid lookups per user. Redis atomic counters are recommended if
    # this service grows to multiple high-concurrency workers.
    counter=db.query(CommunityPlaceLookupCounter).filter_by(user_id=user.id,day_key=day_key).with_for_update().first()
    if counter and counter.count>=30:
        raise HTTPException(status_code=429, detail='Daily place lookup limit reached. You can still enter details manually.')
    if counter:
        counter.count+=1
    else:
        db.add(CommunityPlaceLookupCounter(user_id=user.id,day_key=day_key,count=1))
    db.commit()
    query = q.strip() if latitude is not None else ' '.join([q.strip(), city.strip()]).strip()
    places = _search_places(text_query=query, latitude=latitude, longitude=longitude, open_now=False)
    result=[]
    for raw in places[:8]:
        p = _place_out(raw, dietary_mode='none')
        if not p.place_id:
            continue
        # With location permission, prefer the city from the returned address
        # rather than silently retaining a potentially outdated profile city.
        chunks=[part.strip() for part in (p.address or '').split(',')]
        result_city=(chunks[-3] if len(chunks)>=3 else '') or city.strip() or (user.city or '')
        result.append({'place_id':p.place_id,'name':p.name,'address':p.address,
                       'maps_url':p.maps_uri,'city':result_city})
    return result


@router.get('')
def list_tips(
    kind: str | None = Query(default=None),
    q: str = Query(default='', max_length=100),
    city: str = Query(default='', max_length=120),
    mine: bool = False,
    limit: int = Query(default=30, ge=1, le=60),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    query = db.query(CommunityTip)
    if mine:
        query = query.filter(CommunityTip.user_id == user.id)
    else:
        query = query.filter(CommunityTip.status == 'approved')
    if kind in {'restaurant', 'offer'}:
        query = query.filter(CommunityTip.kind == kind)
    if city.strip():
        query = query.filter(CommunityTip.city.ilike(f'%{city.strip()}%'))
    if q.strip():
        term = f'%{q.strip()}%'
        query = query.filter(or_(CommunityTip.title.ilike(term), CommunityTip.place_name.ilike(term), CommunityTip.notes.ilike(term)))
    tips = query.order_by(CommunityTip.created_at.desc(), CommunityTip.id.desc()).offset(offset).limit(limit).all()
    return [_serialize(tip, user.id) for tip in tips]


@router.post('', status_code=201)
def submit_tip(payload: TipInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=1)
    if db.query(CommunityTip).filter(CommunityTip.user_id == user.id, CommunityTip.created_at >= since).count() >= 5:
        raise HTTPException(status_code=429, detail='You can share up to five new tips each day.')
    # Place candidates are suggestions, not verified dietary/price evidence.
    place_name = payload.place_name.strip()
    address = (payload.address or '').strip() or None
    maps_url = (payload.maps_url or '').strip() or None
    if maps_url:
        parsed=urlparse(maps_url)
        if parsed.scheme!='https' or parsed.hostname not in {'www.google.com','maps.google.com','maps.app.goo.gl','goo.gl'}:
            maps_url=None
    tip = CommunityTip(
        user_id=user.id, kind=payload.kind, place_id=payload.place_id,
        place_name=place_name, city=payload.city.strip(), address=address,
        maps_url=maps_url, title=payload.title.strip(),
        diet_tags_json=json.dumps(payload.diet_tags), price_amount=payload.price_amount,
        currency_code=payload.currency_code, tax_basis=payload.tax_basis,
        notes=payload.notes.strip(), offer_code=payload.offer_code,
        offer_expires=payload.offer_expires, images_json='[]', status='pending',
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return _serialize(tip, user.id)


@router.post('/{tip_id:int}/photos')
async def upload_tip_photo(
    tip_id: int, file: UploadFile = File(...),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    tip = db.get(CommunityTip, tip_id)
    if not tip or tip.user_id != user.id:
        raise HTTPException(status_code=404, detail='Your community post was not found.')
    images = _read_images(tip)
    if len(images) >= 4:
        raise HTTPException(status_code=400, detail='Maximum four images per post.')
    if file.content_type not in {'image/jpeg', 'image/png', 'image/webp'}:
        raise HTTPException(status_code=400, detail='Choose a JPG, PNG or WebP image.')
    content = await file.read(MAX_IMAGE_SIZE + 1)
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail='Image must be 5 MB or smaller.')
    try:
        with Image.open(BytesIO(content)) as source:
            if source.width * source.height > 24000000:
                raise HTTPException(status_code=413, detail='Photo is too large.')
            image = ImageOps.exif_transpose(source).convert('RGB')
            image.thumbnail((1600, 1600))
            output = BytesIO()
            image.save(output, 'WEBP', quality=83, method=4)
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail='The uploaded image is invalid or unreadable.')
    directory = Path(settings.upload_dir) / 'community-tips' / f'user-{user.id}'
    directory.mkdir(parents=True, exist_ok=True)
    filename = f'{uuid4().hex}.webp'
    (directory / filename).write_bytes(output.getvalue())
    images.append(f'/uploads/community-tips/user-{user.id}/{filename}')
    tip.images_json = json.dumps(images)
    tip.status = 'pending'  # new media always triggers a fresh review
    db.commit()
    return {'images': images, 'status': tip.status}


@router.delete('/{tip_id:int}')
def delete_own_tip(tip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tip = db.get(CommunityTip, tip_id)
    if not tip or tip.user_id != user.id:
        raise HTTPException(status_code=404, detail='Your community post was not found.')
    images = _read_images(tip)
    db.delete(tip)
    db.commit()
    for url in images:
        path = Path(settings.upload_dir) / url.replace('/uploads/', '', 1)
        if url.startswith(f'/uploads/community-tips/user-{user.id}/') and path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
    return {'deleted': True}


class ReportInput(BaseModel):
    reason: str = Field(min_length=4, max_length=240)


@router.post('/{tip_id:int}/report')
def report_tip(tip_id: int, payload: ReportInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tip = db.get(CommunityTip, tip_id)
    if not tip or tip.status != 'approved' or tip.user_id == user.id:
        raise HTTPException(status_code=404, detail='Community post not found.')
    exists = db.query(CommunityTipReport).filter_by(tip_id=tip.id, user_id=user.id).first()
    if not exists:
        db.add(CommunityTipReport(tip_id=tip.id, user_id=user.id, reason=payload.reason.strip()))
        tip.report_count = int(tip.report_count or 0) + 1
        if tip.report_count >= 3:
            tip.status = 'pending'
        db.commit()
    return {'reported': True}


@router.get('/admin')
def admin_list_tips(status: str = Query(default='pending'), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    query = db.query(CommunityTip)
    if status in {'pending', 'approved', 'rejected'}:
        query = query.filter(CommunityTip.status == status)
    return [_serialize(tip, user.id) for tip in query.order_by(CommunityTip.updated_at.desc()).limit(150).all()]


@router.put('/admin/{tip_id:int}/moderate')
def moderate_tip(tip_id: int, action: str = Query(pattern='^(approve|reject|hide)$'), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    tip = db.get(CommunityTip, tip_id)
    if not tip:
        raise HTTPException(status_code=404, detail='Post not found.')
    tip.status = {'approve': 'approved', 'reject': 'rejected', 'hide': 'rejected'}[action]
    tip.updated_at = utc_now()
    db.commit()
    return {'status': tip.status, 'id': tip.id}
