from __future__ import annotations

from datetime import datetime, timedelta, timezone
import requests
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_plan, house_plan_has_smart_market, house_plan_has_product_lookup, house_plan_has_external_price_comparison
from app.core.config import settings
from app.db.session import get_db
from app.models import Product, ProductStorePrice, ShoppingList, ShoppingListItem, ShoppingItemStatus, User
from app.schemas import MarketCapabilitiesOut, NearbyStoreOut, ProductLookupOut, PriceCompareIn, LivePriceCompareOut, LivePriceResultOut, ShoppingItemSuggestionOut, ShoppingSuggestionsOut
from app.utils.location import common_grocery_chains, currency_for_country, normalize_country
from app.utils.market_data import SUPPORTED_CANADA_RETAILERS, compare_canadian_grocery_prices, lookup_open_food_facts, lookup_store_product, normalize_canadian_postal_code, safe_market_error, supported_product_lookup_stores, store_lookup_search_status

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
    connected = bool(settings.apify_api_token)
    return MarketCapabilitiesOut(
        product_lookup_available=True,
        live_price_compare_available=connected,
        apify_configured=connected,
        live_price_status="connected" if connected else "not_connected",
        supported_retailers=SUPPORTED_CANADA_RETAILERS,
        message=f"Product lookup is available by plan. Store-specific lookup supports: {', '.join(supported_product_lookup_stores())}. {' '.join(store_lookup_search_status())} Canadian live price comparison works best with a Canadian postal code.",
    )


@router.get("/houses/{house_id}/product-lookup", response_model=ProductLookupOut)
def product_lookup(
    house_id: int,
    barcode: str | None = Query(default=None, max_length=120),
    query: str | None = Query(default=None, max_length=120),
    store_name: str | None = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    store_filter = (store_name or "").strip()
    if not house_plan_has_product_lookup(db, house_id):
        return ProductLookupOut(
            premium_required=True,
            configured=True,
            store_filter=store_filter or None,
            message=f"Product lookup is a Basic Home or higher house feature. This house is on the owner's {house_plan.name} plan.",
            results=[],
        )
    if not barcode and not query:
        return ProductLookupOut(store_filter=store_filter or None, message="Enter a barcode, store item number, or product name to search.", results=[])

    if store_filter:
        store_key, display_store, results, details = lookup_store_product(store_name=store_filter, product_id=barcode, query=query, limit=8)
        if store_key is None:
            return ProductLookupOut(
                premium_required=False,
                configured=True,
                store_filter=store_filter,
                lookup_status="Store not supported",
                lookup_details=details or store_lookup_search_status(),
                message=f"Store lookup is not ready for {store_filter} yet. Supported stores: {', '.join(supported_product_lookup_stores())}. Remove the store name to search the universal product database.",
                results=[],
            )
        if not results:
            return ProductLookupOut(
                premium_required=False,
                configured=True,
                store_filter=display_store,
                lookup_status="No official product found",
                lookup_details=details,
                message=f"No official {display_store} product page was found for that number/name. Check the Lookup check details below, or remove the store name to search the universal product database.",
                results=[],
            )
        has_confirmed_product = any(getattr(item, "found", True) for item in results)
        if not has_confirmed_product:
            return ProductLookupOut(
                premium_required=False,
                configured=True,
                store_filter=display_store,
                lookup_status="Store search opened",
                lookup_details=details,
                message=f"I could not read product details automatically from {display_store}. Open the official store search link below, then add the product manually after confirming the details.",
                results=results,
            )
        return ProductLookupOut(
            premium_required=False,
            configured=True,
            store_filter=display_store,
            lookup_status="Official store result found",
            lookup_details=details,
            message=f"Official {display_store} product result found. Open the product page to confirm size, price, and availability before adding it to inventory.",
            results=results,
        )

    results = lookup_open_food_facts(barcode=barcode, query=query, limit=8)
    if not results:
        return ProductLookupOut(
            premium_required=False,
            configured=True,
            store_filter=None,
            message="No matching product details were found. You can still add the product manually.",
            results=[],
        )
    return ProductLookupOut(
        premium_required=False,
        configured=True,
        store_filter=None,
        message="Product details found from the universal database. Please review before saving to inventory.",
        results=results,
    )


def _reverse_geocode_postal_code(lat: float | None, lng: float | None) -> tuple[str | None, str | None, str | None]:
    if lat is None or lng is None or not settings.google_places_api_key:
        return None, None, None
    try:
        response = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lng}", "key": settings.google_places_api_key, "result_type": "postal_code"},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        for result in data.get("results") or []:
            postal = city = province = None
            for component in result.get("address_components") or []:
                types = component.get("types") or []
                if "postal_code" in types:
                    postal = component.get("long_name")
                elif "locality" in types:
                    city = component.get("long_name")
                elif "administrative_area_level_1" in types:
                    province = component.get("short_name") or component.get("long_name")
            if postal:
                return normalize_canadian_postal_code(postal), city, province
    except Exception:
        return None, None, None
    return None, None, None


def _profile_location_label(user: User, city: str | None = None, province: str | None = None) -> str:
    parts = [city or user.city, province, user.country or "Canada"]
    return ", ".join(str(part).strip() for part in parts if part and str(part).strip()) or "Canada"


def _recent_saved_price_rows(db: Session, house_id: int, items: list[str], *, max_age_days: int = 21) -> list[LivePriceResultOut]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=max_age_days)
    rows: list[LivePriceResultOut] = []
    seen: set[str] = set()
    for item in items:
        term = item.strip()
        if not term:
            continue
        pattern = f"%{term}%"
        price = (
            db.query(ProductStorePrice)
            .join(Product, Product.id == ProductStorePrice.product_id)
            .filter(
                ProductStorePrice.house_id == house_id,
                Product.name.ilike(pattern),
                or_(
                    ProductStorePrice.recorded_at >= cutoff,
                    ProductStorePrice.source.in_(["manual", "saved", "live_compare", "apify_canada"]),
                ),
            )
            .order_by(ProductStorePrice.price.asc(), ProductStorePrice.recorded_at.desc())
            .first()
        )
        if not price or not price.product:
            continue
        key = f"{term.lower()}::{price.product_id}::{price.store_name.lower()}"
        if key in seen:
            continue
        seen.add(key)
        is_recent_receipt = str(price.source or "").startswith("receipt") and price.recorded_at and (price.recorded_at if price.recorded_at.tzinfo else price.recorded_at.replace(tzinfo=timezone.utc)) >= cutoff
        source_label = "recent_receipt" if is_recent_receipt else "saved_price"
        confidence = "Saved" if is_recent_receipt else "Saved history"
        rows.append(LivePriceResultOut(
            item=term,
            retailer=None,
            banner=price.store_name,
            store_name=price.store_name,
            store_address=None,
            matched_product_name=price.product.name,
            price=float(price.price),
            unit_price=f"per {price.product.unit}" if price.product.unit else None,
            match_confidence=confidence,
            confidence_explanation=(
                "This price came from a receipt dated within the last 3 weeks."
                if is_recent_receipt else
                "This price came from your saved household price history. Review before relying on it."
            ),
            scraped_at=price.recorded_at,
            raw_source=source_label,
        ))
    return rows


@router.post("/houses/{house_id}/price-compare", response_model=LivePriceCompareOut)
def price_compare(
    house_id: int,
    payload: PriceCompareIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)

    postal_code = normalize_canadian_postal_code(payload.postal_code or payload.location)
    resolved_city = payload.city
    resolved_province = payload.province
    if not postal_code and payload.lat is not None and payload.lng is not None:
        postal_code, geocode_city, geocode_province = _reverse_geocode_postal_code(payload.lat, payload.lng)
        resolved_city = resolved_city or geocode_city
        resolved_province = resolved_province or geocode_province
    location_label = postal_code or _profile_location_label(user, resolved_city, resolved_province)

    items = [item.strip() for item in payload.items if item and item.strip()]
    if payload.product_ids:
        products = db.query(Product).filter(Product.house_id == house_id, Product.id.in_(payload.product_ids)).all()
        existing_names = {item.lower() for item in items}
        for product in products:
            if product.name and product.name.lower() not in existing_names:
                items.append(product.name)
    items = items[: settings.market_max_compare_items]

    if not house_plan_has_external_price_comparison(db, house_id):
        fallback = _recent_saved_price_rows(db, house_id, items) if items else []
        return LivePriceCompareOut(
            premium_required=True,
            configured=bool(settings.apify_api_token),
            connection_status="connected" if settings.apify_api_token else "not_connected",
            currency_code="CAD",
            location_label=location_label,
            used_fallback=bool(fallback),
            message=f"Canadian live price comparison is a Family Plus or Household Pro house feature. This house is on the owner's {house_plan.name} plan. Saved household prices are shown when available.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=fallback,
        )

    if not items:
        return LivePriceCompareOut(
            configured=bool(settings.apify_api_token),
            connection_status="connected" if settings.apify_api_token else "not_connected",
            currency_code="CAD",
            location_label=location_label,
            message="Choose at least one product or enter item names to compare.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=[],
        )

    fallback_rows = _recent_saved_price_rows(db, house_id, items)
    if not settings.apify_api_token:
        return LivePriceCompareOut(
            configured=False,
            connection_status="not_connected",
            currency_code="CAD",
            location_label=location_label,
            failure_reason="APIFY_API_TOKEN is missing on the backend server.",
            used_fallback=bool(fallback_rows),
            message="Live Canadian price comparison is not connected yet. Showing saved receipt/inventory prices when available.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=fallback_rows,
        )

    try:
        cached, rows = compare_canadian_grocery_prices(
            db,
            items=items,
            location=location_label,
            postal_code=postal_code,
            retailers=payload.retailers,
            force_refresh=payload.force_refresh,
        )
    except Exception as exc:
        reason = safe_market_error(exc)
        return LivePriceCompareOut(
            configured=True,
            cached=False,
            connection_status="connected",
            currency_code="CAD",
            location_label=location_label,
            failure_reason=reason,
            used_fallback=bool(fallback_rows),
            message="Live price comparison could not be loaded. Showing saved receipt/inventory prices when available.",
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=fallback_rows,
        )

    if rows:
        message = "Showing cached Canadian grocery price results." if cached else "Showing latest available Canadian grocery price results for the selected postal code."
        return LivePriceCompareOut(
            configured=True,
            cached=cached,
            connection_status="connected",
            currency_code="CAD",
            location_label=location_label,
            message=message,
            supported_retailers=SUPPORTED_CANADA_RETAILERS,
            results=rows,
        )

    return LivePriceCompareOut(
        configured=True,
        cached=False,
        connection_status="connected",
        currency_code="CAD",
        location_label=location_label,
        used_fallback=bool(fallback_rows),
        failure_reason="The live provider returned no rows for this basket/postal code.",
        message="No live price rows were returned for this postal code. Showing saved receipt/inventory prices when available.",
        supported_retailers=SUPPORTED_CANADA_RETAILERS,
        results=fallback_rows,
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
        message="Nearby grocery stores are based on your browser location or saved city. When exact map results are unavailable, common grocery chains for your area are shown.",
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
        now = datetime.now(timezone.utc)
        recent_cutoff = now - timedelta(days=21)
        def aware(value):
            if value is None:
                return None
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        receipt_prices = [price for price in (product.store_prices or []) if str(price.source or "").startswith("receipt") and aware(price.recorded_at) and aware(price.recorded_at) >= recent_cutoff]
        prices = sorted(receipt_prices or (product.store_prices or []), key=lambda p: (float(p.price), p.store_name.lower()))
        best = prices[0] if prices else None
        current_price = product.price
        current_store = product.store_name
        savings = None
        source_label = None
        freshness_label = None
        if best and current_price is not None:
            savings = round(max(float(current_price) - float(best.price), 0), 2)
        if best:
            best_recorded = aware(best.recorded_at)
            if str(best.source or "").startswith("receipt") and best_recorded and best_recorded >= recent_cutoff:
                source_label = "Last receipt"
                days = max((now - best_recorded).days, 0)
                freshness_label = "today" if days == 0 else f"{days}d ago"
            elif str(best.source or "").startswith("apify") or str(best.source or "").startswith("live"):
                source_label = "Live compare"
                freshness_label = "latest available"
            else:
                source_label = "Saved price"
                freshness_label = "saved"
            message = f"Suggested store: {best.store_name} at {float(best.price):.2f}. Source: {source_label}."
            if savings and savings > 0:
                message += f" Save about {savings:.2f} vs current product price."
        else:
            message = "No recent receipt price yet. Upload a receipt or use live comparison to improve suggestions."
        suggestions.append(
            ShoppingItemSuggestionOut(
                product_id=product.id,
                product_name=product.name,
                requested_quantity=item.requested_quantity,
                current_store=current_store,
                current_price=current_price,
                best_known_store=best.store_name if best else None,
                best_known_price=float(best.price) if best else None,
                best_known_source=source_label,
                best_known_recorded_at=best.recorded_at if best else None,
                freshness_label=freshness_label,
                savings_vs_current=savings,
                message=message,
            )
        )

    return ShoppingSuggestionsOut(
        currency_code=currency_for_country(country or user.country),
        location_label=location_label,
        premium_required=False,
        message="Suggestions combine your household's saved receipt/product prices with nearby grocery store results. Live product prices depend on retailer data availability and are not guaranteed.",
        nearby_stores=stores,
        item_suggestions=suggestions,
    )
