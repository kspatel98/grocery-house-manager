"""V139: bounded rescue read and no fabricated grocery rows."""
import os
from io import BytesIO
from unittest.mock import Mock
os.environ.setdefault('DATABASE_URL','sqlite:///./test-v139.db')
os.environ.setdefault('SECRET_KEY','test-key')
from PIL import Image
from app.utils import grocery_image_scan as vision


def test_scan_second_look_only_when_zero_items(monkeypatch):
    monkeypatch.setattr(vision, 'vision_configured', lambda: True)
    monkeypatch.setattr(vision, 'image_data_uri', lambda *args: 'data:image/jpeg;base64,test')
    responses = [
        {'choices':[{'message':{'content':'{"items":[],"warnings":[]}'}}]},
        {'choices':[{'message':{'content':'{"items":[{"name":"Carrots","quantity":null,"unit":"pcs","category":"Vegetables","confidence":0.9}],"warnings":[]}'}}]},
    ]
    calls=[]
    def post(url, **kwargs):
        calls.append(kwargs)
        response=Mock()
        response.json.return_value=responses[len(calls)-1]
        return response
    monkeypatch.setattr(vision.requests, 'post', post)
    result=vision.recognize_grocery_image(b'first', 'written_list', b'original')
    assert len(calls)==2
    assert result['items'][0]['name']=='Carrots'
    assert result['items'][0]['quantity'] is None
    assert result['items'][0]['needs_review']


def test_success_does_not_trigger_second_paid_call(monkeypatch):
    monkeypatch.setattr(vision,'vision_configured',lambda:True)
    monkeypatch.setattr(vision,'image_data_uri',lambda *args:'data:image/jpeg;base64,test')
    calls=[]
    def post(*args,**kwargs):
        calls.append(1)
        reply=Mock()
        reply.json.return_value={'choices':[{'message':{'content':'{"items":[{"name":"Potatoes","quantity":null}],"warnings":[]}'}}]}
        return reply
    monkeypatch.setattr(vision.requests,'post',post)
    result=vision.recognize_grocery_image(b'first','written_list',b'original')
    assert len(calls)==1
    assert result['items'][0]['name']=='Potatoes'
