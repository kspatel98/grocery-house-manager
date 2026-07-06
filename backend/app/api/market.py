from __future__ import annotations

import requests
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_plan, house_plan_has_smart_market
from app.core.config import settings
from app.db.session import get_db
from app.models import Product, ShoppingList, ShoppingListItem, ShoppingItemStatus, User
from app.schemas import NearbyStoreOut, ShoppingItemSuggestionOut, ShoppingSuggestionsOut
from app.utils.location import common_grocery_chains, currency_for_country, normalize_country

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
