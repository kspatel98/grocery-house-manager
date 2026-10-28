"""Regression: product edit path must not capture /merch/admin/store-controls.

The v152 production route order dispatched PUT /merch/admin/store-controls to
PUT /merch/admin/{product_id}. FastAPI reported a confusing 422 with one invalid
integer and three missing ProductIn fields. This tests the actual HTTP route.
"""
import os
import sys
import types

os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY', 'test-only-secret')
sys.modules.setdefault('stripe', types.ModuleType('stripe'))
try:
    import jose  # noqa: F401
except ModuleNotFoundError:
    # Optional only for running local tests without the complete dependencies.
    fake_deps = types.ModuleType('app.api.deps')
    fake_deps.get_current_user = lambda: None
    fake_deps.require_house_member = lambda *args: None
    sys.modules.setdefault('app.api.deps', fake_deps)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import merch_orders, merch_festivals
from app.db.session import Base, get_db
from app.api.admin import require_admin
from app.models import User, MerchCatalogProduct, MerchStoreControls


def test_public_setting_http_put_does_not_become_product_edit():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as db:
        admin = User(email='merch-admin@example.org')
        db.add(admin)
        db.commit()

        api = FastAPI()
        # Deliberately reproduce the v152 problematic registration sequence.
        # Typed product paths must not shadow the named controls endpoint.
        api.include_router(merch_festivals.router)
        api.include_router(merch_orders.router)
        api.dependency_overrides[get_db] = lambda: db
        api.dependency_overrides[require_admin] = lambda: admin

        client = TestClient(api)
        result = client.put('/merch/admin/store-controls', json={
            'checkout_audience': 'public',
            'pilot_email': '',
            'fulfillment_mode': 'manual',
            'confirm_public_checkout': True,
            'confirm_automatic_supplier_submissions': False,
        })
        assert result.status_code == 200, result.text
        assert result.json()['checkout_audience'] == 'public'
        assert db.get(MerchStoreControls, 1).checkout_audience == 'public'
        status = client.get('/merch/admin/readiness')
        assert status.status_code == 200, status.text
        assert status.json()['checkout_audience'] == 'public'

        # Existing numeric-ID product editing remains backwards compatible.
        product = MerchCatalogProduct(sku='GHM-TOTE-T', name='Testing Tote', category='Bags',
            description='A test product', price_cents_cad=2599, active=False, priority=0)
        db.add(product)
        db.commit()
        updated = client.put(f'/merch/admin/{product.id}', json={
            'sku': 'GHM-TOTE-T', 'name': 'Updated Tote', 'category': 'Bags',
            'description': 'A test product', 'price_cents_cad': 2999,
            'active': False, 'priority': 100,
        })
        assert updated.status_code == 200, updated.text
        assert updated.json()['name'] == 'Updated Tote'
        assert updated.json()['price_cents_cad'] == 2999
        assert db.get(MerchStoreControls, 1).checkout_audience == 'public'
