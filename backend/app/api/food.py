from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
import json
import re
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_house_member
from app.core.config import settings
from app.db.session import get_db
from app.models import User
from app.schemas import FoodMenuGuideIn, FoodMenuGuideOut, FoodMenuItemGuideOut, FoodPlaceOut, FoodSuggestionsOut
from app.utils.digitalocean_ai import DigitalOceanAIError, text_json_completion, vision_configured

router = APIRouter(prefix="/food", tags=["food"])


@router.get("/capabilities")
def food_capabilities(user: User = Depends(get_current_user)):
    configured = bool(settings.food_places_enabled and settings.google_places_api_key)
    return {
        "configured": configured,
        "restaurants": configured,
        "food_stores": configured,
        "menu_guidance": configured,
        "message": "Nearby food suggestions are ready." if configured else "Nearby food suggestions are hidden until Google Places API (New) is configured.",
    }

PLACES_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText"
PLACE_DETAILS = "https://places.googleapis.com/v1/places/{place_id}"

# Deliberately scoped. Rich fields are useful for a small result set but cost more,
# so V98 never requests reviews/photos/generative summaries by default.
PLACE_FIELDS = ",".join([
    # Keep the initial shortlist on the lower-cost Text Search Pro tier. Rich fields
    # (website, rating, service options, vegetarian signal) are requested only after
    # the user opens Prepare my order for one place.
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.googleMapsUri", "places.primaryType",
])
DETAIL_FIELDS = ",".join([
    "id", "displayName", "formattedAddress", "location", "googleMapsUri", "primaryType",
    "rating", "userRatingCount", "priceLevel", "currentOpeningHours", "websiteUri",
    "dineIn", "takeout", "delivery", "servesVegetarianFood",
])


def _places_headers(field_mask: str) -> dict[str, str]:
    if not settings.google_places_api_key:
        raise HTTPException(status_code=503, detail="Nearby food suggestions are not connected yet. Add the Google Places API key on the backend.")
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": field_mask,
    }


def _clean_display_name(place: dict[str, Any]) -> str:
    value = place.get("displayName")
    if isinstance(value, dict):
        return str(value.get("text") or "").strip()
    return str(value or "").strip()


def _place_out(place: dict[str, Any], *, dietary_mode: str) -> FoodPlaceOut:
    hours = place.get("currentOpeningHours") or {}
    location = place.get("location") or {}
    name = _clean_display_name(place) or "Restaurant"
    website = str(place.get("websiteUri") or "").strip() or None
    name_text = name.casefold()
    dietary_text = f"{name_text} {website or ''}".casefold()
    explicit = False
    if dietary_mode == "swaminarayan":
        explicit = "swaminarayan" in dietary_text or "no onion no garlic" in dietary_text or "no onion" in dietary_text and "no garlic" in dietary_text
    elif dietary_mode == "jain":
        explicit = "jain" in dietary_text
    elif dietary_mode in {"vegetarian", "vegan"}:
        explicit = bool(place.get("servesVegetarianFood")) or dietary_mode in dietary_text

    if dietary_mode == "none":
        dietary_status = "not_requested"
        dietary_note = "No dietary filter requested."
    elif explicit:
        dietary_status = "promising"
        dietary_note = "The place information contains a dietary signal, but confirm ingredients for the exact dish before ordering."
    elif place.get("servesVegetarianFood") and dietary_mode in {"jain", "swaminarayan"}:
        dietary_status = "modification_may_be_possible"
        dietary_note = "Vegetarian food is indicated, but onion/garlic restrictions are not verified. Review the menu and confirm preparation with the restaurant."
    else:
        dietary_status = "needs_confirmation"
        dietary_note = "GHM has not verified that this place can meet the selected dietary restriction. Use the menu guide and confirm with staff."

    if dietary_mode == "swaminarayan":
        order_note = "Ask for food with no onion and no garlic, and confirm that sauces, gravies, chutneys, spice mixes, stocks and garnishes also exclude them."
    elif dietary_mode == "jain":
        order_note = "Confirm the restaurant's Jain preparation rules for the exact dish, including root vegetables and shared sauces/preparation."
    elif dietary_mode == "vegan":
        order_note = "Confirm no dairy, egg, ghee, honey or other animal-derived ingredients in the exact preparation."
    elif dietary_mode == "vegetarian":
        order_note = "Confirm the exact dish is vegetarian and ask about stocks, sauces and shared preparation if that matters to you."
    else:
        order_note = "Open the official menu or Maps listing before ordering."

    return FoodPlaceOut(
        place_id=str(place.get("id") or ""),
        name=name,
        address=str(place.get("formattedAddress") or "").strip() or None,
        latitude=float(location.get("latitude")) if location.get("latitude") is not None else None,
        longitude=float(location.get("longitude")) if location.get("longitude") is not None else None,
        rating=float(place.get("rating")) if place.get("rating") is not None else None,
        user_rating_count=int(place.get("userRatingCount")) if place.get("userRatingCount") is not None else None,
        price_level=str(place.get("priceLevel") or "").replace("PRICE_LEVEL_", "").replace("_", " ").title() or None,
        open_now=hours.get("openNow") if isinstance(hours, dict) else None,
        website_uri=website,
        maps_uri=str(place.get("googleMapsUri") or "").strip() or None,
        primary_type=str(place.get("primaryType") or "").strip() or None,
        dine_in=place.get("dineIn"),
        takeout=place.get("takeout"),
        delivery=place.get("delivery"),
        serves_vegetarian_food=place.get("servesVegetarianFood"),
        dietary_status=dietary_status,
        dietary_note=dietary_note,
        order_note=order_note,
    )


def _search_places(*, text_query: str, latitude: float | None, longitude: float | None, open_now: bool) -> list[dict[str, Any]]:
    body: dict[str, Any] = {
        "textQuery": text_query,
        "pageSize": max(1, min(int(settings.food_places_max_results), 12)),
        "languageCode": "en",
    }
    if open_now:
        body["openNow"] = True
    if latitude is not None and longitude is not None:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": latitude, "longitude": longitude},
                "radius": max(500, min(int(settings.food_places_radius_meters), 50000)),
            }
        }
    try:
        response = requests.post(
            PLACES_TEXT_SEARCH,
            headers=_places_headers(PLACE_FIELDS),
            json=body,
            timeout=12,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Nearby food suggestions are temporarily unavailable: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Nearby place provider returned HTTP {response.status_code}. Check the Places API key, billing, and Places API (New) access.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Nearby place provider returned an unreadable response.") from exc
    return payload.get("places") or []


def _get_place(place_id: str) -> dict[str, Any]:
    safe_id = place_id.strip()
    if not safe_id or "/" in safe_id or len(safe_id) > 255:
        raise HTTPException(status_code=400, detail="Invalid place identifier.")
    try:
        response = requests.get(
            PLACE_DETAILS.format(place_id=safe_id),
            headers=_places_headers(DETAIL_FIELDS),
            timeout=12,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Restaurant details are temporarily unavailable: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Restaurant details provider returned HTTP {response.status_code}.")
    return response.json()


class _MenuHTMLParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._anchor_text: list[str] = []
        self._ignore_depth = 0

    def handle_starttag(self, tag: str, attrs):
        if tag in {"script", "style", "svg", "noscript"}:
            self._ignore_depth += 1
            return
        if tag == "a":
            attrs_dict = dict(attrs)
            self._href = attrs_dict.get("href")
            self._anchor_text = []

    def handle_endtag(self, tag: str):
        if tag in {"script", "style", "svg", "noscript"} and self._ignore_depth:
            self._ignore_depth -= 1
            return
        if tag == "a" and self._href:
            href = urljoin(self.base_url, self._href)
            label = " ".join(self._anchor_text).strip()
            self.links.append((label, href))
            self._href = None
            self._anchor_text = []

    def handle_data(self, data: str):
        if self._ignore_depth:
            return
        clean = " ".join(data.split())
        if not clean:
            return
        self.text_parts.append(clean)
        if self._href is not None:
            self._anchor_text.append(clean)


def _fetch_html_text(url: str) -> tuple[str, list[tuple[str, str]]]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return "", []
    try:
        response = requests.get(
            url,
            timeout=max(4, min(int(settings.food_menu_fetch_timeout_seconds), 20)),
            headers={"User-Agent": "Mozilla/5.0 (compatible; GroceryHouseManager/1.0; +https://grocery-house-manager.com)"},
            allow_redirects=True,
        )
    except requests.RequestException:
        return "", []
    if response.status_code >= 400 or "text/html" not in (response.headers.get("content-type") or ""):
        return "", []
    if len(response.content) > 2_000_000:
        return "", []
    parser = _MenuHTMLParser(response.url)
    try:
        parser.feed(response.text)
    except Exception:
        return "", []
    text = "\n".join(parser.text_parts)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:45000], parser.links[:300]


def _official_menu_evidence(website: str | None) -> tuple[str | None, str]:
    if not website:
        return None, ""
    root_text, links = _fetch_html_text(website)
    if not root_text:
        return website, ""
    host = urlparse(website).netloc.casefold().removeprefix("www.")
    candidates: list[str] = []
    for label, href in links:
        parsed = urlparse(href)
        link_host = parsed.netloc.casefold().removeprefix("www.")
        key = f"{label} {parsed.path}".casefold()
        if link_host == host and any(term in key for term in ["menu", "order", "food", "dinner", "lunch"]):
            candidates.append(href)
    seen: set[str] = set()
    chosen = website
    chunks = [root_text[:18000]]
    for href in candidates:
        if href in seen:
            continue
        seen.add(href)
        text, _ = _fetch_html_text(href)
        if text:
            chosen = href
            chunks.append(text[:26000])
            break
    return chosen, "\n\n".join(chunks)[:44000]


def _safe_item(value: Any) -> FoodMenuItemGuideOut | None:
    if not isinstance(value, dict):
        return None
    name = str(value.get("item_name") or value.get("name") or "").strip()
    if not name:
        return None
    mods = value.get("modifications") or []
    if not isinstance(mods, list):
        mods = [str(mods)] if mods else []
    return FoodMenuItemGuideOut(
        item_name=name[:180],
        status=str(value.get("status") or "possible")[:40],
        reason=str(value.get("reason") or "")[:800],
        modifications=[str(row)[:220] for row in mods[:8]],
        confidence=str(value.get("confidence") or "low")[:24],
    )


def _scripts(dietary_mode: str) -> tuple[str, str]:
    if dietary_mode == "swaminarayan":
        exact = "I follow a Swaminarayan diet. I cannot have onion or garlic, including in sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings or garnishes. Can this dish be prepared without onion and garlic, and can you please confirm those ingredients are not already in the base sauce?"
        return exact, exact
    if dietary_mode == "jain":
        exact = "I follow a Jain diet. Could you please confirm which dishes can be prepared according to Jain restrictions, including the ingredients in sauces, gravies and shared preparations?"
        return exact, exact
    if dietary_mode == "vegan":
        exact = "I am vegan. Can you please confirm this dish contains no dairy, egg, ghee, honey or other animal-derived ingredients, including the sauce and garnish?"
        return exact, exact
    if dietary_mode == "vegetarian":
        exact = "I am vegetarian. Can you please confirm this dish and its sauce or stock contain no meat, poultry, fish or other non-vegetarian ingredients?"
        return exact, exact
    exact = "Could you please confirm the ingredients and preparation for this dish before I order?"
    return exact, exact


@router.get("/houses/{house_id}/suggestions", response_model=FoodSuggestionsOut)
def food_suggestions(
    house_id: int,
    mode: str = Query(default="restaurant", pattern="^(restaurant|grocery)$"),
    dietary_mode: str = Query(default="none", pattern="^(none|vegetarian|vegan|jain|swaminarayan)$"),
    query: str | None = Query(default=None, max_length=120),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    postal_code: str | None = Query(default=None, max_length=16),
    open_now: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not settings.food_places_enabled:
        return FoodSuggestionsOut(configured=False, mode=mode, query=query or "", dietary_mode=dietary_mode, message="Food suggestions are disabled for this deployment.")
    if not settings.google_places_api_key:
        return FoodSuggestionsOut(configured=False, mode=mode, query=query or "", dietary_mode=dietary_mode, message="Add GOOGLE_PLACES_API_KEY to enable nearby restaurants and food stores.")

    location_hint = " ".join(part for part in [postal_code, user.city, user.country] if part).strip()
    if mode == "grocery":
        base_query = query or "grocery store supermarket food market"
    else:
        if query:
            base_query = query
        elif dietary_mode == "swaminarayan":
            base_query = "vegetarian Indian restaurant Swaminarayan Jain food"
        elif dietary_mode == "jain":
            base_query = "Jain vegetarian restaurant"
        elif dietary_mode == "vegan":
            base_query = "vegan restaurant"
        elif dietary_mode == "vegetarian":
            base_query = "vegetarian restaurant"
        else:
            base_query = "restaurant"
    text_query = f"{base_query} near {location_hint}" if location_hint and latitude is None else base_query
    places_raw = _search_places(text_query=text_query, latitude=latitude, longitude=longitude, open_now=open_now)
    places = [_place_out(place, dietary_mode=dietary_mode) for place in places_raw if place.get("id")]
    places.sort(key=lambda row: ((row.dietary_status == "promising"), row.open_now is True, row.rating or 0, row.user_rating_count or 0), reverse=True)
    caution = None
    if dietary_mode in {"swaminarayan", "jain"}:
        caution = "Restaurant listings do not prove ingredient compliance. GHM labels menu findings conservatively and you should confirm onion/garlic or Jain preparation directly with the restaurant before ordering."
    return FoodSuggestionsOut(
        configured=True,
        mode=mode,
        query=base_query,
        dietary_mode=dietary_mode,
        location_label=location_hint or None,
        places=places,
        message=f"Found {len(places)} nearby option{'s' if len(places) != 1 else ''}. GHM shows a small shortlist first so Food Tonight stays simple.",
        caution=caution,
    )


@router.post("/houses/{house_id}/menu-guide", response_model=FoodMenuGuideOut)
def food_menu_guide(
    house_id: int,
    payload: FoodMenuGuideIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)

    # V99: Prepare my order must always open a useful guide. Rich Google Place
    # Details are preferred, but a temporary provider/billing/field failure should
    # not turn the button into a dead end. Fall back to the shortlist context that
    # the user already saw and keep all dish-level claims conservative.
    details_warning: str | None = None
    try:
        place = _get_place(payload.place_id)
    except HTTPException as exc:
        details_warning = str(exc.detail)
        place = {
            "id": payload.place_id,
            "displayName": {"text": payload.place_name or "Restaurant"},
            "websiteUri": payload.website_uri,
            "googleMapsUri": payload.maps_uri,
        }

    place_name = _clean_display_name(place) or payload.place_name or "Restaurant"
    website = str(place.get("websiteUri") or payload.website_uri or "").strip() or None
    menu_url, evidence = _official_menu_evidence(website)
    in_person_script, phone_script = _scripts(payload.dietary_mode)

    verified: list[FoodMenuItemGuideOut] = []
    possible: list[FoodMenuItemGuideOut] = []
    uncertain: list[FoodMenuItemGuideOut] = []
    evidence_note = "No readable official menu text was available. GHM will not invent dish-level dietary claims. Use the official website/Maps listing and confirm directly with the restaurant."
    if details_warning:
        evidence_note = f"Restaurant detail lookup was temporarily limited ({details_warning}). " + evidence_note

    if evidence and vision_configured():
        prompt = f"""
You are analyzing OFFICIAL restaurant website/menu text for Grocery House Manager.
Restaurant: {place_name}
Dietary mode: {payload.dietary_mode}

For Swaminarayan, the user specifically requires NO ONION and NO GARLIC. This includes base sauces, gravies, chutneys, marinades, stocks, spice mixes, toppings and garnishes. Vegetarian alone is NOT sufficient proof.
For Jain, do not assume a dish is Jain merely because it is vegetarian; only use explicit menu evidence or mark it as requiring confirmation/modification.

RULES:
- Use only the menu text below. Do not use memory about the restaurant or cuisine.
- "verified_items" is allowed only when the supplied text explicitly supports the selected restriction for that exact dish/preparation.
- "possible_with_changes" may include dishes that look potentially adaptable, but explain the exact modification and always require restaurant confirmation.
- If a base sauce/gravy may already contain restricted ingredients, say so and do not present the item as verified.
- Do not invent prices, ingredients, menu items or availability.
- Keep at most 6 items per section.
- Return ONLY JSON.

Return:
{{
 "verified_items":[{{"item_name":"","status":"verified","reason":"","modifications":[],"confidence":"high|medium|low"}}],
 "possible_with_changes":[{{"item_name":"","status":"possible_with_changes","reason":"","modifications":[""],"confidence":"high|medium|low"}}],
 "avoid_or_uncertain":[{{"item_name":"","status":"uncertain","reason":"","modifications":[],"confidence":"high|medium|low"}}],
 "online_order_steps":[""],
 "evidence_note":""
}}

OFFICIAL MENU/WEBSITE TEXT:
{evidence}
""".strip()
        try:
            parsed = text_json_completion(prompt=prompt, max_tokens=1900)
            verified = [item for item in (_safe_item(x) for x in parsed.get("verified_items", [])) if item]
            possible = [item for item in (_safe_item(x) for x in parsed.get("possible_with_changes", [])) if item]
            uncertain = [item for item in (_safe_item(x) for x in parsed.get("avoid_or_uncertain", [])) if item]
            online_steps = [str(x)[:260] for x in (parsed.get("online_order_steps") or [])[:8] if str(x).strip()]
            evidence_note = str(parsed.get("evidence_note") or "GHM analyzed readable text from the restaurant's official website/menu. Confirm special preparation directly with the restaurant.")[:1200]
        except DigitalOceanAIError:
            online_steps = []
    else:
        online_steps = []

    if not online_steps:
        online_steps = [
            "Open the restaurant's official menu or ordering page.",
            "Choose the dish only if the ingredient description looks compatible with your restriction.",
            "Use the special-instructions box to paste the GHM ordering note when available.",
            "If the base sauce or preparation is unclear, call the restaurant before submitting the order.",
        ]
    if payload.dietary_mode == "swaminarayan":
        online_steps.insert(2, "Request: no onion and no garlic, including sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings and garnishes.")

    return FoodMenuGuideOut(
        place_id=payload.place_id,
        place_name=place_name,
        dietary_mode=payload.dietary_mode,
        verified_items=verified,
        possible_with_changes=possible,
        avoid_or_uncertain=uncertain,
        online_order_steps=online_steps[:9],
        in_person_script=in_person_script,
        phone_script=phone_script,
        official_menu_url=menu_url,
        official_website_url=website,
        evidence_note=evidence_note,
        message="GHM separates verified menu evidence from possible modifications. Special dietary preparation should still be confirmed with the restaurant.",
    )
