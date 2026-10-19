"""Minimal privacy-preserving one-click unsubscribe from optional marketing offers."""
import hashlib
import hmac
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.models import MarketingOptOut, User

router=APIRouter(prefix='/communications',tags=['Communications'])

def token_for_user(user_id:int)->str:
    data=f'ghm-marketing-opt-out:v1:{user_id}'
    signature=hmac.new(settings.secret_key.encode(),data.encode(),hashlib.sha256).hexdigest()
    return f'{user_id}.{signature}'

@router.get('/unsubscribe', response_class=HTMLResponse)
def unsubscribe(token:str='',db:Session=Depends(get_db)):
    try:
        user_id_s,sig=token.split('.',1)
        user_id=int(user_id_s)
    except (ValueError,TypeError):
        raise HTTPException(400,'Invalid unsubscribe link')
    expected=token_for_user(user_id).split('.',1)[1]
    if not hmac.compare_digest(sig,expected):raise HTTPException(400,'Invalid unsubscribe link')
    if db.get(User,user_id):
        record=db.get(MarketingOptOut,user_id)
        if not record:
            record=MarketingOptOut(user_id=user_id,opted_out=True);db.add(record)
        record.opted_out=True;db.commit()
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GHM email preferences</title><body style="margin:8vh auto;max-width:550px;padding:24px;font:18px Arial;background:#f8faf7;color:#163d2d"><h1>Promotional emails stopped</h1><p>Grocery House Manager will no longer send optional promotional offers to this account. Essential account and security messages are unaffected.</p><a href="https://grocery-house-manager.com">Return to GHM</a></body></html>'
