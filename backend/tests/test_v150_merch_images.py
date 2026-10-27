"""No network, DB or live supplier needed for admin merchandise image uploads."""
import asyncio
import io
import os

os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY', 'test-only-secret')

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError
from app.api.merch_festivals import ProductIn, admin_upload_merch_image
from app.core.config import settings


def make_file(kind='PNG', size=(100, 80), media='image/png'):
    data=io.BytesIO()
    Image.new('RGB', size, color=(44, 145, 200)).save(data, format=kind)
    return UploadFile(file=io.BytesIO(data.getvalue()), filename='untrusted.png', headers={'content-type': media})


def test_upload_image_converts_to_safe_webp_and_reuses_public_url(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    output=asyncio.run(admin_upload_merch_image(file=make_file(),_=None))
    assert output['url'].startswith('/uploads/merch/')
    file=tmp_path / output['url'].removeprefix('/uploads/')
    assert file.is_file()
    with Image.open(file) as photo:
        assert photo.format=='WEBP' and photo.size == (100, 80)
    ProductIn(sku='GHM-TOTE',name='Cotton Tote',image_url=output['url'],price_cents_cad=2999)


def test_upload_rejects_unsafe_images(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'upload_dir', str(tmp_path))
    file=UploadFile(file=io.BytesIO(b'<script>alert(1)</script>'), filename='evil.png',headers={'content-type':'image/png'})
    with pytest.raises(HTTPException) as bad:
        asyncio.run(admin_upload_merch_image(file=file,_=None))
    assert bad.value.status_code==400

    file=UploadFile(file=io.BytesIO(b'a'* (5*1024*1024+1)), filename='large.jpg',headers={'content-type':'image/jpeg'})
    with pytest.raises(HTTPException) as large:
        asyncio.run(admin_upload_merch_image(file=file,_=None))
    assert large.value.status_code==413

    file=UploadFile(file=io.BytesIO(b'msg'), filename='doc.svg',headers={'content-type':'image/svg+xml'})
    with pytest.raises(HTTPException) as forbidden:
        asyncio.run(admin_upload_merch_image(file=file,_=None))
    assert forbidden.value.status_code==415


def test_merch_image_url_rejects_javascript_or_outside_paths():
    for url in ('javascript:alert(1)', '/uploads/../secret.txt', 'http://site.example/test.jpg'):
        with pytest.raises(ValidationError):
            ProductIn(sku='GHM-TOTE',name='Cotton Tote',image_url=url,price_cents_cad=2999)
