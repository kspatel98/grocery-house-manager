import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:///./trip-price-safety-test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models import ExternalPriceCache
from app.utils import market_data
from app.api.insights import _convert_quantity, _live_effective_unit_price, _live_row_matches, _quantity_warning


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
    def json(self):
        return self._payload
    def raise_for_status(self):
        return None


def _session():
    engine = create_engine("sqlite:///:memory:")
    ExternalPriceCache.__table__.create(engine)
    return sessionmaker(bind=engine)()


def test_shared_product_cache_reuses_same_fsa_across_baskets(monkeypatch):
    db = _session()
    monkeypatch.setattr(settings, "apify_api_token", "test-token")
    monkeypatch.setattr(settings, "market_max_compare_items", 15)
    calls = []

    def fake_post(url, **kwargs):
        queries = list(kwargs["json"]["items"])
        calls.append(queries)
        return FakeResponse([
            {"query": q, "retailer": "Loblaws", "matched_product": q, "price": 3.99, "package_size": "1 kg"}
            for q in queries
        ])

    monkeypatch.setattr(market_data.requests, "post", fake_post)

    cached, rows = market_data.compare_canadian_grocery_prices(
        db, items=["Milk", "Eggs"], location="L9C 3M4", postal_code="L9C 3M4"
    )
    assert cached is False
    assert calls == [["Milk", "Eggs"]]
    assert len(rows) == 2

    cached, rows = market_data.compare_canadian_grocery_prices(
        db, items=["Milk", "Bananas"], location="L9C 7A1", postal_code="L9C 7A1"
    )
    assert cached is False  # Bananas required one new provider batch.
    assert calls[-1] == ["Bananas"]
    assert len(calls) == 2
    assert len(rows) == 2

    cached, rows = market_data.compare_canadian_grocery_prices(
        db, items=["Milk"], location="L9C 9Z9", postal_code="L9C 9Z9", force_refresh=True
    )
    assert cached is True
    assert len(calls) == 2  # valid cache is never repurchased by refresh or another user
    assert len(rows) == 1


def test_recipe_unit_conversion_and_live_package_math():
    assert _convert_quantity(250, "g", "kg") == 0.25
    assert _convert_quantity(750, "ml", "L") == 0.75

    product = SimpleNamespace(name="Bananas", unit="kg")
    item = SimpleNamespace(product=product, requested_quantity=0.25)
    unit_row = SimpleNamespace(sale_price=None, price=2.99, unit_price="$1.69/kg", package_size="1 kg", matched_product_name="Bananas")
    assert round(_live_effective_unit_price(item, unit_row), 2) == 1.69

    package_row = SimpleNamespace(sale_price=None, price=2.99, unit_price=None, package_size="1 kg", matched_product_name="Bananas 1 kg")
    # One package costs $2.99 for the requested 0.25 kg, so effective per requested kg is 11.96.
    assert round(_live_effective_unit_price(item, package_row), 2) == 11.96


def test_absurd_quantity_is_blocked_before_provider_spend():
    product = SimpleNamespace(name="Bananas", unit="kg")
    item = SimpleNamespace(product=product, requested_quantity=250)
    warning = _quantity_warning(item)
    assert warning and "unusually large" in warning


def test_live_identity_uses_matched_product_not_echoed_query():
    wrong = SimpleNamespace(item="Milk", matched_product_name="Orange Juice 1.75 L", match_confidence="high")
    right = SimpleNamespace(item="Milk", matched_product_name="Neilson 2% Milk 4 L", match_confidence="high")
    assert _live_row_matches("Milk", wrong) is False
    assert _live_row_matches("Milk", right) is True
