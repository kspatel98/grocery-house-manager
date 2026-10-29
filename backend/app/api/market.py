from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import requests
from fastapi import APIRouter, Depends, Query, Header, UploadFile, File, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_plan, house_plan_has_smart_market, house_plan_has_product_lookup, house_plan_has_external_price_comparison, premium_try_can_start, get_house_owner, complete_premium_try
from app.core.config import settings
from app.db.session import get_db
from app.models import ExternalPriceCache, Product, ProductStorePrice, ShoppingList, ShoppingListItem, ShoppingItemStatus, User
from app.schemas import FlyerDealsOut, FlyerMerchantOut, FlyerMerchantsOut, InstacartShoppingLinkOut, MarketCapabilitiesOut, NearbyStoreOut, ProductLookupOut, PriceCompareIn, LivePriceCompareOut, LivePriceResultOut, ShoppingItemSuggestionOut, ShoppingSuggestionsOut
from app.utils.location import common_grocery_chains, currency_for_country, normalize_country
from app.utils.provider_budget import consume_house_provider_run
from app.utils.feature_quota import consume_feature_call
from app.utils.flyer_data import discover_weekly_flyer_merchants, get_weekly_flyer_deals
from app.utils.market_data import SUPPORTED_CANADA_RETAILERS, compare_canadian_grocery_prices, lookup_open_food_facts, lookup_store_product, normalize_canadian_postal_code, safe_market_error, supported_product_lookup_stores, store_lookup_search_status
from app.utils.external_providers import create_instacart_shopping_list_link, geoapify_find_store, geoapify_nearby_stores, geoapify_reverse_postal, instacart_is_configured, instacart_nearby_retailers, lookup_upcdatabase, upcdatabase_is_configured
from app.utils.product_identity import lookup_serper_product_identity, rank_and_merge_identity_results

router = APIRouter(prefix="/market", tags=["market"])


def _charge_apify_if_needed(db: Session, house_id: int, user: User, premium_try_feature: str | None, feature_name: str) -> bool:
    if premium_try_can_start(db, house_id, user, feature_name, premium_try_feature):
        return True
    return consume_house_provider_run(house_id, actor_id=user.id)



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




def _merchant_match(left: str | None, right: str | None) -> bool:
    def clean(value: str | None) -> str:
        return " ".join(re.sub(r"[^\w]+", " ", (value or "").casefold(), flags=re.UNICODE).split())
    a, b = clean(left), clean(right)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def _flyer_store_cache_key(postal_code: str, merchant: str) -> str:
    raw = f"{postal_code.replace(' ', '').upper()}|{merchant.casefold().strip()}"
    return "flyer_store_location:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _maps_search_url(merchant: str, postal_code: str) -> str:
    from urllib.parse import quote_plus
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(f'{merchant} {postal_code} Canada')}"


def resolve_flyer_store_location(db: Session, merchant: str, postal_code: str) -> NearbyStoreOut:
    """Resolve the nearest branch separately from the flyer region.

    Flipp flyer rows are postal/region scoped and do not guarantee a branch address. This helper
    therefore labels Google Places results as the nearest retailer location, never as the issuing
    branch. Results are cached for 30 days because physical store addresses change infrequently.
    """
    fallback = NearbyStoreOut(
        name=merchant,
        address=None,
        maps_url=_maps_search_url(merchant, postal_code),
        source="maps_search",
    )
    key = _flyer_store_cache_key(postal_code, merchant)
    now = datetime.now(timezone.utc)
    existing = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key).first()
    if existing:
        expires = existing.expires_at if existing.expires_at.tzinfo else existing.expires_at.replace(tzinfo=timezone.utc)
        if expires > now:
            try:
                payload = json.loads(existing.payload_json)
                return NearbyStoreOut(**payload)
            except Exception:
                pass
    if not settings.google_places_api_key:
        geo = geoapify_find_store(merchant, postal_code)
        return geo or fallback
    payload = {
        "textQuery": f"{merchant} near {postal_code}, Canada",
        "maxResultCount": 3,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
    }
    resolved = fallback
    try:
        response = requests.post("https://places.googleapis.com/v1/places:searchText", json=payload, headers=headers, timeout=8)
        response.raise_for_status()
        places = response.json().get("places", [])
        if places:
            # Prefer a result whose displayed name contains the flyer merchant.
            place = next((item for item in places if _merchant_match(merchant, ((item.get("displayName") or {}).get("text") if isinstance(item.get("displayName"), dict) else None))), places[0])
            resolved = store_result_from_place(place)
    except Exception:
        resolved = fallback
    cache_payload = resolved.model_dump()
    if existing:
        existing.source = "google_places_flyer_store"
        existing.query = merchant
        existing.location = postal_code
        existing.payload_json = json.dumps(cache_payload, default=str)
        existing.fetched_at = now
        existing.expires_at = now + timedelta(days=30)
    else:
        db.add(ExternalPriceCache(
            cache_key=key, source="google_places_flyer_store", query=merchant, location=postal_code,
            payload_json=json.dumps(cache_payload, default=str), fetched_at=now, expires_at=now + timedelta(days=30),
        ))
    db.commit()
    return resolved


def _apply_flyer_store_locations(db: Session, postal_code: str, deals):
    locations: dict[str, NearbyStoreOut] = {}
    for merchant in sorted({deal.merchant for deal in deals if getattr(deal, "merchant", None)}):
        locations[merchant] = resolve_flyer_store_location(db, merchant, postal_code)
    for deal in deals:
        location = locations.get(deal.merchant)
        if not location:
            continue
        deal.store_name = location.name
        deal.store_address = location.address
        deal.store_maps_url = location.maps_url
        deal.store_location_source = location.source
    return deals

def get_nearby_store_results(user: User, city: str | None, country: str | None, lat: float | None, lng: float | None, postal_code: str | None = None) -> tuple[str, list[NearbyStoreOut]]:
    city = normalize_country(city) or user.city
    country = normalize_country(country) or user.country
    label = ", ".join(part for part in [city, country] if part) or (postal_code or "your area")

    # Prefer exact place/location providers. Google Places remains supported for existing
    # deployments; Geoapify is the lower-cost fallback. Instacart contributes nearby
    # retailer banners when a Canadian postal code is available, but not branch addresses.
    stores = google_places_text_search(city, country, lat, lng)
    if not stores:
        stores = geoapify_nearby_stores(city=city, country=country, lat=lat, lng=lng)

    clean_postal = normalize_canadian_postal_code(postal_code)
    if clean_postal and instacart_is_configured():
        try:
            banners = instacart_nearby_retailers(clean_postal, "CA")
        except Exception:
            banners = []
        existing_names = {store.name.casefold() for store in stores}
        for banner in banners:
            name = (banner.get("name") or "").strip()
            if name and name.casefold() not in existing_names:
                stores.append(NearbyStoreOut(name=name, address=f"Available near {clean_postal}", source="instacart_marketplace"))
                existing_names.add(name.casefold())

    if not stores:
        stores = fallback_stores(city, country)
    return label, stores[:12]


def _product_lookup_cache_key(store_name: str | None, barcode: str | None, query: str | None) -> str:
    store = " ".join((store_name or "universal").casefold().split())
    term = " ".join((barcode or query or "").casefold().split())
    raw = f"{store}|{term}"
    return "product_lookup:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def _read_product_lookup_cache(db: Session, store_name: str | None, barcode: str | None, query: str | None) -> ProductLookupOut | None:
    key = _product_lookup_cache_key(store_name, barcode, query)
    row = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key).first()
    if not row:
        return None
    now = datetime.now(timezone.utc)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires <= now:
        return None
    try:
        payload = json.loads(row.payload_json)
        payload["cached"] = True
        payload["cache_valid_until"] = expires.isoformat()
        result = ProductLookupOut(**payload)
        if result.message and "cached" not in result.message.casefold():
            result.message = f"{result.message} Reused from cache to avoid another paid/external lookup."
        return result
    except Exception:
        return None


def _write_product_lookup_cache(
    db: Session,
    *,
    store_name: str | None,
    barcode: str | None,
    query: str | None,
    result: ProductLookupOut,
) -> ProductLookupOut:
    key = _product_lookup_cache_key(store_name, barcode, query)
    now = datetime.now(timezone.utc)
    ttl_hours = settings.product_lookup_store_cache_hours if store_name else settings.product_lookup_universal_cache_hours
    expires = now + timedelta(hours=max(1, ttl_hours))
    payload = result.model_dump(mode="json")
    payload["cached"] = False
    payload["cache_valid_until"] = expires.isoformat()
    existing = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == key).first()
    if existing:
        existing.source = "product_lookup_store" if store_name else "product_lookup_universal"
        existing.query = barcode or query or ""
        existing.location = None
        existing.retailers = store_name or None
        existing.payload_json = json.dumps(payload, default=str)
        existing.fetched_at = now
        existing.expires_at = expires
    else:
        db.add(ExternalPriceCache(
            cache_key=key,
            source="product_lookup_store" if store_name else "product_lookup_universal",
            query=barcode or query or "",
            location=None,
            retailers=store_name or None,
            payload_json=json.dumps(payload, default=str),
            fetched_at=now,
            expires_at=expires,
        ))
    db.commit()
    result.cached = False
    result.cache_valid_until = expires
    return result


@router.get("/capabilities", response_model=MarketCapabilitiesOut)
def market_capabilities(user: User = Depends(get_current_user)):
    connected = bool(settings.apify_api_token)
    provider_bits = [
        f"Apify={'connected' if connected else 'not connected'}",
        f"Geoapify={'connected' if settings.geoapify_api_key else 'not connected'}",
        f"UPCDatabase={'connected' if settings.upcdatabase_api_key else 'not connected'}",
        f"Serper={'connected' if settings.serper_api_key else 'not connected'}",
        f"Instacart={'connected' if settings.instacart_api_key else 'not connected'}",
    ]
    return MarketCapabilitiesOut(
        product_lookup_available=True,
        live_price_compare_available=connected,
        weekly_flyers_available=connected,
        apify_configured=connected,
        flyer_configured=connected,
        geoapify_configured=bool(settings.geoapify_api_key),
        upcdatabase_configured=bool(settings.upcdatabase_api_key),
        serper_configured=bool(settings.serper_api_key),
        instacart_configured=bool(settings.instacart_api_key),
        live_price_status="connected" if connected else "not_connected",
        supported_retailers=SUPPORTED_CANADA_RETAILERS,
        message=f"Provider stack: {', '.join(provider_bits)}. Store-specific lookup supports: {', '.join(supported_product_lookup_stores())}. {' '.join(store_lookup_search_status())}",
    )


@router.get("/houses/{house_id}/flyer-merchants", response_model=FlyerMerchantsOut)
def flyer_merchants(
    house_id: int,
    postal_code: str = Query(min_length=3, max_length=12),
    force_refresh: bool = False,
    premium_try_feature: str | None = Header(default=None, alias="X-GHM-Premium-Try"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    plan = get_house_plan(db, house_id)
    clean_postal = normalize_canadian_postal_code(postal_code)
    if not clean_postal or len(clean_postal.replace(" ", "")) != 6:
        return FlyerMerchantsOut(configured=bool(settings.apify_api_token), postal_code=clean_postal, message="Enter a complete Canadian postal code to load available flyer stores.", merchants=[])
    if not house_plan_has_external_price_comparison(db, house_id, user, premium_try_feature):
        return FlyerMerchantsOut(premium_required=True, configured=bool(settings.apify_api_token), postal_code=clean_postal, message=f"Weekly flyer intelligence is a Family Plus or Household Pro feature. This house is on the owner's {plan.name} plan.", merchants=[])
    if not settings.apify_api_token:
        return FlyerMerchantsOut(configured=False, postal_code=clean_postal, message="Weekly flyer fetching is not connected yet.", merchants=[])
    try:
        cached, fetched_at, rows = discover_weekly_flyer_merchants(db, postal_code=clean_postal, force_refresh=force_refresh, before_provider_run=lambda: _charge_apify_if_needed(db, house_id, user, premium_try_feature, "weekly_flyers"))
    except Exception as exc:
        return FlyerMerchantsOut(configured=True, postal_code=clean_postal, message=f"Local flyer stores could not be loaded: {safe_market_error(exc)}", merchants=[])
    normalized: list[FlyerMerchantOut] = []
    seen: set[str] = set()
    for row in rows:
        name = str(row.get("merchant") or row.get("merchantName") or row.get("name") or row.get("store") or "").strip()
        merchant_id = str(row.get("merchantId") or row.get("merchant_id") or row.get("id") or "").strip() or None
        if not name:
            continue
        unique = (merchant_id or name.casefold()).strip()
        if unique in seen:
            continue
        seen.add(unique)
        categories = row.get("categories") or []
        if isinstance(categories, str):
            categories = [part.strip() for part in re.split(r"[,;|]", categories) if part.strip()]
        normalized.append(FlyerMerchantOut(
            merchant=name, merchant_id=merchant_id, categories=[str(item) for item in categories if str(item).strip()],
            valid_from=row.get("validFrom") or row.get("valid_from"), valid_to=row.get("validTo") or row.get("valid_to"),
        ))
    normalized.sort(key=lambda item: item.merchant.casefold())
    return FlyerMerchantsOut(
        configured=True, cached=cached, postal_code=clean_postal, fetched_at=fetched_at,
        message=f"{len(normalized)} flyer stores are available for this postal code. Select any stores below, or leave all unselected to use the provider's local grocery set.",
        merchants=normalized,
    )


@router.get("/houses/{house_id}/flyers", response_model=FlyerDealsOut)
def weekly_flyers(
    house_id: int,
    postal_code: str = Query(min_length=3, max_length=12),
    query: str | None = Query(default=None, max_length=100),
    merchants: str | None = Query(default=None, max_length=500),
    force_refresh: bool = False,
    premium_try_feature: str | None = Header(default=None, alias="X-GHM-Premium-Try"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    plan = get_house_plan(db, house_id)
    clean_postal = normalize_canadian_postal_code(postal_code)
    if not clean_postal or len(clean_postal.replace(" ", "")) != 6:
        return FlyerDealsOut(
            premium_required=False, configured=bool(settings.apify_api_token), postal_code=clean_postal,
            message="Enter a complete Canadian postal code, for example L8P 1A1.", deals=[], merchants=[]
        )
    if not house_plan_has_external_price_comparison(db, house_id, user, premium_try_feature):
        return FlyerDealsOut(
            premium_required=True, configured=bool(settings.apify_api_token), postal_code=clean_postal,
            message=f"Weekly flyer intelligence is a Family Plus or Household Pro feature. This house is on the owner's {plan.name} plan.",
            deals=[], merchants=[]
        )
    if not settings.apify_api_token:
        return FlyerDealsOut(
            configured=False, postal_code=clean_postal,
            message="Weekly flyer fetching is not connected yet. Add APIFY_API_TOKEN on the backend.", deals=[], merchants=[]
        )
    merchant_list = [part.strip() for part in (merchants or "").split(",") if part.strip()]
    try:
        cached, fetched_at, deals = get_weekly_flyer_deals(
            db, postal_code=clean_postal, merchants=merchant_list, force_refresh=force_refresh,
            before_provider_run=lambda: _charge_apify_if_needed(db, house_id, user, premium_try_feature, "weekly_flyers")
        )
    except Exception as exc:
        return FlyerDealsOut(
            configured=True, postal_code=clean_postal,
            message=f"Flyer refresh could not complete: {safe_market_error(exc)}", deals=[], merchants=[]
        )

    now = datetime.now(timezone.utc)
    active = []
    for deal in deals:
        if deal.valid_from and deal.valid_from > now:
            continue
        if deal.valid_to and deal.valid_to < now:
            continue
        active.append(deal)
    search = " ".join((query or "").casefold().split())
    if search:
        tokens = [token for token in search.split() if len(token) > 1]
        def matches(deal):
            haystack = " ".join([deal.name, deal.brand or "", deal.merchant, " ".join(deal.categories)]).casefold()
            return search in haystack or all(token in haystack for token in tokens)
        active = [deal for deal in active if matches(deal)]
    active.sort(key=lambda deal: (deal.price is None, deal.price if deal.price is not None else 10**9, deal.merchant.casefold(), deal.name.casefold()))
    active = active[: max(1, settings.flyer_max_results)]
    active = _apply_flyer_store_locations(db, clean_postal, active)
    found_merchants = sorted({deal.merchant for deal in deals if deal.merchant})
    future_expiries = [deal.valid_to for deal in deals if deal.valid_to and deal.valid_to > now]
    cache_valid_until = min(future_expiries) if future_expiries else None
    qualifier = f" for ‘{query.strip()}’" if query and query.strip() else ""
    cache_note = "cached flyer data" if cached else "fresh flyer data"
    if active and premium_try_feature == "weekly_flyers":
        complete_premium_try(db, house_id, user, "weekly_flyers", premium_try_feature)
    return FlyerDealsOut(
        configured=True, cached=cached, postal_code=clean_postal, fetched_at=fetched_at, cache_valid_until=cache_valid_until,
        message=f"Showing {len(active)} active weekly flyer deals{qualifier} across {len(found_merchants)} local merchants from {cache_note}. Flyer prices are promotional prices valid only for the displayed dates.",
        merchants=found_merchants, deals=active
    )


@router.get("/houses/{house_id}/product-lookup", response_model=ProductLookupOut)
def product_lookup(
    house_id: int,
    barcode: str | None = Query(default=None, max_length=120),
    query: str | None = Query(default=None, max_length=120),
    store_name: str | None = Query(default=None, max_length=80),
    force_refresh: bool = False,
    premium_try_feature: str | None = Header(default=None, alias="X-GHM-Premium-Try"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    store_filter = (store_name or "").strip()

    def finish_lookup(result: ProductLookupOut) -> ProductLookupOut:
        if premium_try_feature == "product_lookup" and result.results and any(getattr(item, "found", True) for item in result.results):
            complete_premium_try(db, house_id, user, "product_lookup", premium_try_feature)
        return result
    if not house_plan_has_product_lookup(db, house_id, user, premium_try_feature):
        return ProductLookupOut(
            premium_required=True,
            configured=True,
            store_filter=store_filter or None,
            message=f"Product lookup is a Basic Home or higher house feature. This house is on the owner's {house_plan.name} plan.",
            results=[],
        )
    if not barcode and not query:
        return ProductLookupOut(store_filter=store_filter or None, message="Enter a barcode, store item number, or product name to search.", results=[])

    if not force_refresh:
        cached_result = _read_product_lookup_cache(db, store_filter or None, barcode, query)
        if cached_result is not None:
            return finish_lookup(cached_result)

    # Cache hits above are free; only uncached remote identity searches use monthly credits.
    if not premium_try_can_start(db, house_id, user, "product_lookup", premium_try_feature):
        owner = get_house_owner(db, house_id)
        limit = house_plan.limits.product_lookup_runs_per_month
        if not owner or not consume_feature_call(owner.id, "product_lookup", limit, house_id=house_id, actor_id=user.id):
            return ProductLookupOut(
                premium_required=True, configured=True,
                message=f"The household reached its {limit} uncached product lookups/month. Previously saved results remain available.",
                results=[],
            )

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
            return _write_product_lookup_cache(db, store_name=store_filter, barcode=barcode, query=query, result=ProductLookupOut(
                premium_required=False,
                configured=True,
                store_filter=display_store,
                lookup_status="No official product found",
                lookup_details=details,
                message=f"No official {display_store} product page was found for that number/name. Check the Lookup check details below, or remove the store name to search the universal product database.",
                results=[],
            ))
        has_confirmed_product = any(getattr(item, "found", True) for item in results)
        if not has_confirmed_product:
            return _write_product_lookup_cache(db, store_name=store_filter, barcode=barcode, query=query, result=ProductLookupOut(
                premium_required=False,
                configured=True,
                store_filter=display_store,
                lookup_status="Store search opened",
                lookup_details=details,
                message=f"I could not read product details automatically from {display_store}. Open the official store search link below, then add the product manually after confirming the details.",
                results=results,
            ))
        return finish_lookup(_write_product_lookup_cache(db, store_name=store_filter, barcode=barcode, query=query, result=ProductLookupOut(
            premium_required=False,
            configured=True,
            store_filter=display_store,
            lookup_status="Official store result found",
            lookup_details=details,
            message=f"Official {display_store} product result found. Open the product page to confirm size, price, and availability before adding it to inventory.",
            results=results,
        )))

    # V115 identity pipeline: do not stop at the first source. A weak Open Food
    # Facts result is corroborated with UPCDatabase, then a barcode-only Serper
    # fallback can supply additional candidates. The ranked response exposes
    # confidence and evidence instead of pretending every match is exact.
    off_results = lookup_open_food_facts(barcode=barcode, query=query, limit=8)
    combined_results = list(off_results)
    ranked = rank_and_merge_identity_results(combined_results, barcode=barcode, query=query, limit=8)
    top_confidence = ranked[0].identity_confidence if ranked else 0

    if upcdatabase_is_configured() and (not ranked or (top_confidence or 0) < 90):
        combined_results.extend(lookup_upcdatabase(barcode=barcode, query=query, limit=8))
        ranked = rank_and_merge_identity_results(combined_results, barcode=barcode, query=query, limit=8)
        top_confidence = ranked[0].identity_confidence if ranked else 0

    if barcode and settings.serper_api_key and (not ranked or (top_confidence or 0) < 75):
        combined_results.extend(lookup_serper_product_identity(barcode, limit=5))
        ranked = rank_and_merge_identity_results(combined_results, barcode=barcode, query=query, limit=8)
        top_confidence = ranked[0].identity_confidence if ranked else 0

    if not ranked:
        return _write_product_lookup_cache(db, store_name=None, barcode=barcode, query=query, result=ProductLookupOut(
            premium_required=False,
            configured=True,
            store_filter=None,
            lookup_status="Identity not confirmed",
            message="No matching product identity was found. Add it manually rather than saving an uncertain match.",
            results=[],
        ))

    top = ranked[0]
    evidence_labels = {
        "open_food_facts": "Open Food Facts",
        "upcdatabase": "UPCDatabase",
        "serper_identity": "indexed web evidence",
    }
    source_note = ", ".join(evidence_labels.get(source, source.replace("_", " ")) for source in (top.evidence_sources or [top.source]))
    confidence_text = f"{top.identity_confidence}% {top.identity_label or 'confidence'}" if top.identity_confidence is not None else "identity ranked"
    return finish_lookup(_write_product_lookup_cache(db, store_name=None, barcode=barcode, query=query, result=ProductLookupOut(
        premium_required=False,
        configured=True,
        store_filter=None,
        lookup_status=f"{top.identity_label or 'Identity candidate'} · {top.identity_confidence or 0}%",
        lookup_details=[
            f"Evidence: {source_note}",
            "GHM normalizes brand/name/package size and only marks a result Verified when independent sources corroborate it.",
        ],
        message=f"Best product identity is {confidence_text}, based on {source_note}. Review any Possible or Unconfirmed match before saving.",
        results=ranked,
    )))


def _reverse_geocode_postal_code(lat: float | None, lng: float | None) -> tuple[str | None, str | None, str | None]:
    if lat is None or lng is None:
        return None, None, None
    if not settings.google_places_api_key:
        return geoapify_reverse_postal(lat, lng)
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
        return geoapify_reverse_postal(lat, lng)
    return geoapify_reverse_postal(lat, lng)


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
    premium_try_feature: str | None = Header(default=None, alias="X-GHM-Premium-Try"),
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

    if not house_plan_has_external_price_comparison(db, house_id, user, premium_try_feature):
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
            before_provider_run=lambda: _charge_apify_if_needed(db, house_id, user, premium_try_feature, "live_price_compare"),
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
        if premium_try_feature == "live_price_compare":
            complete_premium_try(db, house_id, user, "live_price_compare", premium_try_feature)
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

@router.post("/houses/{house_id}/shopping-lists/{list_id}/instacart-link", response_model=InstacartShoppingLinkOut)
def instacart_shopping_link(
    house_id: int,
    list_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not instacart_is_configured():
        return InstacartShoppingLinkOut(configured=False, message="Instacart shopping is not connected yet.")
    shopping_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product))
        .filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id)
        .first()
    )
    if not shopping_list:
        return InstacartShoppingLinkOut(configured=True, message="Shopping list not found.")
    rows = []
    for item in shopping_list.items:
        if item.status == ShoppingItemStatus.skipped or not item.product:
            continue
        rows.append({
            "name": item.product.name,
            "quantity": item.requested_quantity or 1,
            "unit": item.product.unit or "pcs",
            "display_text": f"{item.requested_quantity:g} {item.product.unit or 'pcs'} {item.product.name}",
            "barcode": item.product.barcode,
            "brand": item.product.brand,
        })
    if not rows:
        return InstacartShoppingLinkOut(configured=True, message="Add at least one item before creating an Instacart shopping page.")

    # Instacart recommends caching generated shopping-list URLs.  Include the list
    # content in the key so any item/quantity change automatically invalidates it.
    fingerprint = json.dumps({"title": shopping_list.title or "GHM Grocery List", "items": rows}, sort_keys=True, default=str)
    cache_key = "instacart_list:" + hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:40]
    now = datetime.now(timezone.utc)
    cached = db.query(ExternalPriceCache).filter(ExternalPriceCache.cache_key == cache_key).first()
    if cached:
        expires = cached.expires_at if cached.expires_at.tzinfo else cached.expires_at.replace(tzinfo=timezone.utc)
        if expires > now:
            try:
                payload = json.loads(cached.payload_json)
                cached_url = str(payload.get("url") or "").strip()
                if cached_url:
                    return InstacartShoppingLinkOut(configured=True, url=cached_url, message="Shopping page ready on Instacart (reused for this unchanged list). Confirm retailer, package size, price, and availability before checkout.")
            except Exception:
                pass

    linkback = f"{settings.frontend_url.rstrip('/')}/houses/{house_id}/shopping?list={list_id}"
    try:
        url = create_instacart_shopping_list_link(title=shopping_list.title or "GHM Grocery List", items=rows, linkback_url=linkback)
    except Exception as exc:
        return InstacartShoppingLinkOut(configured=True, message=f"Instacart could not create the shopping page right now: {str(exc)[:160]}")
    if not url:
        return InstacartShoppingLinkOut(configured=True, message="Instacart did not return a shopping page URL.")

    expires_at = now + timedelta(days=30)
    payload_json = json.dumps({"url": url}, default=str)
    if cached:
        cached.source = "instacart_shopping_list"
        cached.query = shopping_list.title or "GHM Grocery List"
        cached.location = None
        cached.retailers = None
        cached.payload_json = payload_json
        cached.fetched_at = now
        cached.expires_at = expires_at
    else:
        db.add(ExternalPriceCache(
            cache_key=cache_key, source="instacart_shopping_list", query=shopping_list.title or "GHM Grocery List",
            location=None, retailers=None, payload_json=payload_json, fetched_at=now, expires_at=expires_at,
        ))
    db.commit()
    return InstacartShoppingLinkOut(configured=True, url=url, message="Shopping page ready on Instacart. Confirm retailer, package size, price, and availability before checkout.")


@router.get("/nearby-stores", response_model=ShoppingSuggestionsOut)
def nearby_stores(
    city: str | None = Query(default=None, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    postal_code: str | None = Query(default=None, max_length=20),
    lat: float | None = None,
    lng: float | None = None,
    user: User = Depends(get_current_user),
):
    location_label, stores = get_nearby_store_results(user, city, country, lat, lng, postal_code)
    return ShoppingSuggestionsOut(
        currency_code=currency_for_country(country or user.country),
        location_label=location_label,
        message="Nearby grocery stores are based on your browser location or saved city. When exact map results are unavailable, common grocery chains for your area are shown.",
        nearby_stores=stores,
        item_suggestions=[],
    )


def _simple_name_match(wanted: str | None, candidate: str | None) -> bool:
    def clean(value: str | None) -> str:
        return " ".join(re.sub(r"[^\w]+", " ", (value or "").casefold(), flags=re.UNICODE).split())
    left = clean(wanted)
    right = clean(candidate)
    if not left or not right:
        return False
    if left == right or left in right or right in left:
        return True
    left_tokens = {token for token in left.split() if len(token) > 1}
    right_tokens = {token for token in right.split() if len(token) > 1}
    overlap = len(left_tokens & right_tokens)
    return bool(overlap and overlap / max(len(left_tokens), 1) >= 0.6)


@router.get("/houses/{house_id}/shopping-lists/{list_id}/suggestions", response_model=ShoppingSuggestionsOut)
def shopping_suggestions(
    house_id: int,
    list_id: int,
    city: str | None = Query(default=None, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    postal_code: str | None = Query(default=None, max_length=20),
    lat: float | None = None,
    lng: float | None = None,
    premium_try_feature: str | None = Header(default=None, alias="X-GHM-Premium-Try"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house_plan = get_house_plan(db, house_id)
    if not house_plan_has_smart_market(db, house_id, user, premium_try_feature):
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

    location_label, stores = get_nearby_store_results(user, city, country, lat, lng, postal_code)
    flyer_deals = []
    clean_postal = normalize_canadian_postal_code(postal_code)
    if clean_postal and len(clean_postal.replace(" ", "")) == 6 and settings.apify_api_token:
        try:
            _, _, flyer_deals = get_weekly_flyer_deals(db, postal_code=clean_postal, force_refresh=False, allow_provider_run=False)
        except Exception:
            flyer_deals = []
    flyer_location_cache: dict[str, NearbyStoreOut] = {}
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
        saved_best = prices[0] if prices else None
        current_price = product.price
        current_store = product.store_name

        flyer_matches = [
            deal for deal in flyer_deals
            if deal.price is not None
            and not deal.is_multi_product_bundle
            and _simple_name_match(product.name, deal.name)
            and (deal.valid_to is None or deal.valid_to >= now - timedelta(days=1))
        ]
        flyer_best = min(flyer_matches, key=lambda deal: float(deal.price)) if flyer_matches else None
        flyer_location = None
        if flyer_best is not None and clean_postal:
            flyer_location = flyer_location_cache.get(flyer_best.merchant)
            if flyer_location is None:
                # Reuse a nearby-store result when it clearly matches; otherwise resolve/cache the nearest branch.
                flyer_location = next((store for store in stores if _merchant_match(flyer_best.merchant, store.name)), None)
                if flyer_location is None:
                    flyer_location = resolve_flyer_store_location(db, flyer_best.merchant, clean_postal)
                flyer_location_cache[flyer_best.merchant] = flyer_location

        best_store = None
        best_price = None
        best_recorded = None
        source_label = None
        freshness_label = None
        if flyer_best is not None:
            best_store = flyer_best.merchant
            best_price = float(flyer_best.price)
            best_recorded = flyer_best.scraped_at or now
            source_label = "Weekly flyer"
            freshness_label = f"valid to {flyer_best.valid_to.date().isoformat()}" if flyer_best.valid_to else "current flyer"
        if saved_best is not None and (best_price is None or float(saved_best.price) < best_price):
            best_store = saved_best.store_name
            best_price = float(saved_best.price)
            best_recorded = saved_best.recorded_at
            recorded = aware(saved_best.recorded_at)
            if str(saved_best.source or "").startswith("receipt") and recorded and recorded >= recent_cutoff:
                source_label = "Last receipt"
                days = max((now - recorded).days, 0)
                freshness_label = "today" if days == 0 else f"{days}d ago"
            elif str(saved_best.source or "").startswith("apify") or str(saved_best.source or "").startswith("live"):
                source_label = "Live compare"
                freshness_label = "latest available"
            else:
                source_label = "Saved price"
                freshness_label = "saved"

        savings = round(max(float(current_price) - best_price, 0), 2) if best_price is not None and current_price is not None else None
        if best_store and best_price is not None:
            message = f"Suggested store: {best_store} at {best_price:.2f}. Source: {source_label}."
            if source_label == "Weekly flyer":
                message += " Confirm package size before buying."
            if savings and savings > 0:
                message += f" Save about {savings:.2f} vs current product price."
        else:
            message = "No current flyer or recent household price match yet. Upload a receipt or use price comparison to improve suggestions."
        suggestions.append(
            ShoppingItemSuggestionOut(
                product_id=product.id,
                product_name=product.name,
                requested_quantity=item.requested_quantity,
                current_store=current_store,
                current_price=current_price,
                best_known_store=best_store,
                best_known_price=best_price,
                best_known_source=source_label,
                best_known_recorded_at=best_recorded,
                freshness_label=freshness_label,
                savings_vs_current=savings,
                flyer_store=flyer_best.merchant if flyer_best else None,
                flyer_name=flyer_best.name if flyer_best else None,
                flyer_brand=flyer_best.brand if flyer_best else None,
                flyer_price=float(flyer_best.price) if flyer_best and flyer_best.price is not None else None,
                flyer_price_raw=flyer_best.price_raw if flyer_best else None,
                flyer_image_url=flyer_best.image_url if flyer_best else None,
                flyer_valid_from=flyer_best.valid_from if flyer_best else None,
                flyer_valid_to=flyer_best.valid_to if flyer_best else None,
                flyer_discount=flyer_best.discount if flyer_best else None,
                flyer_id=flyer_best.flyer_id if flyer_best else None,
                flyer_source_url=flyer_best.source_url if flyer_best else None,
                flyer_store_name=flyer_location.name if flyer_location else None,
                flyer_store_address=flyer_location.address if flyer_location else None,
                flyer_store_maps_url=flyer_location.maps_url if flyer_location else None,
                message=message,
            )
        )

    if (stores or suggestions) and premium_try_feature == "nearby_store_suggestions":
        complete_premium_try(db, house_id, user, "nearby_store_suggestions", premium_try_feature)
    return ShoppingSuggestionsOut(
        currency_code=currency_for_country(country or user.country),
        location_label=location_label,
        premium_required=False,
        message="Suggestions combine current weekly flyers, your household receipt/product prices, and nearby grocery-store results. Always confirm package size and in-store availability before purchase.",
        nearby_stores=stores,
        item_suggestions=suggestions,
    )


@router.post('/barcode-photo')
async def barcode_photo(file: UploadFile = File(...), _: User = Depends(get_current_user)):
    """Read actual EAN/UPC/ITF/Code128 bars first, then checksum-validate OCR digits.

    Zero external OCR cost; image stays on our backend. No guessed product codes.
    """
    from io import BytesIO
    from PIL import Image, ImageOps, ImageEnhance, ImageFilter
    import pytesseract
    payload = await file.read(6_000_001)
    if len(payload) > 6_000_000:
        raise HTTPException(413, 'Barcode photo is too large (maximum 6 MB).')
    if (file.content_type or '').lower() not in ('image/jpeg','image/png','image/webp'):
        raise HTTPException(400, 'Upload a JPEG, PNG or WebP barcode photo.')
    try:
        with Image.open(BytesIO(payload)) as image:
            image.verify()
        with Image.open(BytesIO(payload)) as image:
            if image.width * image.height > 20_000_000:raise ValueError('Image too large')
            img = ImageOps.exif_transpose(image).convert('RGB')
            img.thumbnail((2200, 2200))
    except Exception as exc:
        raise HTTPException(422, 'Could not decode the uploaded image.') from exc

    def valid_gtin(value: str) -> bool:
        if len(value) not in (8, 12, 13, 14) or not value.isdigit():return False
        digits=[int(c) for c in value]
        total=sum(d*(3 if i%2 else 1) for i,d in enumerate(reversed(digits[:-1])))
        return (10-total%10)%10==digits[-1]

    # Read the *bars*, not just human-readable numbers. Works when numbers are blurry.
    try:
        from pyzbar.pyzbar import decode as decode_bars
        for angle in (0,90,270):
            source=img if angle==0 else img.rotate(angle,expand=True)
            for result in decode_bars(source):
                value=result.data.decode('ascii','ignore').strip()
                if result.type in ('EAN13','EAN8','UPCA','UPCE','I25','CODE128') and (valid_gtin(value) or (result.type=='CODE128' and value.isdigit() and len(value)<=32)):
                    return {'barcode':value,'method':'optical-barcode-decoder','confidence':'high'}
    except Exception:
        # pyzbar / libzbar may not be installed on an older deployment.
        pass

    # Fallback: recognize printed digits; never fabricate an invalid EAN/UPC.
    for angle in (0,90,270):
        source=img if angle==0 else img.rotate(angle,expand=True)
        gray=ImageOps.grayscale(source)
        for processed in (ImageEnhance.Contrast(gray).enhance(2.0),gray.filter(ImageFilter.SHARPEN)):
            try:
                raw=pytesseract.image_to_string(processed, config='--psm 6 -c tessedit_char_whitelist=0123456789')
            except Exception:
                continue
            compact=re.sub(r'(?<=\d)[\s-]+(?=\d)', '', raw)
            for candidate in re.findall(r'\d{8,14}',compact):
                if valid_gtin(candidate):
                    return {'barcode':candidate,'method':'printed-digits-ocr','confidence':'checksum-validated'}
    raise HTTPException(422, 'No readable barcode detected. Center the complete bars in bright light, keep the image sharp, or enter the barcode digits.')
