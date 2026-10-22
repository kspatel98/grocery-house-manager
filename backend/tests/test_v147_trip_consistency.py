"""Regression checks for response contracts added in V147."""
from app.schemas import BasketComparisonOut, BasketPricedItemOut, BasketStoreOptionOut


def test_store_results_include_evidence():
    row = BasketPricedItemOut(name='Milk', quantity=2, unit='L', unit_price=3.5,
                              line_total=7, source='live')
    store = BasketStoreOptionOut(store_name='Example Grocery', priced_products=[row],
                                 priced_items=1, total_items=1, known_total=7)
    assert store.priced_products[0].line_total == 7
    assert store.address is None  # Unknown store addresses cannot be fabricated.


def test_unsupported_country_is_explicit():
    response = BasketComparisonOut(country_supported=False, message='Not supported', list_id=3,
                                   list_title='Groceries')
    assert response.country_supported is False
