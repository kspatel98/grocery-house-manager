from __future__ import annotations

import requests
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_plan, house_plan_has_smart_market, house_plan_has_product_lookup, house_plan_has_external_price_comparison
from app.core.config import settings
from app.db.session import get_db
from app.models import Product, ShoppingList, ShoppingListItem, ShoppingItemStatus, User
from app.schemas import MarketCapabilitiesOut, NearbyStoreOut, ProductLookupOut, PriceCompareIn, LivePriceCompareOut, ShoppingItemSuggestionOut, ShoppingSuggestionsOut
from app.utils.location import common_grocery_chains, currency_for_country, normalize_country
from app.utils.market_data import SUPPORTED_CANADA_RETAILERS, compare_canadian_grocery_prices, lookup_open_food_facts

router = APIRouter(prefix="/market", tags=["market"])


def store_result_from_place(place: dict) -> NearbyStoreOut:
    display = place.get("displayName") or {}
    name = display.get("text") if isinstance(display, dict) else None
    return NearbyStoreOut(
        name=name or place.get("name") or "Grocery store",
        address=place.get("formattedAddress"),
        rating=place.get("rating"),
        user_ratings_total=place.get("userRatingCount"),
        maps_url=place.get("googleMapsUri"),
        source="google_places",
    )


def fallback_stores(city: str | None, country: str | None) -> list[NearbyStoreOut]:
    label = ", ".join(part for part in [city, country] if part)
    stores: list[NearbyStoreOut] = []
    for chain in common_grocery_chains(country):
        stores.append(
            NearbyStoreOut(
                name=chain,
                address=f"Search {chain} in {label}" if label else None,
                maps_url=f"https://www.google.com/maps/search/{chain.replace(' ', '+')}+{(label or '').replace(' ', '+')}",
                source="city_fallback",
            )
        )
    return stores[:10]


def google_places_text_search(city: str | None, country: str | None, lat: float | None, lng: float | None) -> list[NearbyStoreOut]:
    if not settings.google_places_api_key:
        return []
    location_label = ", ".join(part for part in [city, country] if part)
    payload: dict = {
        "textQuery": f"grocery stores {location_label}".strip(),
        "includedType": "grocery_store",
        "maxResultCount": 10,
    }
    if lat is not None and lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 8000.0,
            }
        }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
    }
    try:
        response = requests.post("https://places.googleapis.com/v1/places:searchText", json=payload, headers=headers, timeout=8)
        response.raise_for_status()
        data = response.json()
        return [store_result_from_place(place) for place in data.get("places", [])]
    except Exception:
        return []


def get_nearby_store_results(user: User, city: str | None, country: str | None, lat: float | None, lng: float | None) -> tuple[str, list[NearbyStoreOut]]:
    city = normalize_country(city) or user.city
    country = normalize_country(country) or user.country
    label = ", ".join(part for part in [city, country] if part) or "your area"
    stores = google_places_text_search(city, country, lat, lng)
    if not stores:
        stores = fallback_stores(city, country)
    return label, stores


@router.get("/capabilities", response_model=MarketCapabilitiesOut)
def market_capabilities(user: User = Depends(get_current_user)):
    return MarketCapabilitiesOut(
        product_lookup_available=True,
        live_price_compare_available=bool(settings.apify_api_token),
        apify_configured=bool(settings.apify_api_token),
        supported_retailers=SUPPORTED_CANADA_RETAILERS,
        message="Market tools are available by plan: Basic Home unlocks product lookup, Family Plus unlocks Canadian price comparison, and Household Pro unlocks nearby store suggestions.",
    )


@router.get("/houses/{house_id}/product-lookup", response_model=ProductLookupOut)
def product_lookup(
    house_id: int,
    barcode: str | None = Query(default=None, max_length=120),
    query: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    if not house_plan_has_product_lookup(db, house_id):
        return ProductLookupOut(
            premium_required=True,
            configured=True,
            message=f"Product lookup is a Basic Home or higher house feature. This house is on the owner's {house_plan.name} plan.",
            results=[],
        )
    if not barcode and not query:
        return ProductLookupOut(message="Enter a barcode or product name to search.", results=[])
    results = lookup_open_food_facts(barcode=barcode, query=query, limit=8)
    if not results:
        return ProductLookupOut(
            premium_required=False,
            configured=True,
            message="No matching product details were found. You can still add the product manually.",
            results=[],
        )
    return ProductLookupOut(
        premium_required=False,
        configured=True,
        message="Product details found. Please review the details before saving them to your inventory.",
        results=results,
    )


@router.post("/houses/{house_id}/price-compare", response_model=LivePriceCompareOut)
def price_compare(
    house_id: int,
    payload: PriceCompareIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    location_parts = [payload.location, payload.postal_code, payload.city, payload.province]
    location = next((str(part).strip() for part in location_parts if part and str(part).strip()), None)
    if payload.city and payload.province and not payload.location and not payload.postal_code:
        location = f"{payload.city}, {payload.province}"
    elif payload.city and not location:
        location = f"{payload.city}, Canada"

    if not house_plan_has_external_price_comparison(db, house_id):
        return LivePriceCompareOut(
            premium_required=True,
            configured=bool(settings.apify_api_token),
            currency_code="CAD",
            location_label=location,
            message=f"Canadian live price comparison is a Family Plus or Household Pro house feature. This house is on the owner's {house_plan.name} plan.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=[],
        )

    items = [item.strip() for item in payload.items if item and item.strip()]
    if payload.product_ids:
        products = db.query(Product).filter(Product.house_id == house_id, Product.id.in_(payload.product_ids)).all()
        existing_names = {item.lower() for item in items}
        for product in products:
            if product.name and product.name.lower() not in existing_names:
                items.append(product.name)

    items = items[: settings.market_max_compare_items]
    if not items:
        return LivePriceCompareOut(
            configured=bool(settings.apify_api_token),
            currency_code="CAD",
            location_label=location,
            message="Choose at least one product or enter item names to compare.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=[],
        )
    if not settings.apify_api_token:
        return LivePriceCompareOut(
            configured=False,
            currency_code="CAD",
            location_label=location,
            message="Live Canadian price comparison is included with this plan, but it is not turned on yet. Please contact support if you need help.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=[],
        )

    try:
        cached, rows = compare_canadian_grocery_prices(
            db,
            items=items,
            location=location or "Canada",
            retailers=payload.retailers,
            force_refresh=payload.force_refresh,
        )
    except Exception as exc:
        return LivePriceCompareOut(
            configured=True,
            cached=False,
            currency_code="CAD",
            location_label=location,
            message="Live price comparison could not be loaded right now. Saved household prices still work. Please try again later.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=[],
        )

    message = "Showing cached Canadian grocery price results." if cached else "Showing latest available Canadian grocery price results. Prices may vary by store, location, loyalty offers, and availability."
    if not rows:
        message = "No live price rows were returned for these items/location. Try fewer items, a postal code, or different supported retailers."
    return LivePriceCompareOut(
        configured=True,
        cached=cached,
        currency_code="CAD",
        location_label=location,
        message=message,
        supported_retailers=SUPPORTED_CANADA_RETAILERS,
        results=rows,
    )


@router.get("/nearby-stores", response_model=ShoppingSuggestionsOut)
def nearby_stores(
    city: str | None = Query(default=None, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    lat: float | None = None,
    lng: float | None = None,
    user: User = Depends(get_current_user),
):
    location_label, stores = get_nearby_store_results(user, city, country, lat, lng)
    return ShoppingSuggestionsOut(
        currency_code=currency_for_country(country or user.country),
        location_label=location_label,
        message="Nearby grocery stores are based on your browser location or saved city. If Google Places is not configured, common city-level grocery chains are shown.",
        nearby_stores=stores,
        item_suggestions=[],
    )


@router.get("/houses/{house_id}/shopping-lists/{list_id}/suggestions", response_model=ShoppingSuggestionsOut)
def shopping_suggestions(
    house_id: int,
    list_id: int,
    city: str | None = Query(default=None, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    lat: float | None = None,
    lng: float | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    if not house_plan_has_smart_market(db, house_id):
        return ShoppingSuggestionsOut(
            currency_code=currency_for_country(country or user.country),
            premium_required=True,
            message=f"Smart nearby store suggestions are a Household Pro house feature. This house is currently on the owner's {house_plan.name} plan.",
            nearby_stores=[],
            item_suggestions=[],
        )

    shopping_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product))
        .filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id)
        .first()
    )
    if not shopping_list:
        return ShoppingSuggestionsOut(
            currency_code=currency_for_country(country or user.country),
            premium_required=False,
            message="Shopping list not found.",
            nearby_stores=[],
            item_suggestions=[],
        )

    location_label, stores = get_nearby_store_results(user, city, country, lat, lng)
    suggestions: list[ShoppingItemSuggestionOut] = []
    for item in shopping_list.items:
        if item.status == ShoppingItemStatus.skipped or not item.product:
            continue
        product = (
            db.query(Product)
            .options(joinedload(Product.store_prices))
            .filter(Product.id == item.product_id, Product.house_id == house_id)
            .first()
        )
        if not product:
            continue
        prices = sorted(product.store_prices or [], key=lambda p: (float(p.price), p.store_name.lower()))
        best = prices[0] if prices else None
        current_price = product.price
        current_store = product.store_name
        savings = None
        if best and current_price is not None:
            savings = round(max(float(current_price) - float(best.price), 0), 2)
        if best:
            message = f"Best known saved price is {best.store_name}."
            if savings and savings > 0:
                message += f" Estimated saving vs current product price: {savings:.2f}."
        else:
            message = "No saved store-price history yet. Upload receipts or save prices to improve suggestions."
        suggestions.append(
            ShoppingItemSuggestionOut(
                product_id=product.id,
                product_name=product.name,
                requested_quantity=item.requested_quantity,
                current_store=current_store,
                current_price=current_price,
                best_known_store=best.store_name if best else None,
                best_known_price=float(best.price) if best else None,
                savings_vs_current=savings,
                message=message,
            )
        )

    return ShoppingSuggestionsOut(
        currency_code=currency_for_country(country or user.country),
        location_label=location_label,
        premium_required=False,
        message="Suggestions combine your household's saved receipt/product prices with nearby grocery store results. Live SKU prices depend on retailer/API availability and are not guaranteed.",
        nearby_stores=stores,
        item_suggestions=suggestions,
    )
