import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./provider-adapter-test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from app.core.config import settings
from app.utils import external_providers as providers


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_upcdatabase_barcode_lookup(monkeypatch):
    monkeypatch.setattr(settings, "upcdatabase_api_key", "test-token")

    def fake_get(url, **kwargs):
        assert url.endswith("/product/012345678905")
        assert kwargs["headers"]["Authorization"] == "Bearer test-token"
        return FakeResponse({
            "success": True,
            "barcode": "012345678905",
            "title": "Test Oat Milk",
            "brand": "GHM Test",
            "category": "Food",
            "metadata": {"size": "946 ml"},
            "images": ["https://example.test/oat.jpg"],
        })

    monkeypatch.setattr(providers.requests, "get", fake_get)
    rows = providers.lookup_upcdatabase(barcode="012345678905")
    assert len(rows) == 1
    assert rows[0].source == "upcdatabase"
    assert rows[0].name == "Test Oat Milk"
    assert rows[0].barcode == "012345678905"


def test_geoapify_nearby_store_normalization(monkeypatch):
    monkeypatch.setattr(settings, "geoapify_api_key", "geo-test")

    def fake_get(url, **kwargs):
        assert url.endswith("/v2/places")
        assert kwargs["params"]["categories"] == "commercial.supermarket"
        return FakeResponse({
            "features": [
                {"properties": {"name": "FreshCo", "formatted": "123 Test St, Hamilton, ON", "lat": 43.2, "lon": -79.8}},
                {"properties": {"name": "No Frills", "formatted": "456 Test Ave, Hamilton, ON", "lat": 43.21, "lon": -79.81}},
            ]
        })

    monkeypatch.setattr(providers.requests, "get", fake_get)
    stores = providers.geoapify_nearby_stores(city="Hamilton", country="Canada", lat=43.25, lng=-79.87, limit=5)
    assert [store.name for store in stores] == ["FreshCo", "No Frills"]
    assert stores[0].source == "geoapify"
    assert "openstreetmap.org" in (stores[0].maps_url or "")


def test_instacart_shopping_link_uses_measurements_and_no_pantry_flag(monkeypatch):
    monkeypatch.setattr(settings, "instacart_api_key", "keys.test")
    monkeypatch.setattr(settings, "instacart_environment", "development")
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs["json"]
        return FakeResponse({"products_link_url": "https://instacart.test/list/abc"})

    monkeypatch.setattr(providers.requests, "post", fake_post)
    result = providers.create_instacart_shopping_list_link(
        title="Weekend groceries",
        items=[
            {"name": "Milk", "quantity": 2, "unit": "pcs", "barcode": "111111111111", "brand": "Test"},
            {"name": "Milk backup", "quantity": 1, "unit": "pcs", "barcode": "111111111111"},
            {"name": "Rice", "quantity": 2, "unit": "kg"},
        ],
        linkback_url="https://grocery-house-manager.com/houses/1/shopping",
    )
    assert result == "https://instacart.test/list/abc"
    payload = captured["json"]
    assert payload["link_type"] == "shopping_list"
    assert payload["line_items"][0]["line_item_measurements"] == [{"quantity": 2.0, "unit": "each"}]
    assert payload["line_items"][2]["line_item_measurements"] == [{"quantity": 2.0, "unit": "kilogram"}]
    assert payload["line_items"][0]["upcs"] == ["111111111111"]
    assert "upcs" not in payload["line_items"][1]
    assert payload["landing_page_configuration"] == {
        "partner_linkback_url": "https://grocery-house-manager.com/houses/1/shopping"
    }


def test_instacart_nearby_retailers_canada(monkeypatch):
    monkeypatch.setattr(settings, "instacart_api_key", "keys.test")
    monkeypatch.setattr(settings, "instacart_environment", "production")

    def fake_get(url, **kwargs):
        assert url.startswith("https://connect.instacart.com/")
        assert kwargs["params"] == {"postal_code": "L9C3M4", "country_code": "CA"}
        return FakeResponse({"retailers": [{"retailer_key": "freshco", "name": "FreshCo", "retailer_logo_url": "https://example.test/logo.png"}]})

    monkeypatch.setattr(providers.requests, "get", fake_get)
    rows = providers.instacart_nearby_retailers("L9C 3M4", "CA")
    assert rows == [{"retailer_key": "freshco", "name": "FreshCo", "retailer_logo_url": "https://example.test/logo.png"}]
