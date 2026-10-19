"""Admin-only professional single-recipient offer drafts and estimated usage economics."""
import html
import json
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.api.admin import require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import AdminUserOffer, AdminOfferEmailEvent, User, UserFeatureBudget, OwnerProviderBudget, HouseCreditEvent, House, Receipt, MarketingOptOut
from app.api.communications import token_for_user
from app.utils.emailer import _send_resend_email, _send_smtp_email, email_configured, email_provider

router=APIRouter(prefix='/admin/growth',tags=['Admin growth'])
class OfferDraft(BaseModel):
    user_id:int
    offer_id:int|None=None
    kind:str=Field(default='discount',pattern='^(discount|free_access|announcement)$')
    sender_role:str=Field(default='GHM Team',pattern='^(GHM Team|Founder|CEO|Owner)$')
    subject_override:str|None=Field(default=None,max_length=170)
    custom_note:str|None=Field(default=None,max_length=1500)

class OfferSend(OfferDraft):
    confirm_send:bool=False
    confirm_marketing_permission:bool=False

def compose(db:Session, data:OfferDraft):
    recipient=db.get(User,data.user_id)
    if not recipient or not recipient.is_active:raise HTTPException(404,'Recipient not found')
    offer=db.get(AdminUserOffer,data.offer_id) if data.offer_id else None
    if data.offer_id and (not offer or (offer.user_id is not None and offer.user_id != recipient.id)):
        raise HTTPException(400,'Select an offer intended for this recipient or a general offer.')
    if offer and offer.status not in {'pending','checkout_started'}:
        raise HTTPException(400,'This offer is no longer active.')
    if offer and offer.expires_at:
        expires=offer.expires_at
        if expires.tzinfo is None: expires=expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(400,'Offer expired.')
    label=(offer.title if offer else '').strip()
    if not label:
        label={'discount':'A personal GHM offer for you','free_access':'Complimentary GHM premium access','announcement':'A note from Grocery House Manager'}[data.kind]
    subject=(data.subject_override or label).strip()[:170]
    name=(recipient.full_name or 'there').strip().split(' ')[0]
    if offer and offer.offer_kind=='discount':
        detail=f"We created a {offer.discount_percent or ''}% discount offer for you. You can review your exact eligibility, eligible plan, and expiry date inside your GHM account."
    elif offer and offer.offer_kind=='free_plan_access':
        detail="We created a limited-time premium access offer for you. Open GHM to review its benefits and expiration date."
    elif data.kind=='free_access':
        detail='Explore the premium access offer available in your GHM account.'
    elif data.kind=='discount':
        detail='Explore an available subscription discount in your GHM account.'
    else:
        detail='We are sharing a quick update from the Grocery House Manager team.'
    if data.kind != 'announcement' and not offer:
        detail += ' This message is informational; no unissued discount or free access is guaranteed.'
    note=(data.custom_note or '').strip()
    preferences=db.get(MarketingOptOut,recipient.id)
    opted_out=bool(preferences and preferences.opted_out)
    footer_role={'GHM Team':'The GHM Team','Founder':'The Founder, Grocery House Manager','CEO':'Office of the CEO, Grocery House Manager','Owner':'Grocery House Manager Owner'}[data.sender_role]
    unsubscribe_url=f"{settings.frontend_url.rstrip('/')}/api/communications/unsubscribe?token={token_for_user(recipient.id)}"
    plain=(f"Hello {name},\n\n{detail}\n\n"+(note+'\n\n' if note else '')+f"View your offers: {settings.frontend_url}/profile\n\nWarm regards,\n{footer_role}\nSupremDas Group\n\nGHM Support: support@grocery-house-manager.com\nYou're receiving this personal service/offer message regarding GHM. To stop promotional email, use this link: {unsubscribe_url}")
    escaped=lambda x:html.escape(str(x),quote=True)
    logo='https://grocery-house-manager.com/brand/grocery-house-manager-logo.png'
    markup=f'''<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#f3f6f2;margin:0;padding:30px 12px;font:15px/1.6 Arial,sans-serif;color:#213329"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #d9e5dc;border-radius:16px"><tr><td style="padding:24px 28px;border-bottom:3px solid #92bd9d"><img src="{escaped(logo)}" width="52" height="52" alt="GHM" style="vertical-align:middle;border-radius:10px"> <strong style="font-size:20px;color:#183c2a">Grocery House Manager</strong></td></tr><tr><td style="padding:28px"><h1 style="font-size:24px;line-height:1.3;color:#183c2a;margin-top:0">{escaped(label)}</h1><p>Hello {escaped(name)},</p><p>{escaped(detail)}</p>{'<p>'+escaped(note)+'</p>' if note else ''}<p><a href="{escaped(settings.frontend_url)}/profile" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#2c7056;color:white;text-decoration:none;font-weight:bold">View your GHM offers</a></p><p>Warm regards,<br><strong>{escaped(footer_role)}</strong><br>SupremDas Group</p></td></tr><tr><td style="padding:18px 28px;background:#f5f9f5;color:#567363;font-size:12px">You are receiving a GHM account offer or update. <a href="{escaped(unsubscribe_url)}">Unsubscribe from promotional emails</a> or contact <a href="mailto:support@grocery-house-manager.com">support@grocery-house-manager.com</a>.<br>Grocery House Manager · SupremDas Group</td></tr></table></td></tr></table></body></html>'''
    return {'recipient_email':recipient.email,'subject':subject,'text':plain,'html':markup,'sender_role':data.sender_role,'offer_id':offer.id if offer else None,'opted_out':opted_out}

@router.post('/offer-email/preview')
def preview(body:OfferDraft, db:Session=Depends(get_db), admin:User=Depends(require_admin)):
    return compose(db,body)

@router.post('/offer-email/send')
def send(body:OfferSend, db:Session=Depends(get_db), admin:User=Depends(require_admin)):
    if not body.confirm_send or not body.confirm_marketing_permission:
        raise HTTPException(400,'Confirm this specific recipient has consented or you have another valid legal basis, and approve sending.')
    draft=compose(db,body)
    if draft['opted_out']:
        raise HTTPException(403,'Recipient has unsubscribed from promotional offers.')
    if not email_configured():raise HTTPException(503,'GHM email provider is not configured.')
    if email_provider()=='resend':
        ok=_send_resend_email(draft['recipient_email'],draft['subject'],draft['html'],draft['text'])
    else:
        ok=_send_smtp_email(draft['recipient_email'],draft['subject'],draft['html'],draft['text'])
    db.add(AdminOfferEmailEvent(admin_id=admin.id,recipient_id=body.user_id,offer_id=draft['offer_id'],
                                sender_role=body.sender_role,subject=draft['subject'],sent=ok))
    db.commit()
    if not ok:raise HTTPException(503,'GHM could not deliver this email. You can copy the draft and send it manually.')
    return {'ok':True,'message':'Email submitted to the configured email provider. Delivery is not guaranteed.'}

@router.get('/feature-costs')
def costs(db:Session=Depends(get_db),admin:User=Depends(require_admin)):
    """Usage is measured; costs are configurable ESTIMATES, not actual provider invoices."""
    month=datetime.now(timezone.utc).strftime('%Y-%m')
    try: config=json.loads(os.getenv('GHM_ESTIMATED_UNIT_COST_CAD','{}'))
    except (TypeError,ValueError):config={}
    if not isinstance(config,dict):config={}
    features=['grocery_scan','product_lookup','ask_ghm','kitchen_vision','paid_provider']
    totals=dict(db.query(UserFeatureBudget.feature_key,func.sum(UserFeatureBudget.count)).filter(UserFeatureBudget.period_key==month).group_by(UserFeatureBudget.feature_key).all())
    totals['paid_provider']=int(db.query(func.coalesce(func.sum(OwnerProviderBudget.count),0)).filter(OwnerProviderBudget.period_key==f'month:{month}').scalar() or 0)
    totals['paid_provider']+=int(db.query(func.count(HouseCreditEvent.id)).filter(HouseCreditEvent.feature_key=='paid_provider',HouseCreditEvent.event_type=='spent',HouseCreditEvent.created_at>=datetime.strptime(month+'-01','%Y-%m-%d').replace(tzinfo=timezone.utc)).scalar() or 0)
    # Receipts: OCR provider logged on completed receipts, may exclude failed attempts.
    start=datetime.strptime(month+'-01','%Y-%m-%d').replace(tzinfo=timezone.utc)
    totals['receipt_scan']=db.query(Receipt).filter(Receipt.created_at>=start,Receipt.ocr_provider.isnot(None)).count()
    features.append('receipt_scan')
    # Purchased-credit usage also triggers real inference/provider work.
    # Receipts are already counted from OCR-tagged receipt rows above.
    purchased_spends=dict(db.query(HouseCreditEvent.feature_key,func.count(HouseCreditEvent.id)).filter(
        HouseCreditEvent.event_type=='spent', HouseCreditEvent.created_at>=start,
        HouseCreditEvent.feature_key!='receipt_scan',HouseCreditEvent.feature_key!='paid_provider'
    ).group_by(HouseCreditEvent.feature_key).all())
    for key, count in purchased_spends.items():
        totals[key]=int(totals.get(key,0) or 0)+int(count)
    rows=[]
    for key in features:
        count=int(totals.get(key,0) or 0)
        unit=config.get(key)
        unit=float(unit) if isinstance(unit,(int,float)) and 0<=unit<100 else None
        rows.append({'feature':key,'count':count,'unit_cost_cad':unit,'estimated_cost_cad':round(unit*count,2) if unit is not None else None})
    revenue_cents=int(db.query(func.coalesce(func.sum(HouseCreditEvent.amount_cents),0)).filter(HouseCreditEvent.event_type=='purchase',HouseCreditEvent.created_at>=start).scalar() or 0)
    return {'month':month,'rows':rows,'known_estimated_total_cad':round(sum(r['estimated_cost_cad'] or 0 for r in rows),2),
            'all_costs_configured':all(r['unit_cost_cad'] is not None for r in rows),
            'house_credit_sales_cad':round(revenue_cents/100,2),
            'note':'Not a profit report: provider unit costs are estimates from GHM_ESTIMATED_UNIT_COST_CAD and do not include hosting, Stripe fees, failed attempts, caching, or subscriptions. Reconcile monthly with provider invoices.'}
