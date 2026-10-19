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
from app.models import AdminUserOffer, AdminOfferEmailEvent, User, UserFeatureBudget, OwnerProviderBudget, HouseCreditEvent, CreditWalletEvent, House, Receipt, MarketingOptOut
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
    label=(offer.title if offer else '').strip() or {
        'discount':'A personal GHM offer for you',
        'free_access':'Complimentary GHM premium access',
        'announcement':'News from Grocery House Manager'
    }[data.kind]
    subject=(data.subject_override or label).strip()[:170]
    name=(recipient.full_name or 'there').strip().split(' ')[0]
    plan_labels={'basic':'Basic Home','family':'Family Plus','pro':'Household Pro'}
    if offer and offer.offer_kind=='free_plan_access':
        duration=('lifetime' if offer.access_lifetime else f"{offer.access_duration_days} days" if offer.access_duration_days else 'a limited time')
        plan=plan_labels.get(offer.plan_name or '', 'premium')
        detail=f"You have been invited to try {plan} for {duration}, at no subscription charge during the complimentary period."
    elif offer and offer.offer_kind=='discount':
        plan=plan_labels.get(offer.plan_name or '', 'an eligible GHM plan')
        detail=f"A {offer.discount_percent}% discount is available for {plan}. Review the terms, period and eligibility in your account before accepting."
    elif offer:
        detail='A new GHM offer is available for your account. Review its details and eligibility before accepting.'
    else:
        detail={'discount':'There may be subscription offers available in your account. No discount is guaranteed until issued.',
                'free_access':'Explore the premium features and offers available to your account. No complimentary access is guaranteed until issued.',
                'announcement':'Here is an update from the Grocery House Manager team.'}[data.kind]
    deadline=''
    if offer and offer.expires_at:
        date=offer.expires_at
        if date.tzinfo is None:date=date.replace(tzinfo=timezone.utc)
        deadline=f"Offer available until {date.strftime('%B %d, %Y')} (UTC), unless accepted or withdrawn earlier."
    note=(data.custom_note or '').strip()
    preferences=db.get(MarketingOptOut,recipient.id)
    opted_out=bool(preferences and preferences.opted_out)
    footer_role={'GHM Team':'The GHM Team','Founder':'Founder, Grocery House Manager','CEO':'Office of the CEO, Grocery House Manager','Owner':'Owner, Grocery House Manager'}[data.sender_role]
    unsubscribe_url=f"{settings.frontend_url.rstrip('/')}/api/communications/unsubscribe?token={token_for_user(recipient.id)}"
    mailing_address=os.getenv('GHM_BUSINESS_MAILING_ADDRESS','').strip()
    offer_link=f"{settings.frontend_url.rstrip('/')}/profile"
    plain=(f"Hello {name},\n\n{detail}\n"+(f"\n{deadline}\n" if deadline else '')+
           (f"\n{note}\n" if note else '')+
           f"\nView offer details: {offer_link}\n\nWarm regards,\n{footer_role}\nGrocery House Manager | SupremDas Group\n\n"
           f"Need help? support@grocery-house-manager.com\n"+
           (f"Business mailing address: {mailing_address}\n" if mailing_address else '')+
           f"To unsubscribe from marketing: {unsubscribe_url}")
    escaped=lambda x:html.escape(str(x),quote=True)
    logo='https://grocery-house-manager.com/brand/grocery-house-manager-logo.png'
    # Table-based email: predictable rendering across Gmail, Outlook, and mobile.
    extra_note=(f'<tr><td style="padding:3px 34px 20px;color:#334c40;font-size:15px;line-height:1.7">{escaped(note)}</td></tr>' if note else '')
    expiry_row=(f'<tr><td style="padding:0 34px 20px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="padding:13px 16px;border:1px solid #dae6dc;border-radius:9px;background:#f4f8f4;color:#426250;font-size:13px;line-height:1.5"><strong>Offer details:</strong> {escaped(deadline)}</td></tr></table></td></tr>' if deadline else '')
    mail_address_html=('<br>'+escaped(mailing_address) if mailing_address else '')
    markup=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f2f5f1;color:#1c3026;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;color:#f2f5f1;max-height:0;overflow:hidden;opacity:0">{escaped(detail[:100])}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f2f5f1"><tr><td align="center" style="padding:22px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;background:#ffffff;border:1px solid #dce8df;border-radius:15px;overflow:hidden">
<tr><td style="background:#183f2f;padding:20px 30px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:62px;padding-right:12px"><img src="{escaped(logo)}" width="58" height="58" alt="GHM logo" style="display:block;width:58px;height:58px;object-fit:contain;background:#ffffff;border-radius:10px"></td>
<td style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.2">Grocery House Manager<br><span style="font-size:11px;letter-spacing:1.6px;color:#c4e6d1;font-weight:400">A SMARTER WAY TO MANAGE HOME</span></td></tr></table></td></tr>
<tr><td style="padding:30px 34px 8px"><span style="color:#2c7652;font-size:11px;font-weight:700;letter-spacing:1.7px">A PERSONAL INVITATION FROM GHM</span>
<h1 style="font-size:27px;line-height:1.25;color:#173c2c;margin:12px 0 18px;font-weight:700">{escaped(label)}</h1>
<p style="font-size:16px;color:#233b2d;line-height:1.65;margin:0 0 16px">Hello {escaped(name)},</p>
<p style="font-size:16px;color:#233b2d;line-height:1.65;margin:0 0 14px">{escaped(detail)}</p></td></tr>
{expiry_row}{extra_note}
<tr><td style="padding:3px 34px 26px"><a href="{escaped(offer_link)}" style="display:inline-block;padding:15px 22px;background:#26734f;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:9px">Review my GHM offer &rarr;</a>
<p style="font-size:12px;line-height:1.55;color:#557263;margin:13px 0 0">Offers are applied only after you review and accept them in your account. Any applicable conditions are shown before confirmation.</p></td></tr>
<tr><td style="padding:0 34px 27px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-top:1px solid #e2e9e2;padding-top:19px;font-size:14px;line-height:1.7;color:#324e3f">Warm regards,<br><strong style="color:#18412d;font-size:15px">{escaped(footer_role)}</strong><br>Grocery House Manager<br><span style="color:#6c8274;font-size:12px">A service of SupremDas Group</span></td><td align="right" valign="bottom" style="padding-left:10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid #bdd5c4;border-radius:50%;width:76px;height:76px;text-align:center;color:#2d7150;font-size:11px;line-height:1.5;font-weight:bold">GHM<br>CARE<br>TEAM</td></tr></table></td></tr></table></td></tr>
<tr><td style="background:#eef4ee;padding:21px 30px;text-align:center;color:#5c7566;font-size:12px;line-height:1.7">Grocery House Manager &nbsp;&bull;&nbsp; SupremDas Group<br>
{mail_address_html}<br>For support: <a style="color:#286449" href="mailto:support@grocery-house-manager.com">support@grocery-house-manager.com</a><br>
<a href="{escaped(unsubscribe_url)}" style="color:#286449;text-decoration:underline">Unsubscribe from promotional emails</a><br>
<span style="font-size:11px;color:#7a9383;letter-spacing:1px">GHM &bull; SIMPLE HOUSEHOLD LIVING</span></td></tr>
</table></td></tr></table></body></html>'''
    return {'recipient_email':recipient.email,'subject':subject,'text':plain,'html':markup,'sender_role':data.sender_role,'offer_id':offer.id if offer else None,'opted_out':opted_out}

@router.post('/offer-email/preview')
def preview(body:OfferDraft, db:Session=Depends(get_db), admin:User=Depends(require_admin)):
    return compose(db,body)

@router.post('/offer-email/send')
def send(body:OfferSend, db:Session=Depends(get_db), admin:User=Depends(require_admin)):
    if not body.confirm_send or not body.confirm_marketing_permission:
        raise HTTPException(400,'Confirm this specific recipient has consented or you have another valid legal basis, and approve sending.')
    draft=compose(db,body)
    if not os.getenv('GHM_BUSINESS_MAILING_ADDRESS','').strip():
        raise HTTPException(400,'Configure GHM_BUSINESS_MAILING_ADDRESS for commercial email identification before sending promotional offers.')
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
    revenue_cents+=int(db.query(func.coalesce(func.sum(CreditWalletEvent.amount_cents),0)).filter(CreditWalletEvent.event_type.in_(['purchase','direct_purchase']),CreditWalletEvent.created_at>=start).scalar() or 0)
    return {'month':month,'rows':rows,'known_estimated_total_cad':round(sum(r['estimated_cost_cad'] or 0 for r in rows),2),
            'all_costs_configured':all(r['unit_cost_cad'] is not None for r in rows),
            'house_credit_sales_cad':round(revenue_cents/100,2),
            'note':'Not a profit report: provider unit costs are estimates from GHM_ESTIMATED_UNIT_COST_CAD and do not include hosting, Stripe fees, failed attempts, caching, or subscriptions. Reconcile monthly with provider invoices.'}
