from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from statistics import median
import json
import xml.etree.ElementTree as ET
from itertools import combinations
from math import ceil
import re

import requests
from PIL import Image
import pytesseract

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import (
    ensure_active_shopping_list_limit,
    ensure_product_limit,
    get_house_plan,
    house_plan_has_autopilot_planner,
    house_plan_has_kitchen_check,
    house_plan_has_receipt_guardian,
    house_plan_has_stock_up_intelligence,
)
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    CommunityPriceObservation,
    CommunityRecipe,
    AutopilotDecision,
    House,
    HouseMember,
    Invite,
    PlanName,
    Product,
    ProductStorePrice,
    Receipt,
    ReceiptLineItem,
    Section,
    ShoppingItemStatus,
    ShoppingList,
    ShoppingListItem,
    User,
)
from app.schemas import (
    AutopilotDecisionIn,
    AutopilotDecisionOut,
    AutopilotControlsIn,
    AutopilotControlsOut,
    AutopilotOverviewOut,
    AutopilotPatternOut,
    AutopilotTripOptionOut,
    CommunityPricePulseOut,
    CommunityPriceSharingIn,
    CommunityPriceSignalOut,
    BasketComparisonOut,
    BasketStoreOptionOut,
    HouseholdPlanDayOut,
    HouseholdPlanIn,
    HouseholdPlanOut,
    KitchenCheckOut,
    OnboardingStatusOut,
    RecallGuardianOut,
    RecallMatchOut,
    ReceiptGuardianIssueOut,
    ReceiptGuardianOut,
    OnboardingStepOut,
    RecipeMissingAddIn,
    RecipeMissingAddOut,
    RecipeShoppingAddIn,
    RecipeShoppingAddOut,
    SavingsLedgerEntryOut,
    SavingsLedgerOut,
    SavingsSummaryOut,
    StockUpSuggestionOut,
    WeeklyAssistantOut,
    WeeklyAssistantRecipeOut,
    WeeklyAssistantSuggestedItemOut,
)
from app.utils.location import currency_for_country
from app.utils.flyer_data import get_weekly_flyer_deals
from app.utils.market_data import compare_canadian_grocery_prices, normalize_canadian_postal_code, safe_market_error

router = APIRouter(prefix="/insights", tags=["insights"])


def _month_window(now: datetime | None = None) -> tuple[datetime, datetime, str]:
    current = now or datetime.now(timezone.utc)
    start = datetime(current.year, current.month, 1, tzinfo=timezone.utc)
    if current.month == 12:
        end = datetime(current.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(current.year, current.month + 1, 1, tzinfo=timezone.utc)
    return start, end, current.strftime("%B %Y")


def _normalize_name(value: str | None) -> str:
    return " ".join((value or "").lower().strip().split())


def _active_owned_house(db: Session, user: User) -> House | None:
    return (
        db.query(House)
        .filter(House.created_by_id == user.id)
        .order_by(House.created_at.asc(), House.id.asc())
        .first()
    )


def _primary_house(db: Session, user: User) -> House | None:
    """Prefer a house the user owns, but treat a joined household as a valid home too.

    First-time guidance should never tell an invited family member to create another house just
    because they are not the owner.
    """
    owned = _active_owned_house(db, user)
    if owned:
        return owned
    return (
        db.query(House)
        .join(HouseMember, HouseMember.house_id == House.id)
        .filter(HouseMember.user_id == user.id)
        .order_by(House.created_at.asc(), House.id.asc())
        .first()
    )


@router.get("/onboarding", response_model=OnboardingStatusOut)
def onboarding_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    house = _primary_house(db, user)
    has_house = house is not None
    products_count = 0
    active_lists = 0
    member_count = 0
    invite_sent = False

    if house:
        products_count = db.query(Product).filter(Product.house_id == house.id).count()
        active_lists = db.query(ShoppingList).filter(ShoppingList.house_id == house.id, ShoppingList.is_done.is_(False)).count()
        member_count = db.query(HouseMember).filter(HouseMember.house_id == house.id).count()
        invite_sent = db.query(Invite).filter(Invite.house_id == house.id).count() > 0

    # Four deliberate actions only. The UI automatically advances to the next unfinished action.
    steps = [
        OnboardingStepOut(
            key="house",
            title="Create or join your Home",
            description="A House is your private shared grocery space — inventory, shopping lists, receipts, and household members all live together here.",
            complete=has_house,
            href="/houses",
        ),
        OnboardingStepOut(
            key="inventory",
            title="Add your first 5 groceries",
            description=f"{min(products_count, 5)} of 5 added. Start with everyday items so Grocery House Manager can immediately become useful.",
            complete=products_count >= 5,
            href=f"/houses/{house.id}/inventory" if house else "/houses",
        ),
        OnboardingStepOut(
            key="list",
            title="Create your first shopping list",
            description="Add the groceries you need. Everyone in this Home can see the same list and cart status.",
            complete=active_lists > 0,
            href=f"/houses/{house.id}/shopping" if house else "/houses",
        ),
        OnboardingStepOut(
            key="invite",
            title="Invite someone you shop with",
            description="Invite a partner, family member, or roommate. Creating an invite also completes this quick-start step.",
            complete=bool(member_count > 1 or invite_sent),
            href=f"/houses/{house.id}" if house else "/houses",
        ),
    ]
    completed = sum(1 for step in steps if step.complete)
    return OnboardingStatusOut(
        complete=completed == len(steps),
        completed_steps=completed,
        total_steps=len(steps),
        percent=round((completed / len(steps)) * 100) if steps else 0,
        primary_house_id=house.id if house else None,
        steps=steps,
    )


def _savings_summary(db: Session, house: House, user: User) -> SavingsSummaryOut:
    month_start, month_end, month_label = _month_window()
    receipts = (
        db.query(Receipt)
        .filter(
            Receipt.house_id == house.id,
            or_(
                and_(
                    Receipt.receipt_date.is_not(None),
                    Receipt.receipt_date >= month_start.date(),
                    Receipt.receipt_date < month_end.date(),
                ),
                and_(
                    Receipt.receipt_date.is_(None),
                    Receipt.created_at >= month_start,
                    Receipt.created_at < month_end,
                ),
            ),
        )
        .all()
    )
    tracked_spend = round(sum(float(row.total_amount or 0) for row in receipts), 2)
    receipt_discounts = round(sum(max(float(row.discount_amount or 0), 0) for row in receipts), 2)

    completed_lists = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.store_prices))
        .filter(
            ShoppingList.house_id == house.id,
            ShoppingList.is_done.is_(True),
            ShoppingList.completed_at >= month_start,
            ShoppingList.completed_at < month_end,
        )
        .all()
    )

    lower_price_choices = 0.0
    opportunities = 0
    for shopping_list in completed_lists:
        for item in shopping_list.items:
            if item.status != ShoppingItemStatus.in_cart or item.bought_price is None:
                continue
            bought_price = float(item.bought_price)
            alternatives = sorted(
                {
                    round(float(entry.price), 4)
                    for entry in (item.product.store_prices or [])
                    if entry.price is not None
                    and (not item.bought_store_name or entry.store_name.lower() != item.bought_store_name.lower())
                    and float(entry.price) > bought_price
                }
            )
            if not alternatives:
                continue
            opportunities += 1
            comparison_price = alternatives[0]
            qty = float(item.bought_quantity or item.requested_quantity or 1)
            lower_price_choices += max(comparison_price - bought_price, 0) * max(qty, 1)

    lower_price_choices = round(lower_price_choices, 2)
    estimated_savings = round(receipt_discounts + lower_price_choices, 2)
    plan = get_house_plan(db, house.id)
    plan_monthly_cost = round(float(plan.price_monthly_cad or 0), 2)
    after_cost = round(estimated_savings - plan_monthly_cost, 2)
    roi = round(estimated_savings / plan_monthly_cost, 1) if plan_monthly_cost > 0 and estimated_savings > 0 else None

    if estimated_savings > 0:
        message = "Estimated savings are based only on recorded receipt discounts and completed-list price choices that can be supported by your saved data."
    else:
        message = "Keep saving receipts and completed-list purchase prices. Grocery House Manager will build a defensible savings history instead of inventing savings."

    return SavingsSummaryOut(
        currency_code=currency_for_country(user.country),
        month_label=month_label,
        tracked_spend=tracked_spend,
        receipt_discounts=receipt_discounts,
        lower_price_choices=lower_price_choices,
        estimated_savings=estimated_savings,
        plan_monthly_cost=plan_monthly_cost,
        savings_after_plan_cost=after_cost,
        roi_multiple=roi,
        comparison_opportunities=opportunities,
        message=message,
    )


@router.get("/houses/{house_id}/savings", response_model=SavingsSummaryOut)
def savings_summary(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    return _savings_summary(db, house, user)


def _clean_key(value: str | None) -> str:
    return re.sub(r"[\W_]+", " ", (value or "").casefold(), flags=re.UNICODE).strip()


def _live_row_matches(item_name: str, row) -> bool:
    wanted = _clean_key(item_name)
    if not wanted:
        return False
    candidates = [_clean_key(getattr(row, "item", None)), _clean_key(getattr(row, "matched_product_name", None))]
    wanted_tokens = set(wanted.split())
    for candidate in candidates:
        if not candidate:
            continue
        if candidate == wanted or wanted in candidate or candidate in wanted:
            return True
        candidate_tokens = set(candidate.split())
        overlap = len(wanted_tokens & candidate_tokens)
        if overlap and overlap / max(len(wanted_tokens), 1) >= 0.6:
            return True
    return False


def _flyer_row_matches(item_name: str, deal) -> bool:
    if getattr(deal, "is_multi_product_bundle", False):
        return False
    wanted = _clean_key(item_name)
    candidate = _clean_key(getattr(deal, "name", None))
    if not wanted or not candidate:
        return False
    if wanted == candidate or wanted in candidate or candidate in wanted:
        return True
    ignore = {"fresh", "large", "small", "original", "regular", "brand", "assorted", "selected", "size", "pack"}
    wanted_tokens = {token for token in wanted.split() if len(token) > 1 and token not in ignore}
    candidate_tokens = {token for token in candidate.split() if len(token) > 1 and token not in ignore}
    if not wanted_tokens or not candidate_tokens:
        return False
    overlap = len(wanted_tokens & candidate_tokens)
    return overlap >= 1 and overlap / max(len(wanted_tokens), 1) >= 0.6


def _measure_family(unit: str | None) -> tuple[str | None, float]:
    normalized = (unit or "").strip().casefold().rstrip(".")
    aliases = {
        "kg": ("mass", 1000.0), "kilogram": ("mass", 1000.0), "kilograms": ("mass", 1000.0),
        "g": ("mass", 1.0), "gram": ("mass", 1.0), "grams": ("mass", 1.0),
        "l": ("volume", 1000.0), "litre": ("volume", 1000.0), "litres": ("volume", 1000.0),
        "liter": ("volume", 1000.0), "liters": ("volume", 1000.0),
        "ml": ("volume", 1.0), "millilitre": ("volume", 1.0), "millilitres": ("volume", 1.0),
        "milliliter": ("volume", 1.0), "milliliters": ("volume", 1.0),
        "pcs": ("count", 1.0), "pc": ("count", 1.0), "piece": ("count", 1.0), "pieces": ("count", 1.0),
        "pack": ("package", 1.0), "packs": ("package", 1.0), "package": ("package", 1.0), "packages": ("package", 1.0),
    }
    return aliases.get(normalized, (None, 1.0))


def _flyer_package_measure(name: str | None, wanted_family: str | None) -> tuple[str | None, float | None]:
    """Best-effort package-size parser used only to make flyer basket totals safer.

    It intentionally returns no size when the ad text is ambiguous. We would rather skip an
    exact basket calculation than pretend a 10 kg bag and a 1 kg request are the same unit.
    """
    text = (name or "").casefold().replace(",", ".")
    unit_pattern = r"kg|g|l|ml|litres?|liters?|kilograms?|grams?|milliliters?"
    multi = re.search(rf"(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*({unit_pattern})\b", text, re.IGNORECASE)
    if multi:
        count = float(multi.group(1))
        if wanted_family == "count":
            return "count", count
        each = float(multi.group(2))
        family, factor = _measure_family(multi.group(3))
        if family and (wanted_family is None or family == wanted_family):
            return family, count * each * factor

    measures = list(re.finditer(rf"(\d+(?:\.\d+)?)\s*({unit_pattern})\b", text, re.IGNORECASE))
    for match in reversed(measures):
        family, factor = _measure_family(match.group(2))
        if family and (wanted_family is None or family == wanted_family):
            return family, float(match.group(1)) * factor

    count = re.search(r"(\d+)\s*(?:pack|pk|ct|count|pieces?|pcs)\b", text, re.IGNORECASE)
    if count and wanted_family in {None, "count"}:
        return "count", float(count.group(1))
    return None, None


def _flyer_effective_unit_price(item: ShoppingListItem, deal) -> float | None:
    """Return a price that can safely be multiplied by requested_quantity.

    Flyer prices are usually package prices. For weight/volume shopping-list quantities we
    convert the requested amount to the same base unit, determine how many advertised packages
    are needed, and then convert that basket cost back to an effective per-requested-unit price.
    """
    try:
        shelf_price = float(getattr(deal, "price", None))
        required = max(float(item.requested_quantity or 1), 0.01)
    except (TypeError, ValueError):
        return None
    if shelf_price < 0:
        return None

    family, factor = _measure_family(getattr(item.product, "unit", None))
    if family in {"mass", "volume"}:
        _, package_base = _flyer_package_measure(getattr(deal, "name", None), family)
        if not package_base or package_base <= 0:
            # One requested unit can safely be represented by one advertised package, but for
            # larger/partial weight requests an unknown package size would create a false total.
            return shelf_price if abs(required - 1.0) < 1e-9 else None
        required_base = required * factor
        packages = max(ceil(required_base / package_base), 1)
        return (shelf_price * packages) / required

    if family == "count":
        _, package_count = _flyer_package_measure(getattr(deal, "name", None), "count")
        if package_count and package_count > 0:
            packages = max(ceil(required / package_count), 1)
            return (shelf_price * packages) / required
        # Most produce and single packaged products expose a per-piece/package flyer price.
        return shelf_price

    if family == "package":
        return shelf_price

    # Unknown units: only use a flyer price for a single requested unit.
    return shelf_price if abs(required - 1.0) < 1e-9 else None


def _classify_saved_source(source: str | None, recorded_at: datetime | None) -> str:
    raw = (source or "saved").lower()
    if raw.startswith("receipt"):
        if recorded_at:
            stamp = recorded_at if recorded_at.tzinfo else recorded_at.replace(tzinfo=timezone.utc)
            if stamp >= datetime.now(timezone.utc) - timedelta(days=30):
                return "recent_receipt"
        return "saved_price"
    return "saved_price"


def _basket_comparison(
    db: Session,
    house_id: int,
    list_id: int,
    *,
    user: User | None = None,
    postal_code: str | None = None,
    force_refresh: bool = False,
    include_live: bool = False,
) -> BasketComparisonOut:
    shopping_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.store_prices))
        .filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id)
        .first()
    )
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    items = [item for item in shopping_list.items if item.status != ShoppingItemStatus.skipped]
    total_items = len(items)
    now = datetime.now(timezone.utc)
    if total_items == 0:
        return BasketComparisonOut(
            message="This shopping list has no active items to compare yet.",
            list_id=shopping_list.id,
            list_title=shopping_list.title,
            total_items=0,
            last_refreshed_at=now,
        )

    clean_postal = normalize_canadian_postal_code(postal_code)
    location_label = clean_postal
    if not location_label and user:
        location_label = ", ".join(part for part in [user.city, user.country or "Canada"] if part) or "Canada"
    location_label = location_label or "Canada"

    live_rows = []
    live_attempted = False
    live_error = None
    if include_live and settings.apify_api_token:
        live_attempted = True
        try:
            _, live_rows = compare_canadian_grocery_prices(
                db,
                items=[item.product.name for item in items],
                location=location_label,
                postal_code=clean_postal,
                force_refresh=force_refresh,
            )
        except Exception as exc:
            live_error = safe_market_error(exc)
            live_rows = []

    flyer_rows = []
    flyer_attempted = False
    flyer_error = None
    if include_live and settings.apify_api_token and clean_postal and len(clean_postal.replace(" ", "")) == 6:
        flyer_attempted = True
        try:
            _, _, flyer_rows = get_weekly_flyer_deals(
                db, postal_code=clean_postal, force_refresh=force_refresh
            )
        except Exception as exc:
            flyer_error = safe_market_error(exc)
            flyer_rows = []

    # item_id -> store -> supported price record. Current direct prices win, then active flyer prices,
    # then recent receipt history and older saved prices.
    # within the same source tier we keep the lower observed price.
    price_map: dict[int, dict[str, dict]] = {item.id: {} for item in items}
    data_sources: set[str] = set()

    def put_price(item_id: int, store: str | None, price: float | None, source: str, recorded_at: datetime | None = None):
        if not store or price is None or price < 0:
            return
        store_name = " ".join(store.split()).strip()
        if not store_name:
            return
        rank = {"live": 0, "flyer": 1, "recent_receipt": 2, "saved_price": 3}.get(source, 4)
        current = price_map.setdefault(item_id, {}).get(store_name)
        candidate = {"price": float(price), "source": source, "rank": rank, "recorded_at": recorded_at}
        if current is None or rank < current["rank"] or (rank == current["rank"] and float(price) < current["price"]):
            price_map[item_id][store_name] = candidate
        if source == "live":
            data_sources.add("Live Canadian prices")
        elif source == "flyer":
            data_sources.add("Current weekly flyers")
        elif source == "recent_receipt":
            data_sources.add("Recent receipts")
        elif source == "saved_price":
            data_sources.add("Saved household price history")

    for item in items:
        product = item.product
        for entry in product.store_prices or []:
            source = _classify_saved_source(entry.source, entry.recorded_at)
            put_price(item.id, entry.store_name, float(entry.price) if entry.price is not None else None, source, entry.recorded_at)
        if product.price is not None and product.store_name:
            put_price(item.id, product.store_name, float(product.price), "saved_price", product.updated_at)

    for row in live_rows:
        row_price = getattr(row, "sale_price", None)
        if row_price is None:
            row_price = getattr(row, "price", None)
        store = getattr(row, "banner", None) or getattr(row, "store_name", None) or getattr(row, "retailer", None)
        if row_price is None or not store:
            continue
        for item in items:
            if _live_row_matches(item.product.name, row):
                put_price(item.id, store, float(row_price), "live", getattr(row, "scraped_at", None) or now)

    for deal in flyer_rows:
        if getattr(deal, "price", None) is None or getattr(deal, "is_multi_product_bundle", False):
            continue
        valid_from = getattr(deal, "valid_from", None)
        valid_to = getattr(deal, "valid_to", None)
        if valid_from and valid_from > now + timedelta(days=1):
            continue
        if valid_to and valid_to < now - timedelta(days=1):
            continue
        for item in items:
            if _flyer_row_matches(item.product.name, deal):
                effective_price = _flyer_effective_unit_price(item, deal)
                if effective_price is not None:
                    put_price(item.id, getattr(deal, "merchant", None), effective_price, "flyer", getattr(deal, "scraped_at", None) or now)

    all_store_names = sorted({store for stores in price_map.values() for store in stores})
    store_options: list[BasketStoreOptionOut] = []
    for store in all_store_names:
        known_total = 0.0
        missing: list[str] = []
        priced = live_count = flyer_count = receipt_count = saved_count = 0
        freshest: datetime | None = None
        for item in items:
            qty = max(float(item.requested_quantity or 1), 0.01)
            record = price_map.get(item.id, {}).get(store)
            if not record:
                missing.append(item.product.name)
                continue
            known_total += record["price"] * qty
            priced += 1
            if record["source"] == "live":
                live_count += 1
            elif record["source"] == "flyer":
                flyer_count += 1
            elif record["source"] == "recent_receipt":
                receipt_count += 1
            else:
                saved_count += 1
            stamp = record.get("recorded_at")
            if stamp:
                stamp = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
                if freshest is None or stamp > freshest:
                    freshest = stamp
        coverage = round((priced / total_items) * 100) if total_items else 0
        source_bits = []
        if live_count:
            source_bits.append(f"{live_count} live")
        if flyer_count:
            source_bits.append(f"{flyer_count} flyer")
        if receipt_count:
            source_bits.append(f"{receipt_count} recent receipt")
        if saved_count:
            source_bits.append(f"{saved_count} saved")
        source_summary = ", ".join(source_bits) if source_bits else "No supported prices"
        if live_count or flyer_count:
            freshness = "Includes current retailer/flyer prices"
        elif receipt_count:
            freshness = "Based on your recent receipts and saved history"
        else:
            freshness = "Based on saved household price history"
        store_options.append(
            BasketStoreOptionOut(
                store_name=store,
                known_total=round(known_total, 2),
                estimated_total=round(known_total, 2),
                priced_items=priced,
                total_items=total_items,
                coverage_percent=coverage,
                complete=priced == total_items,
                missing_items=missing,
                live_items=live_count,
                flyer_items=flyer_count,
                recent_receipt_items=receipt_count,
                saved_price_items=saved_count,
                source_summary=source_summary,
                freshness_label=freshness,
            )
        )

    store_options.sort(key=lambda row: (not row.complete, -row.coverage_percent, row.known_total, row.store_name.lower()))
    complete_stores = [row for row in store_options if row.complete]
    best_single = min(complete_stores, key=lambda row: row.known_total) if complete_stores else (store_options[0] if store_options else None)
    comparison_ready = bool(complete_stores)

    # A split trip is recommended only when every item has a supported price at one of the two stores.
    # No synthetic 5% fill-in is used.
    split_value = None
    split_savings = None
    split_names: list[str] = []
    split_coverage = 0
    split_picks: list[str] = []
    split_worth_it = False
    split_recommendation = None
    pair_candidates: list[tuple[float, tuple[str, str], list[str]]] = []
    for first_store, second_store in combinations(all_store_names, 2):
        pair_total = 0.0
        pair_picks: list[str] = []
        complete_pair = True
        for item in items:
            qty = max(float(item.requested_quantity or 1), 0.01)
            available = []
            for store in (first_store, second_store):
                record = price_map.get(item.id, {}).get(store)
                if record:
                    available.append((store, record["price"]))
            if not available:
                complete_pair = False
                break
            chosen_store, chosen_price = min(available, key=lambda pair: pair[1])
            pair_total += chosen_price * qty
            pair_picks.append(f"{item.product.name} → {chosen_store}")
        if complete_pair:
            pair_candidates.append((round(pair_total, 2), (first_store, second_store), pair_picks))

    if pair_candidates:
        pair_total, pair_names, pair_picks = min(pair_candidates, key=lambda row: row[0])
        split_value = pair_total
        split_names = list(pair_names)
        split_coverage = 100
        split_picks = pair_picks[:30]
        if complete_stores:
            single = min(complete_stores, key=lambda row: row.known_total)
            split_savings = round(max(single.known_total - split_value, 0), 2)
            worthwhile_threshold = max(5.0, single.known_total * 0.05)
            split_worth_it = split_savings >= worthwhile_threshold
            if split_savings <= 0:
                split_recommendation = f"Stay with {single.store_name}; the two-store option does not save money."
            elif split_worth_it:
                split_recommendation = f"Two stores could save about ${split_savings:.2f}. The extra stop may be worthwhile."
            else:
                split_recommendation = f"The second stop saves only about ${split_savings:.2f}; one store is probably the better trip."
        else:
            split_worth_it = True
            split_recommendation = "No single store has a complete known basket, but this two-store combination covers every item with supported prices."

    if not store_options:
        if live_attempted:
            message = "We automatically checked live prices and your household history, but no usable store prices were found for this list yet."
        else:
            message = "No usable prices are available yet. Receipt scans and saved prices will be picked up automatically, and live Canadian prices are used when the live-price connection is configured."
        if live_error:
            message += f" Live lookup issue: {live_error}"
        if flyer_error:
            message += f" Flyer lookup issue: {flyer_error}"
        recommendation_reason = "Add or scan prices only when convenient; the app will reuse them automatically next time."
    elif complete_stores:
        winner = min(complete_stores, key=lambda row: row.known_total)
        message = f"{winner.store_name} is the lowest complete basket we can support right now at ${winner.known_total:.2f}."
        recommendation_reason = f"All {total_items} active list items have supported prices at {winner.store_name}."
    elif split_value is not None and split_names:
        message = f"No single store has every price yet, but {' + '.join(split_names)} covers all {total_items} items at a supported total of ${split_value:.2f}."
        recommendation_reason = "This is a complete two-store price plan built only from supported prices; no missing item was guessed."
    else:
        leader = store_options[0]
        message = f"{leader.store_name} has the most complete price picture ({leader.priced_items} of {total_items} items). We are not guessing prices for the missing items."
        recommendation_reason = "A full cheapest-store recommendation will appear automatically when enough supported prices exist for a complete one- or two-store trip."

    return BasketComparisonOut(
        message=message,
        list_id=shopping_list.id,
        list_title=shopping_list.title,
        total_items=total_items,
        comparison_ready=comparison_ready,
        best_single_store=best_single,
        store_options=store_options[:8],
        split_store_total=split_value,
        split_store_savings=split_savings,
        split_store_names=split_names,
        split_store_coverage_percent=split_coverage,
        split_store_picks=split_picks,
        split_store_worth_it=split_worth_it,
        split_store_recommendation=split_recommendation,
        live_attempted=live_attempted,
        live_configured=bool(settings.apify_api_token),
        live_rows_count=len(live_rows),
        flyer_attempted=flyer_attempted,
        flyer_configured=bool(settings.apify_api_token),
        flyer_rows_count=len(flyer_rows),
        location_label=location_label,
        needs_postal_code=bool(include_live and not clean_postal),
        data_sources=sorted(data_sources),
        last_refreshed_at=now,
        recommendation_reason=recommendation_reason,
    )


@router.get("/houses/{house_id}/shopping-lists/{list_id}/basket-comparison", response_model=BasketComparisonOut)
def basket_comparison(
    house_id: int,
    list_id: int,
    postal_code: str | None = Query(default=None, max_length=20),
    force_refresh: bool = Query(default=False),
    live: bool = Query(default=True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    plan = get_house_plan(db, house_id)
    if plan.key not in {PlanName.family, PlanName.pro}:
        shopping_list = db.query(ShoppingList).filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id).first()
        if not shopping_list:
            raise HTTPException(status_code=404, detail="Shopping list not found")
        return BasketComparisonOut(
            premium_required=True,
            message=f"Automatic whole-list store comparison is a Family Plus feature. This house currently uses {plan.name}.",
            list_id=shopping_list.id,
            list_title=shopping_list.title,
            total_items=db.query(ShoppingListItem).filter(ShoppingListItem.shopping_list_id == list_id).count(),
            live_configured=bool(settings.apify_api_token),
            flyer_configured=bool(settings.apify_api_token),
            last_refreshed_at=datetime.now(timezone.utc),
        )
    return _basket_comparison(
        db,
        house_id,
        list_id,
        user=user,
        postal_code=postal_code,
        force_refresh=force_refresh,
        include_live=live,
    )


INGREDIENT_ALIASES: dict[str, set[str]] = {
    "rice": {"rice", "basmati rice", "jasmine rice", "brown rice", "white rice"},
    "egg": {"egg", "eggs"},
    "chicken": {"chicken", "chicken breast", "chicken thigh", "boneless chicken"},
    "pasta": {"pasta", "spaghetti", "penne", "fusilli", "macaroni", "linguine", "fettuccine"},
    "tomato_sauce": {"tomato sauce", "pasta sauce", "marinara", "marinara sauce"},
    "tomato": {"tomato", "tomatoes", "cherry tomato", "roma tomato"},
    "cheese": {"cheese", "cheddar", "mozzarella", "parmesan", "swiss cheese"},
    "milk": {"milk", "whole milk", "skim milk", "2% milk", "almond milk", "oat milk"},
    "bread": {"bread", "white bread", "whole wheat bread", "sourdough", "sandwich bread"},
    "butter": {"butter", "margarine"},
    "onion": {"onion", "onions", "red onion", "yellow onion", "green onion", "scallion"},
    "garlic": {"garlic", "garlic cloves"},
    "pepper": {"pepper", "peppers", "bell pepper", "bell peppers", "capsicum", "capsicums"},
    "spinach": {"spinach", "baby spinach"},
    "carrot": {"carrot", "carrots"},
    "peas": {"peas", "green peas"},
    "corn": {"corn", "sweet corn"},
    "potato": {"potato", "potatoes", "baby potatoes"},
    "tortilla": {"tortilla", "tortillas", "wrap", "wraps"},
    "beans": {"beans", "black beans", "kidney beans", "pinto beans"},
    "chickpea": {"chickpea", "chickpeas", "garbanzo", "garbanzo beans"},
    "lentils": {"lentils", "lentil", "dal", "daal"},
    "paneer": {"paneer", "cottage cheese"},
    "yogurt": {"yogurt", "yoghurt", "greek yogurt"},
    "oats": {"oats", "oatmeal", "rolled oats"},
    "banana": {"banana", "bananas"},
    "apple": {"apple", "apples"},
    "berries": {"berries", "strawberry", "strawberries", "blueberry", "blueberries", "raspberry", "raspberries"},
    "avocado": {"avocado", "avocados"},
    "tuna": {"tuna", "canned tuna"},
    "lettuce": {"lettuce", "romaine", "salad greens"},
    "cucumber": {"cucumber", "cucumbers"},
    "beef": {"beef", "ground beef", "minced beef"},
    "fish": {"fish", "salmon", "tilapia", "cod"},
    "whole_wheat_flour": {"whole wheat flour", "wholemeal flour", "wheat flour", "atta", "ઘઉંનો લોટ", "गेहूं का आटा", "गेहूँ का आटा"},
    "all_purpose_flour": {"all purpose flour", "plain flour", "maida", "મેંદો", "मैदा"},
    "bajra_flour": {"bajra flour", "bajri flour", "pearl millet flour", "બાજરીનો લોટ", "बाजरे का आटा"},
    "rice_flour": {"rice flour", "ચોખાનો લોટ", "चावल का आटा"},
    "besan": {"besan", "gram flour", "chickpea flour", "ચણાનો લોટ", "बेसन"},
    "tuvar_dal": {"tuvar dal", "toor dal", "arhar dal", "તુવેર દાળ", "तुअर दाल", "अरहर दाल"},
    "moong_dal": {"moong dal", "mung dal", "મગની દાળ", "मूंग दाल"},
    "chana_dal": {"chana dal", "split chickpeas", "ચણાની દાળ", "चना दाल"},
    "ghee": {"ghee", "clarified butter", "ઘી", "घी"},
    "oil": {"oil", "cooking oil", "vegetable oil", "તેલ", "तेल"},
    "jaggery": {"jaggery", "gur", "ગોળ", "गुड़"},
    "sev": {"sev", "સેવ", "सेव"},
}

INGREDIENT_DISPLAY = {
    "tomato_sauce": "tomato sauce",
    "egg": "eggs",
    "lentils": "lentils",
    "whole_wheat_flour": "whole wheat flour",
    "all_purpose_flour": "all-purpose flour",
    "bajra_flour": "bajra flour",
    "rice_flour": "rice flour",
    "besan": "besan",
    "tuvar_dal": "tuvar dal",
    "moong_dal": "moong dal",
    "chana_dal": "chana dal",
}

# Each required entry is a group: one ingredient from each group is enough.
RECIPE_RULES = [
    {"name": "Vegetable fried rice", "required": [{"rice"}, {"egg"}], "optional": {"onion", "carrot", "peas", "corn", "pepper"}},
    {"name": "Chicken fried rice", "required": [{"rice"}, {"chicken"}], "optional": {"egg", "onion", "carrot", "peas", "pepper"}},
    {"name": "Chicken rice bowl", "required": [{"chicken"}, {"rice"}], "optional": {"pepper", "onion", "spinach", "corn"}},
    {"name": "Pasta marinara", "required": [{"pasta"}, {"tomato_sauce"}], "optional": {"cheese", "garlic", "onion", "spinach"}},
    {"name": "Cheesy pasta", "required": [{"pasta"}, {"cheese"}], "optional": {"milk", "butter", "garlic", "spinach"}},
    {"name": "Breakfast omelette", "required": [{"egg"}], "optional": {"cheese", "milk", "onion", "pepper", "spinach", "tomato"}},
    {"name": "Grilled cheese", "required": [{"bread"}, {"cheese"}], "optional": {"butter", "tomato"}},
    {"name": "French toast", "required": [{"bread"}, {"egg"}, {"milk"}], "optional": {"banana", "berries", "butter"}},
    {"name": "Yogurt fruit bowl", "required": [{"yogurt"}, {"banana", "apple", "berries"}], "optional": {"oats"}},
    {"name": "Oatmeal fruit bowl", "required": [{"oats"}, {"milk", "yogurt"}], "optional": {"banana", "apple", "berries"}},
    {"name": "Avocado toast", "required": [{"bread"}, {"avocado"}], "optional": {"egg", "tomato", "cheese"}},
    {"name": "Tuna sandwich", "required": [{"bread"}, {"tuna"}], "optional": {"lettuce", "tomato", "cucumber", "cheese"}},
    {"name": "Egg sandwich", "required": [{"bread"}, {"egg"}], "optional": {"cheese", "lettuce", "tomato"}},
    {"name": "Bean rice bowl", "required": [{"rice"}, {"beans"}], "optional": {"corn", "pepper", "onion", "cheese", "avocado"}},
    {"name": "Quesadilla", "required": [{"tortilla"}, {"cheese"}], "optional": {"chicken", "beans", "pepper", "onion"}},
    {"name": "Chicken quesadilla", "required": [{"tortilla"}, {"cheese"}, {"chicken"}], "optional": {"pepper", "onion", "tomato"}},
    {"name": "Dal rice bowl", "required": [{"rice"}, {"lentils"}], "optional": {"onion", "tomato", "spinach"}},
    {"name": "Paneer rice bowl", "required": [{"rice"}, {"paneer"}], "optional": {"pepper", "onion", "tomato", "spinach"}},
    {"name": "Potato egg hash", "required": [{"potato"}, {"egg"}], "optional": {"onion", "pepper", "cheese", "spinach"}},
    {"name": "Chickpea salad", "required": [{"chickpea"}, {"cucumber", "tomato", "lettuce"}], "optional": {"onion", "pepper", "cheese"}},
    {"name": "Chicken salad", "required": [{"chicken"}, {"lettuce", "spinach"}], "optional": {"cucumber", "tomato", "avocado", "cheese"}},
    {"name": "Fish and potatoes", "required": [{"fish"}, {"potato"}], "optional": {"spinach", "peas", "carrot"}},
]


def _canonical_ingredients(name: str | None) -> set[str]:
    text = _clean_key(name)
    if not text:
        return set()
    found: set[str] = set()
    for canonical, aliases in INGREDIENT_ALIASES.items():
        for alias in aliases:
            pattern = r"(?:^|\b)" + re.escape(_clean_key(alias)).replace(r"\ ", r"\s+") + r"(?:\b|$)"
            if re.search(pattern, text):
                found.add(canonical)
                break
    # A sauce should not be treated as a fresh tomato just because its name contains the word tomato.
    if "tomato_sauce" in found:
        found.discard("tomato")
    return found


def _ingredient_label(canonical: str) -> str:
    return INGREDIENT_DISPLAY.get(canonical, canonical.replace("_", " "))


def _recipe_suggestions(products: list[Product], active_list: ShoppingList | None = None) -> list[WeeklyAssistantRecipeOut]:
    today = date.today()
    available = [
        product
        for product in products
        if float(product.quantity or 0) > 0 and (not product.expiry_date or product.expiry_date >= today)
    ]
    canonical_to_products: dict[str, list[Product]] = {}
    for product in available:
        for canonical in _canonical_ingredients(product.name):
            canonical_to_products.setdefault(canonical, []).append(product)

    active_list_canonicals: set[str] = set()
    if active_list:
        for item in active_list.items:
            if item.status != ShoppingItemStatus.skipped and item.product:
                active_list_canonicals.update(_canonical_ingredients(item.product.name))

    ranked: list[tuple[tuple, WeeklyAssistantRecipeOut]] = []
    for recipe in RECIPE_RULES:
        required_groups = recipe["required"]
        matched_required = 0
        matched_names: list[str] = []
        missing_groups: list[set[str]] = []
        matched_canonicals: set[str] = set()
        for group in required_groups:
            hit = next((canonical for canonical in sorted(group) if canonical in canonical_to_products), None)
            if hit:
                matched_required += 1
                matched_canonicals.add(hit)
                matched_names.extend(product.name for product in canonical_to_products[hit])
            else:
                missing_groups.append(group)

        # Don't surface a random recipe just because one ingredient overlaps. Almost-ready
        # means exactly one required group is missing and at least one required group is present.
        if missing_groups and (len(missing_groups) > 1 or matched_required == 0):
            continue

        status = "ready" if not missing_groups else "almost_ready"
        missing = []
        missing_on_list: list[str] = []
        if missing_groups:
            preferred = sorted(missing_groups[0])[0]
            missing = [_ingredient_label(preferred)]
            if preferred in active_list_canonicals:
                missing_on_list = list(missing)

        optional_names: list[str] = []
        for canonical in sorted(recipe["optional"]):
            if canonical in canonical_to_products:
                optional_names.extend(product.name for product in canonical_to_products[canonical])

        all_used_names = list(dict.fromkeys(matched_names + optional_names))
        use_soon = []
        for product_name in all_used_names:
            product = next((row for row in available if row.name == product_name), None)
            if product and product.expiry_date and 0 <= (product.expiry_date - today).days <= 5:
                use_soon.append(product.name)

        if status == "ready":
            reason = "You have the required ingredients in stock."
            if use_soon:
                reason = f"You can make this now, and it helps use {', '.join(use_soon[:2])} soon."
        else:
            if missing_on_list:
                reason = f"You're one ingredient away, and {missing[0]} is already on your shopping list."
            else:
                reason = f"You're one ingredient away. Add {missing[0]} to your list and this meal is ready."
            if use_soon:
                reason += f" It can also help use {', '.join(use_soon[:2])} soon."

        output = WeeklyAssistantRecipeOut(
            name=recipe["name"],
            status=status,
            reason=reason,
            matched_items=all_used_names[:10],
            missing_items=missing,
            missing_on_list=missing_on_list,
            optional_items=[],
            use_soon_items=use_soon[:4],
            matched_required=matched_required,
            total_required=len(required_groups),
        )
        rank = (0 if status == "ready" else 1, 0 if use_soon else 1, -matched_required, recipe["name"])
        ranked.append((rank, output))

    ranked.sort(key=lambda row: row[0])
    return [row[1] for row in ranked[:8]]


def _find_product_for_ingredient(products: list[Product], ingredient: str) -> Product | None:
    wanted = _clean_key(ingredient)
    wanted_canon = _canonical_ingredients(ingredient)
    for product in products:
        if _clean_key(product.name) == wanted:
            return product
        if wanted_canon and (_canonical_ingredients(product.name) & wanted_canon):
            return product
    return None


def _community_recipe_suggestions(
    db: Session,
    user: User,
    products: list[Product],
    active_list: ShoppingList | None = None,
) -> list[WeeklyAssistantRecipeOut]:
    today = date.today()
    available = [
        product for product in products
        if float(product.quantity or 0) > 0 and (not product.expiry_date or product.expiry_date >= today)
    ]
    active_products = [item.product for item in (active_list.items if active_list else []) if item.status != ShoppingItemStatus.skipped and item.product]
    rows = (
        db.query(CommunityRecipe)
        .filter(or_(CommunityRecipe.user_id == user.id, CommunityRecipe.is_shared.is_(True)))
        .order_by(CommunityRecipe.user_id.desc(), CommunityRecipe.updated_at.desc())
        .limit(100)
        .all()
    )
    output: list[WeeklyAssistantRecipeOut] = []
    for recipe in rows:
        try:
            ingredients = json.loads(recipe.ingredients_json or "[]")
        except (TypeError, ValueError, json.JSONDecodeError):
            ingredients = []
        required = [row for row in ingredients if isinstance(row, dict) and row.get("name") and not bool(row.get("optional"))]
        optional = [row for row in ingredients if isinstance(row, dict) and row.get("name") and bool(row.get("optional"))]
        if not required:
            continue
        matched_products: list[Product] = []
        missing_names: list[str] = []
        for ingredient in required:
            ingredient_name = str(ingredient.get("name") or "").strip()
            product = _find_product_for_ingredient(available, ingredient_name)
            if product:
                matched_products.append(product)
            else:
                missing_names.append(ingredient_name)
        if len(missing_names) > 1 or not matched_products:
            continue
        optional_products = []
        for ingredient in optional:
            product = _find_product_for_ingredient(available, str(ingredient.get("name") or ""))
            if product:
                optional_products.append(product)
        used = list(dict.fromkeys([row.name for row in matched_products + optional_products]))
        use_soon = [
            row.name for row in matched_products + optional_products
            if row.expiry_date and 0 <= (row.expiry_date - today).days <= 5
        ]
        missing_on_list: list[str] = []
        if missing_names and _find_product_for_ingredient(active_products, missing_names[0]):
            missing_on_list = [missing_names[0]]
        status = "ready" if not missing_names else "almost_ready"
        source = "Your recipe" if recipe.user_id == user.id else "Community recipe"
        if status == "ready":
            reason = f"{source}: required ingredients are already in stock."
            if use_soon:
                reason += f" It also helps use {', '.join(list(dict.fromkeys(use_soon))[:2])} soon."
        else:
            reason = f"{source}: you're one ingredient away — {missing_names[0]}."
            if missing_on_list:
                reason += " It is already on the active grocery list."
            if use_soon:
                reason += f" It can also help use {', '.join(list(dict.fromkeys(use_soon))[:2])} soon."
        output.append(WeeklyAssistantRecipeOut(
            name=recipe.name,
            status=status,
            reason=reason,
            matched_items=used[:10],
            missing_items=missing_names[:1],
            missing_on_list=missing_on_list,
            optional_items=[str(row.get("name") or "") for row in optional[:8] if row.get("name")],
            use_soon_items=list(dict.fromkeys(use_soon))[:4],
            matched_required=len(matched_products),
            total_required=len(required),
        ))
    output.sort(key=lambda row: (0 if row.status == "ready" else 1, 0 if row.use_soon_items else 1, -row.matched_required, row.name.casefold()))
    return output[:10]


def _combined_recipe_suggestions(
    db: Session,
    user: User,
    products: list[Product],
    active_list: ShoppingList | None = None,
) -> list[WeeklyAssistantRecipeOut]:
    candidates = _recipe_suggestions(products, active_list) + _community_recipe_suggestions(db, user, products, active_list)
    unique: dict[str, WeeklyAssistantRecipeOut] = {}
    for row in candidates:
        key = _clean_key(row.name)
        current = unique.get(key)
        if current is None or (row.status == "ready" and current.status != "ready") or (row.use_soon_items and not current.use_soon_items):
            unique[key] = row
    ranked = list(unique.values())
    ranked.sort(key=lambda row: (0 if row.status == "ready" else 1, 0 if row.use_soon_items else 1, -row.matched_required, row.name.casefold()))
    return ranked[:12]


def _is_household_water_ingredient(name: str | None) -> bool:
    key = _clean_key(name)
    return key in {
        _clean_key(value)
        for value in ("water", "warm water", "hot water", "cold water", "tap water", "ice water", "પાણી", "ગરમ પાણી", "पानी", "गुनगुना पानी", "eau", "eau tiède")
    }


@router.post("/houses/{house_id}/recipes/add-missing", response_model=RecipeMissingAddOut)
def add_recipe_missing_items(
    house_id: int,
    payload: RecipeMissingAddIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    ingredients = [" ".join(value.strip().split()) for value in payload.ingredients if value and value.strip()][:8]
    if not ingredients:
        raise HTTPException(status_code=400, detail="No missing ingredients were provided")

    shopping_list = None
    if payload.list_id:
        shopping_list = db.query(ShoppingList).options(joinedload(ShoppingList.items)).filter(
            ShoppingList.id == payload.list_id,
            ShoppingList.house_id == house_id,
            ShoppingList.is_done.is_(False),
        ).first()
        if not shopping_list:
            raise HTTPException(status_code=404, detail="Active shopping list not found")
    else:
        shopping_list = db.query(ShoppingList).options(joinedload(ShoppingList.items)).filter(
            ShoppingList.house_id == house_id,
            ShoppingList.is_done.is_(False),
        ).order_by(ShoppingList.created_at.desc()).first()

    if not shopping_list:
        ensure_active_shopping_list_limit(db, house_id, user)
        shopping_list = ShoppingList(house_id=house_id, title="Meal ideas shopping", created_by_id=user.id)
        db.add(shopping_list)
        db.flush()

    products = db.query(Product).filter(Product.house_id == house_id).all()
    section = db.query(Section).filter(
        Section.house_id == house_id,
        or_(Section.name.ilike("%pantry%"), Section.name.ilike("%grocery%"), Section.name.ilike("%other%")),
    ).order_by(Section.sort_order.asc(), Section.id.asc()).first()
    if not section:
        section = db.query(Section).filter(Section.house_id == house_id).order_by(Section.sort_order.asc(), Section.id.asc()).first()
    if not section:
        section = Section(house_id=house_id, name="Pantry", icon="pantry", sort_order=0)
        db.add(section)
        db.flush()

    existing_item_product_ids = {item.product_id for item in shopping_list.items}
    added_items: list[str] = []
    created_products: list[str] = []
    for ingredient in ingredients:
        product = _find_product_for_ingredient(products, ingredient)
        if not product:
            ensure_product_limit(db, house_id, user)
            product = Product(
                house_id=house_id,
                section_id=section.id,
                name=ingredient[:180],
                quantity=0,
                unit="pcs",
                low_stock_threshold=1,
                notes=f"Added automatically from meal idea{': ' + payload.recipe_name if payload.recipe_name else ''}.",
            )
            db.add(product)
            db.flush()
            products.append(product)
            created_products.append(product.name)
        if product.id in existing_item_product_ids:
            continue
        db.add(ShoppingListItem(
            shopping_list_id=shopping_list.id,
            product_id=product.id,
            requested_quantity=1,
            bought_quantity=1,
            message=f"Meal idea{': ' + payload.recipe_name if payload.recipe_name else ''}",
        ))
        existing_item_product_ids.add(product.id)
        added_items.append(product.name)

    if added_items:
        log_activity(
            db,
            house_id=house_id,
            user=user,
            action="meal_idea_items_added",
            message=f"{display_name(user)} added {', '.join(added_items[:4])}{' and more' if len(added_items) > 4 else ''} from a meal idea to {shopping_list.title}.",
            entity_type="shopping_list",
            entity_id=shopping_list.id,
        )
    db.commit()
    return RecipeMissingAddOut(
        list_id=shopping_list.id,
        list_title=shopping_list.title,
        added_items=added_items,
        created_products=created_products,
        message=(
            f"Added {', '.join(added_items)} to {shopping_list.title}." if added_items
            else f"Those ingredient(s) are already on {shopping_list.title}."
        ),
    )


@router.post("/houses/{house_id}/recipes/add-shopping", response_model=RecipeShoppingAddOut)
def add_recipe_shopping_items(
    house_id: int,
    payload: RecipeShoppingAddIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not payload.ingredients:
        raise HTTPException(status_code=400, detail="Select at least one ingredient")

    if payload.list_id:
        shopping_list = db.query(ShoppingList).options(joinedload(ShoppingList.items)).filter(
            ShoppingList.id == payload.list_id, ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False)
        ).first()
        if not shopping_list:
            raise HTTPException(status_code=404, detail="Active shopping list not found")
    else:
        shopping_list = db.query(ShoppingList).options(joinedload(ShoppingList.items)).filter(
            ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False)
        ).order_by(ShoppingList.created_at.desc()).first()

    if not shopping_list:
        ensure_active_shopping_list_limit(db, house_id, user)
        shopping_list = ShoppingList(house_id=house_id, title="Recipe shopping", created_by_id=user.id)
        db.add(shopping_list); db.flush()

    products = db.query(Product).filter(Product.house_id == house_id).all()
    section = db.query(Section).filter(Section.house_id == house_id).order_by(Section.sort_order.asc(), Section.id.asc()).first()
    if not section:
        section = Section(house_id=house_id, name="Pantry", icon="pantry", sort_order=0)
        db.add(section); db.flush()

    existing = {item.product_id: item for item in shopping_list.items}
    added_items, updated_items, created_products = [], [], []
    for row in payload.ingredients[:40]:
        name = " ".join(row.name.strip().split())
        if not name: continue
        # Household/tap water is a process ingredient, not a grocery recommendation.
        # It is accepted only when the user explicitly chose the manual action.
        if payload.mode != "manual" and _is_household_water_ingredient(name):
            continue
        product = _find_product_for_ingredient(products, name)
        if not product:
            ensure_product_limit(db, house_id, user)
            product = Product(house_id=house_id, section_id=section.id, name=name[:180], quantity=0, unit=(row.unit or "pcs")[:32], low_stock_threshold=0, notes=f"Created from recipe shopping: {payload.recipe_name or 'Recipe'}")
            db.add(product); db.flush(); products.append(product); created_products.append(product.name)
        quantity = max(float(row.quantity), 0.0001)
        message = row.tag or f"Recipe · {payload.recipe_name or 'Meal'}"
        if product.id in existing:
            item = existing[product.id]
            # Recipe actions represent the target quantity needed for this plan. Keep the larger request instead of accidentally doubling it.
            if quantity > float(item.requested_quantity or 0):
                item.requested_quantity = quantity
                item.bought_quantity = max(float(item.bought_quantity or 0), quantity)
            item.message = message
            item.status = ShoppingItemStatus.to_buy
            updated_items.append(product.name)
        else:
            item = ShoppingListItem(shopping_list_id=shopping_list.id, product_id=product.id, requested_quantity=quantity, bought_quantity=quantity, message=message)
            db.add(item); existing[product.id]=item; added_items.append(product.name)

    log_activity(db, house_id=house_id, user=user, action="recipe_shopping_added", message=f"{display_name(user)} added recipe requirements for {payload.recipe_name or 'a meal'} to {shopping_list.title}.", entity_type="shopping_list", entity_id=shopping_list.id)
    db.commit()
    return RecipeShoppingAddOut(list_id=shopping_list.id, list_title=shopping_list.title, added_items=added_items, updated_items=updated_items, created_products=created_products, message=f"Recipe quantities are ready in {shopping_list.title}.")


@router.get("/houses/{house_id}/weekly-assistant", response_model=WeeklyAssistantOut)
def weekly_assistant(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")

    products = (
        db.query(Product)
        .options(joinedload(Product.store_prices))
        .filter(Product.house_id == house_id)
        .order_by(Product.name.asc())
        .all()
    )
    today = date.today()
    low_stock_products: list[Product] = []
    out_products: list[Product] = []
    expiring_products: list[Product] = []
    expired_products: list[Product] = []
    for product in products:
        quantity = float(product.quantity or 0)
        threshold = product.low_stock_threshold
        if quantity <= 0:
            out_products.append(product)
        elif threshold is not None and quantity <= float(threshold):
            low_stock_products.append(product)
        if product.expiry_date:
            days = (product.expiry_date - today).days
            if days < 0:
                expired_products.append(product)
            elif days <= 5:
                expiring_products.append(product)

    active_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.store_prices))
        .filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    active_product_ids = {item.product_id for item in (active_list.items if active_list else []) if item.status != ShoppingItemStatus.skipped}
    suggestions: list[WeeklyAssistantSuggestedItemOut] = []
    for product in out_products + low_stock_products:
        if product.id in active_product_ids:
            continue
        reason = "Out of stock" if product in out_products else "Low stock"
        current_qty = max(float(product.quantity or 0), 0)
        threshold = max(float(product.low_stock_threshold or 1), 1)
        buy_qty = threshold if current_qty <= 0 else max(threshold - current_qty, 1)
        suggestions.append(
            WeeklyAssistantSuggestedItemOut(
                product_id=product.id,
                product_name=product.name,
                reason=reason,
                requested_quantity=round(buy_qty, 2),
            )
        )

    best_store_name = None
    best_store_total = None
    alternative_name = None
    alternative_total = None
    potential_savings = None
    house_plan = get_house_plan(db, house_id)
    # Store-level basket intelligence is a Family Plus / Household Pro feature.
    # Keep the weekly assistant useful on lower tiers without exposing premium comparison data.
    if active_list and house_plan.key in {PlanName.family, PlanName.pro}:
        comparison = _basket_comparison(db, house_id, active_list.id, user=user, include_live=False)
        if comparison.best_single_store and comparison.best_single_store.complete:
            best_store_name = comparison.best_single_store.store_name
            best_store_total = comparison.best_single_store.known_total
        complete_options = [row for row in comparison.store_options if row.complete]
        if len(complete_options) > 1:
            ordered = sorted(complete_options, key=lambda row: row.known_total)
            first = ordered[0]
            second = ordered[1]
            best_store_name = first.store_name
            best_store_total = first.known_total
            alternative_name = second.store_name
            alternative_total = second.known_total
            potential_savings = round(max(second.known_total - first.known_total, 0), 2)

    savings = _savings_summary(db, house, user)
    recipes = _combined_recipe_suggestions(db, user, products, active_list)
    use_soon_names = [product.name for product in expiring_products if product not in expired_products]
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    long_held = []
    for product in products:
        if float(product.quantity or 0) <= 0 or not product.last_bought_at:
            continue
        if product.expiry_date and product.expiry_date < today:
            continue
        last_bought = product.last_bought_at
        if last_bought.tzinfo is None:
            last_bought = last_bought.replace(tzinfo=timezone.utc)
        if last_bought <= stale_cutoff:
            long_held.append(product.name)

    if suggestions:
        message = f"Your household has {len(suggestions)} item{'s' if len(suggestions) != 1 else ''} worth adding to the next trip."
    elif active_list:
        message = "Your low-stock items are already covered. Use the list comparison to decide where this trip is likely to cost less."
    else:
        message = "Your inventory looks stable. Create a list when you are ready and the assistant will turn it into a store-aware shopping plan."

    return WeeklyAssistantOut(
        currency_code=currency_for_country(user.country),
        house_id=house.id,
        house_name=house.name,
        generated_at=datetime.now(timezone.utc),
        low_stock=[product.name for product in low_stock_products[:12]],
        out_of_stock=[product.name for product in out_products[:12]],
        expiring_soon=use_soon_names[:12],
        expired=[product.name for product in expired_products[:12]],
        long_held=long_held[:12],
        suggested_missing=[item.product_name for item in suggestions[:16]],
        suggested_items=suggestions[:16],
        active_list_id=active_list.id if active_list else None,
        active_list_title=active_list.title if active_list else None,
        active_list_items=len(active_list.items) if active_list else 0,
        best_store_name=best_store_name,
        best_store_total=best_store_total,
        alternative_store_name=alternative_name,
        alternative_store_total=alternative_total,
        potential_store_savings=potential_savings,
        monthly_savings=savings.estimated_savings,
        recipes=recipes,
        message=message,
    )

# ---------------------------------------------------------------------------
# V91 · GHM Autopilot / Household Grocery CFO
# ---------------------------------------------------------------------------
# These helpers deliberately prefer explainable household data over invented
# estimates. Every money-saving number is either verified from a receipt/list
# or clearly marked as a potential opportunity.

_RECALL_FEED_URL = "https://recalls-rappels.canada.ca/en/feed/cfia-alerts-recalls"
_RECALL_SOURCE_URL = "https://recalls-rappels.canada.ca/en"
_RECALL_CACHE: dict[str, object] = {"fetched_at": None, "items": []}


def _receipt_label(receipt: Receipt) -> str:
    when = receipt.receipt_date.isoformat() if receipt.receipt_date else receipt.created_at.date().isoformat()
    return f"{receipt.store_name or 'Receipt'} · {when}"


def _money_value(line: ReceiptLineItem) -> float | None:
    if line.line_total is not None:
        return round(float(line.line_total), 2)
    if line.unit_price is not None:
        return round(float(line.unit_price) * max(float(line.quantity or 1), 1), 2)
    return None


def _receipt_guardian(db: Session, house_id: int) -> ReceiptGuardianOut:
    receipts = (
        db.query(Receipt)
        .options(joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product))
        .filter(Receipt.house_id == house_id)
        .order_by(Receipt.receipt_date.desc().nullslast(), Receipt.created_at.desc())
        .limit(6)
        .all()
    )
    issues: list[ReceiptGuardianIssueOut] = []

    for receipt in receipts:
        product_lines = [row for row in receipt.line_items if row.line_type == "product" and row.is_selected]
        grouped: dict[str, list[ReceiptLineItem]] = {}
        for line in product_lines:
            key = _clean_key(line.normalized_name or line.description)
            if key:
                grouped.setdefault(key, []).append(line)

        for key, group in grouped.items():
            if len(group) < 2:
                continue
            priced = [row for row in group if _money_value(row) is not None]
            if len(priced) < 2:
                continue
            values = [_money_value(row) or 0 for row in priced]
            # Only flag very similar repeated lines. Different totals usually mean legitimate
            # variants/weights rather than an accidental duplicate charge.
            if max(values) - min(values) <= 0.05:
                amount = round(min(values), 2)
                issues.append(ReceiptGuardianIssueOut(
                    key=f"duplicate:{receipt.id}:{key}",
                    receipt_id=receipt.id,
                    receipt_label=_receipt_label(receipt),
                    store_name=receipt.store_name,
                    receipt_date=receipt.receipt_date,
                    severity="check",
                    issue_type="possible_duplicate",
                    title="Possible duplicate line to review",
                    detail=f"{priced[0].description} appears {len(priced)} times with nearly identical amounts. This can be valid when multiple units were scanned separately, so verify the receipt before contacting the store.",
                    amount_to_review=amount,
                    product_name=priced[0].description,
                ))

        for line in product_lines:
            qty = float(line.quantity or 1)
            if line.unit_price is not None and line.line_total is not None and qty > 0:
                expected = float(line.unit_price) * qty
                expected -= max(float(line.discount_amount or 0), 0)
                expected += max(float(line.tax_amount or 0), 0)
                diff = abs(float(line.line_total) - expected)
                if diff >= max(0.25, abs(expected) * 0.05):
                    issues.append(ReceiptGuardianIssueOut(
                        key=f"math:{receipt.id}:{line.id}",
                        receipt_id=receipt.id,
                        receipt_label=_receipt_label(receipt),
                        store_name=receipt.store_name,
                        receipt_date=receipt.receipt_date,
                        severity="check",
                        issue_type="line_math",
                        title="Line total does not match the detected quantity × unit price",
                        detail=f"The scan read {qty:g} × ${float(line.unit_price):.2f}, while the line total is ${float(line.line_total):.2f}. OCR or a discount/tax detail may explain this, so compare it with the original receipt.",
                        amount_to_review=round(diff, 2),
                        product_name=line.description,
                    ))

            current_price = float(line.unit_price or 0)
            if current_price <= 0:
                continue
            history_query = (
                db.query(ReceiptLineItem)
                .join(Receipt, Receipt.id == ReceiptLineItem.receipt_id)
                .filter(
                    ReceiptLineItem.house_id == house_id,
                    ReceiptLineItem.id != line.id,
                    ReceiptLineItem.line_type == "product",
                    ReceiptLineItem.unit_price.is_not(None),
                )
            )
            if line.matched_product_id:
                history_query = history_query.filter(ReceiptLineItem.matched_product_id == line.matched_product_id)
            else:
                normalized = line.normalized_name or _clean_key(line.description)
                history_query = history_query.filter(ReceiptLineItem.normalized_name == normalized)
            if receipt.store_name:
                same_store = history_query.filter(Receipt.store_name.ilike(receipt.store_name)).limit(10).all()
            else:
                same_store = []
            history = same_store if len(same_store) >= 2 else history_query.limit(12).all()
            historical_prices = [float(row.unit_price) for row in history if row.unit_price and float(row.unit_price) > 0]
            if len(historical_prices) >= 2:
                typical = float(median(historical_prices))
                delta = current_price - typical
                if typical > 0 and delta >= max(1.0, typical * 0.25):
                    issues.append(ReceiptGuardianIssueOut(
                        key=f"jump:{receipt.id}:{line.id}",
                        receipt_id=receipt.id,
                        receipt_label=_receipt_label(receipt),
                        store_name=receipt.store_name,
                        receipt_date=receipt.receipt_date,
                        severity="info",
                        issue_type="price_jump",
                        title="Price is much higher than your recent history",
                        detail=f"You paid ${current_price:.2f} per unit. Your recent recorded median for this item is ${typical:.2f}. Prices and package sizes can change; treat this as a prompt to verify the item, size and promotion conditions.",
                        amount_to_review=round(delta * max(qty, 1), 2),
                        product_name=line.description,
                    ))

    # Keep the dashboard useful instead of overwhelming users with every OCR curiosity.
    severity_rank = {"check": 0, "info": 1}
    issues = sorted(issues, key=lambda row: (severity_rank.get(row.severity, 2), -(row.amount_to_review or 0)))[:10]
    amount = round(sum(float(row.amount_to_review or 0) for row in issues if row.severity == "check"), 2)
    if issues:
        message = "These are review prompts, not confirmed retailer errors. Compare each item with the original receipt, package size, flyer terms and discounts before taking action."
    else:
        message = "No obvious duplicate, arithmetic or unusual-price signals were found in the most recent reviewed receipts."
    return ReceiptGuardianOut(receipts_checked=len(receipts), issues=issues, amount_to_review=amount, message=message)


def _purchase_history_by_product(db: Session, house_id: int) -> dict[int, list[tuple[date, float]]]:
    rows = (
        db.query(ReceiptLineItem, Receipt)
        .join(Receipt, Receipt.id == ReceiptLineItem.receipt_id)
        .filter(
            ReceiptLineItem.house_id == house_id,
            ReceiptLineItem.matched_product_id.is_not(None),
            ReceiptLineItem.line_type == "product",
            ReceiptLineItem.unit_price.is_not(None),
        )
        .order_by(Receipt.created_at.desc())
        .all()
    )
    result: dict[int, list[tuple[date, float]]] = {}
    for line, receipt in rows:
        if not line.matched_product_id or not line.unit_price or float(line.unit_price) <= 0:
            continue
        purchase_date = receipt.receipt_date or receipt.created_at.date()
        result.setdefault(int(line.matched_product_id), []).append((purchase_date, float(line.unit_price)))
    return result


def _stock_up_suggestions(db: Session, house_id: int) -> list[StockUpSuggestionOut]:
    products = (
        db.query(Product)
        .options(joinedload(Product.store_prices), joinedload(Product.section))
        .filter(Product.house_id == house_id)
        .all()
    )
    histories = _purchase_history_by_product(db, house_id)
    suggestions: list[StockUpSuggestionOut] = []
    for product in products:
        history = histories.get(product.id, [])
        historical_prices = [price for _, price in history if price > 0]
        if len(historical_prices) < 3:
            continue
        current_entries = [entry for entry in (product.store_prices or []) if entry.price is not None and float(entry.price) > 0]
        if current_entries:
            current_entry = min(current_entries, key=lambda row: float(row.price))
            current_price = float(current_entry.price)
            store_name = current_entry.store_name
        elif product.price and float(product.price) > 0:
            current_entry = None
            current_price = float(product.price)
            store_name = product.store_name
        else:
            continue
        typical = float(median(historical_prices))
        if typical <= 0 or current_price >= typical * 0.88:
            continue
        price_delta = typical - current_price
        if price_delta < 0.25:
            continue

        purchase_dates = sorted({when for when, _ in history})
        avg_days = None
        if len(purchase_dates) >= 2:
            intervals = [(purchase_dates[idx] - purchase_dates[idx - 1]).days for idx in range(1, len(purchase_dates))]
            positive = [value for value in intervals if value > 0]
            if positive:
                avg_days = round(sum(positive) / len(positive), 1)

        section_name = (product.section.name if product.section else "").casefold()
        fresh = any(token in section_name for token in ("produce", "fruit", "vegetable", "dairy", "meat", "seafood", "fresh"))
        if avg_days is not None and avg_days <= 8:
            recommended = 3
        elif avg_days is not None and avg_days <= 18:
            recommended = 2
        else:
            recommended = 1
        if fresh:
            recommended = min(recommended, 2)
        if float(product.quantity or 0) >= max(recommended, 2):
            recommended = 1

        discount = int(round((price_delta / typical) * 100))
        potential = round(price_delta * recommended, 2)
        cadence = f" Your household has bought it about every {avg_days:g} days." if avg_days is not None else ""
        suggestions.append(StockUpSuggestionOut(
            product_id=product.id,
            product_name=product.name,
            store_name=store_name,
            current_price=round(current_price, 2),
            typical_price=round(typical, 2),
            discount_percent=max(discount, 1),
            history_points=len(historical_prices),
            average_days_between_purchases=avg_days,
            recommended_quantity=recommended,
            potential_savings=potential,
            reason=f"Current saved price is about {discount}% below your household's recorded median.{cadence}",
            caution="Only stock up if the package size, shelf life and storage space make sense for your household.",
        ))
    return sorted(suggestions, key=lambda row: (-row.potential_savings, -row.discount_percent, row.product_name))[:8]


def _savings_ledger(db: Session, house: House, user: User) -> SavingsLedgerOut:
    summary = _savings_summary(db, house, user)
    month_start, month_end, month_label = _month_window()
    entries: list[SavingsLedgerEntryOut] = []

    receipts = (
        db.query(Receipt)
        .filter(
            Receipt.house_id == house.id,
            or_(
                and_(Receipt.receipt_date.is_not(None), Receipt.receipt_date >= month_start.date(), Receipt.receipt_date < month_end.date()),
                and_(Receipt.receipt_date.is_(None), Receipt.created_at >= month_start, Receipt.created_at < month_end),
            ),
        )
        .order_by(Receipt.receipt_date.desc().nullslast(), Receipt.created_at.desc())
        .all()
    )
    for receipt in receipts:
        discount = max(float(receipt.discount_amount or 0), 0)
        if discount <= 0:
            continue
        entries.append(SavingsLedgerEntryOut(
            key=f"receipt-discount:{receipt.id}",
            occurred_on=receipt.receipt_date or receipt.created_at.date(),
            kind="receipt_discount",
            title=f"Discount recorded at {receipt.store_name or 'grocery store'}",
            amount=round(discount, 2),
            verified=True,
            evidence=f"Receipt #{receipt.id} records ${discount:.2f} in discounts.",
            source_label="Reviewed receipt",
            href=f"/houses/{house.id}/receipts",
        ))

    completed_lists = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.store_prices))
        .filter(
            ShoppingList.house_id == house.id,
            ShoppingList.is_done.is_(True),
            ShoppingList.completed_at >= month_start,
            ShoppingList.completed_at < month_end,
        )
        .all()
    )
    for shopping_list in completed_lists:
        for item in shopping_list.items:
            if item.status != ShoppingItemStatus.in_cart or item.bought_price is None:
                continue
            bought = float(item.bought_price)
            alternatives = [
                float(entry.price) for entry in (item.product.store_prices or [])
                if entry.price is not None
                and float(entry.price) > bought
                and (not item.bought_store_name or entry.store_name.casefold() != item.bought_store_name.casefold())
            ]
            if not alternatives:
                continue
            comparison = min(alternatives)
            qty = max(float(item.bought_quantity or item.requested_quantity or 1), 1)
            saved = round((comparison - bought) * qty, 2)
            if saved <= 0:
                continue
            entries.append(SavingsLedgerEntryOut(
                key=f"price-choice:{shopping_list.id}:{item.id}",
                occurred_on=shopping_list.completed_at.date() if shopping_list.completed_at else None,
                kind="lower_price_choice",
                title=f"Lower recorded price for {item.product.name}",
                amount=saved,
                verified=True,
                evidence=f"Bought at ${bought:.2f}; another saved store price was ${comparison:.2f}. Quantity: {qty:g}.",
                source_label="Completed shopping list",
                href=f"/houses/{house.id}/shopping",
            ))

    active_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.house_id == house.id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    potential_total = 0.0
    if active_list:
        comparison = _basket_comparison(db, house.id, active_list.id, user=user, include_live=False)
        complete_options = sorted([row for row in comparison.store_options if row.complete], key=lambda row: row.known_total)
        # A single shopping trip can only realize one competing basket strategy. Keep only
        # the strongest supported opportunity so the ledger never double-counts a one-store
        # saving and a two-store saving for the same active list.
        trip_opportunities: list[SavingsLedgerEntryOut] = []
        if len(complete_options) >= 2:
            best, next_best = complete_options[0], complete_options[1]
            opportunity = round(max(next_best.known_total - best.known_total, 0), 2)
            if opportunity > 0:
                trip_opportunities.append(SavingsLedgerEntryOut(
                    key=f"trip-opportunity:{active_list.id}",
                    occurred_on=date.today(),
                    kind="trip_opportunity",
                    title=f"Potential lower-cost trip at {best.store_name}",
                    amount=opportunity,
                    verified=False,
                    evidence=f"Based on currently known prices for the complete list: {best.store_name} ${best.known_total:.2f} vs {next_best.store_name} ${next_best.known_total:.2f}.",
                    source_label="Current trip comparison",
                    href=f"/houses/{house.id}/shopping",
                ))
        if comparison.split_store_worth_it and comparison.split_store_savings and comparison.split_store_savings > 0:
            split_amount = round(float(comparison.split_store_savings), 2)
            trip_opportunities.append(SavingsLedgerEntryOut(
                key=f"split-trip:{active_list.id}",
                occurred_on=date.today(),
                kind="trip_opportunity",
                title="Potential two-store trip saving",
                amount=split_amount,
                verified=False,
                evidence=comparison.split_store_recommendation or "Current list prices support a lower-cost two-store combination.",
                source_label="Current trip comparison",
                href=f"/houses/{house.id}/shopping",
            ))
        if trip_opportunities:
            best_trip_opportunity = max(trip_opportunities, key=lambda row: row.amount)
            potential_total += best_trip_opportunity.amount
            entries.append(best_trip_opportunity)

    # A stock-up suggestion for an item already on the active trip can overlap with the
    # trip-comparison opportunity above. Exclude those products from the ledger total so
    # "potential savings" remains conservative rather than additive on the same purchase.
    active_product_ids = {item.product_id for item in active_list.items} if active_list else set()
    for suggestion in _stock_up_suggestions(db, house.id)[:4]:
        if suggestion.product_id in active_product_ids:
            continue
        potential_total += suggestion.potential_savings
        entries.append(SavingsLedgerEntryOut(
            key=f"stock-up:{suggestion.product_id}",
            occurred_on=date.today(),
            kind="stock_up_opportunity",
            title=f"Potential stock-up value on {suggestion.product_name}",
            amount=suggestion.potential_savings,
            verified=False,
            evidence=f"Current saved price ${suggestion.current_price:.2f} vs recorded median ${suggestion.typical_price:.2f}; suggested quantity {suggestion.recommended_quantity}.",
            source_label="Price history",
            href=f"/houses/{house.id}/inventory",
        ))

    entries.sort(key=lambda row: (0 if row.verified else 1, -(row.occurred_on or date.min).toordinal()))
    verified_total = round(summary.estimated_savings, 2)
    potential_total = round(potential_total, 2)
    net = round(verified_total - summary.plan_monthly_cost, 2)
    return SavingsLedgerOut(
        currency_code=summary.currency_code,
        month_label=month_label,
        verified_total=verified_total,
        potential_total=potential_total,
        plan_monthly_cost=summary.plan_monthly_cost,
        verified_after_plan_cost=net,
        entries=entries[:24],
        message="Verified savings use recorded receipt/list evidence. Potential savings are opportunities only and are never counted as money saved until the household completes the action.",
    )


def _fetch_food_recalls() -> tuple[list[dict[str, str]], datetime]:
    now = datetime.now(timezone.utc)
    cached_at = _RECALL_CACHE.get("fetched_at")
    cached_items = _RECALL_CACHE.get("items")
    if isinstance(cached_at, datetime) and isinstance(cached_items, list) and now - cached_at < timedelta(hours=6):
        return cached_items, cached_at
    response = requests.get(
        _RECALL_FEED_URL,
        timeout=6,
        headers={"User-Agent": "GroceryHouseManager/1.0 recall-screening"},
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)
    items: list[dict[str, str]] = []
    for item in root.findall(".//item")[:80]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = re.sub(r"<[^>]+>", " ", item.findtext("description") or "")
        published = (item.findtext("pubDate") or "").strip()
        if title and link:
            items.append({"title": title, "link": link, "description": " ".join(description.split()), "published": published})
    _RECALL_CACHE["fetched_at"] = now
    _RECALL_CACHE["items"] = items
    return items, now


def _recall_guardian(db: Session, house_id: int) -> RecallGuardianOut:
    products = db.query(Product).filter(Product.house_id == house_id, Product.quantity > 0).order_by(Product.name.asc()).all()
    try:
        alerts, fetched_at = _fetch_food_recalls()
    except Exception:
        return RecallGuardianOut(
            source_url=_RECALL_SOURCE_URL,
            available=False,
            checked_products=len(products),
            matches=[],
            fetched_at=None,
            message="The Government of Canada food-recall feed could not be reached right now. Inventory and shopping continue to work normally; try the safety check again later.",
        )

    matches: list[RecallMatchOut] = []
    for product in products:
        name_key = _clean_key(product.name)
        brand_key = _clean_key(product.brand)
        barcode = re.sub(r"\D", "", product.barcode or "")
        name_tokens = [token for token in name_key.split() if len(token) >= 3]
        for alert in alerts:
            haystack = _clean_key(f"{alert['title']} {alert['description']}")
            digits = re.sub(r"\D", "", f"{alert['title']} {alert['description']}")
            reason = None
            if barcode and len(barcode) >= 8 and barcode in digits:
                reason = "UPC/barcode appears in the alert text"
            elif brand_key and len(brand_key) >= 4 and brand_key in haystack and any(token in haystack for token in name_tokens[:3]):
                reason = "brand and product wording overlap the alert"
            elif len(name_tokens) >= 2 and len(name_key) >= 8 and name_key in haystack:
                reason = "product name closely matches the alert wording"
            elif len(name_tokens) == 1 and len(name_tokens[0]) >= 7 and name_tokens[0] in haystack:
                reason = "distinctive product name appears in the alert wording"
            if reason:
                matches.append(RecallMatchOut(
                    product_id=product.id,
                    product_name=product.name,
                    alert_title=alert["title"],
                    published_at=alert.get("published") or None,
                    alert_url=alert["link"],
                    match_reason=reason,
                ))
                break

    message = (
        "Possible matches need package-level verification. Compare brand, product name, size, UPC and lot code with the official recall notice before deciding a product is affected."
        if matches else
        "No likely wording or barcode matches were found between in-stock products and the current Government of Canada food-alert feed. This is a screening aid, not a guarantee that every recall can be matched automatically."
    )
    return RecallGuardianOut(
        source_url=_RECALL_SOURCE_URL,
        available=True,
        checked_products=len(products),
        matches=matches[:12],
        fetched_at=fetched_at,
        message=message,
    )


def _known_price_for_ingredient(products: list[Product], ingredient: str) -> tuple[float | None, str | None]:
    product = _find_product_for_ingredient(products, ingredient)
    if not product:
        return None, None
    prices = [float(entry.price) for entry in (product.store_prices or []) if entry.price is not None and float(entry.price) > 0]
    if prices:
        return min(prices), product.name
    if product.price is not None and float(product.price) > 0:
        return float(product.price), product.name
    return None, product.name


def _community_price_pulse(db: Session, house_id: int, user: User) -> CommunityPricePulseOut:
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    cutoff = date.today() - timedelta(days=21)
    geo_filters = [CommunityPriceObservation.observed_on >= cutoff, CommunityPriceObservation.source_house_id != house_id]
    if user.city:
        geo_filters.append(CommunityPriceObservation.city.ilike(user.city.strip()))
    elif user.country:
        geo_filters.append(CommunityPriceObservation.country.ilike(user.country.strip()))
    network_rows = db.query(CommunityPriceObservation).filter(*geo_filters).order_by(CommunityPriceObservation.observed_on.desc()).limit(500).all()

    active_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product))
        .filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    products = [item.product for item in (active_list.items if active_list else []) if item.status != ShoppingItemStatus.skipped and item.product]
    signals: list[CommunityPriceSignalOut] = []
    matched_products: set[int] = set()
    for product in products:
        product_key = _clean_key(product.name)
        barcode = re.sub(r"\D", "", product.barcode or "")
        matches = [row for row in network_rows if (barcode and row.barcode and re.sub(r"\D", "", row.barcode) == barcode) or row.product_key == product_key]
        if not matches:
            continue
        matched_products.add(product.id)
        by_store: dict[str, list[CommunityPriceObservation]] = {}
        for row in matches:
            by_store.setdefault(row.store_name, []).append(row)
        for store_name, rows in by_store.items():
            rows.sort(key=lambda row: (row.observed_on, row.created_at), reverse=True)
            latest = rows[0]
            recent_prices = [float(row.price) for row in rows[:8] if float(row.price) > 0]
            if not recent_prices:
                continue
            signals.append(CommunityPriceSignalOut(
                product_name=product.name,
                store_name=store_name,
                price=round(float(median(recent_prices)), 2),
                city=latest.city,
                observed_on=latest.observed_on,
                observation_count=len(rows),
                age_days=max((date.today() - latest.observed_on).days, 0),
            ))
    signals.sort(key=lambda row: (row.age_days, row.price, row.product_name))
    where = user.city or user.country or "your area"
    if signals:
        message = f"Community Price Pulse found {len(signals)} recent store signal{'s' if len(signals) != 1 else ''} for {len(matched_products)} item{'s' if len(matched_products) != 1 else ''} on your active list near {where}. Community observations are supporting evidence, not guaranteed shelf prices."
    elif active_list:
        message = "No matching community price signal is mature enough for the active list yet. The network improves only from households that explicitly opt in."
    else:
        message = "Create a grocery list to see whether opted-in community receipt prices can strengthen your trip decisions."
    return CommunityPricePulseOut(
        sharing_enabled=bool(house.contribute_community_prices),
        recent_observations=len(network_rows),
        matched_list_items=len(matched_products),
        signals=signals[:12],
        message=message,
    )


@router.get("/houses/{house_id}/community-price-pulse", response_model=CommunityPricePulseOut)
def community_price_pulse(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return _community_price_pulse(db, house_id, user)


@router.post("/houses/{house_id}/community-price-sharing", response_model=CommunityPricePulseOut)
def community_price_sharing(
    house_id: int,
    payload: CommunityPriceSharingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    if house.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="Only the house owner can change Community Price Pulse sharing.")
    house.contribute_community_prices = bool(payload.enabled)
    if not payload.enabled:
        db.query(CommunityPriceObservation).filter(CommunityPriceObservation.source_house_id == house_id).delete(synchronize_session=False)
    db.commit()
    return _community_price_pulse(db, house_id, user)


@router.post("/houses/{house_id}/household-plan", response_model=HouseholdPlanOut)
def household_plan(
    house_id: int,
    payload: HouseholdPlanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not house_plan_has_autopilot_planner(db, house_id):
        raise HTTPException(status_code=402, detail="Budget Rescue and life-aware weekly planning require Family Plus or Household Pro.")
    products = (
        db.query(Product)
        .options(joinedload(Product.store_prices))
        .filter(Product.house_id == house_id)
        .order_by(Product.name.asc())
        .all()
    )
    active_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product))
        .filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    recipe_rows = _combined_recipe_suggestions(db, user, products, active_list)
    # Ready meals and meals that use expiring groceries are intentionally first.
    ranked = sorted(recipe_rows, key=lambda row: (0 if row.use_soon_items else 1, 0 if row.status == "ready" else 1, -row.matched_required, row.name))
    start = date.today()
    skipped = {_clean_key(name) for name in payload.skip_days}
    guest_map = {_clean_key(key): int(value) for key, value in payload.guest_servings.items() if int(value) > 0}
    days: list[HouseholdPlanDayOut] = []
    missing_all: list[str] = []
    recipe_index = 0
    for offset in range(payload.days):
        day_name = (start + timedelta(days=offset)).strftime("%A")
        day_key = _clean_key(day_name)
        if day_key in skipped:
            days.append(HouseholdPlanDayOut(day_name=day_name, status="away", servings=0, reason="Marked as dining out / away. No grocery requirements were added for this day."))
            continue
        if not ranked:
            days.append(HouseholdPlanDayOut(day_name=day_name, status="open", servings=payload.default_servings, reason="No strong inventory-based recipe match is available yet. Add or scan groceries and the plan will become more specific."))
            continue
        recipe = ranked[recipe_index % len(ranked)]
        recipe_index += 1
        servings = guest_map.get(day_key, payload.default_servings)
        missing_all.extend(recipe.missing_items)
        days.append(HouseholdPlanDayOut(
            day_name=day_name,
            status="meal",
            recipe_name=recipe.name,
            servings=servings,
            reason=recipe.reason,
            use_soon_items=recipe.use_soon_items,
            missing_items=recipe.missing_items,
        ))

    grocery_items = list(dict.fromkeys(missing_all))
    known_cost = 0.0
    unpriced: list[str] = []
    for ingredient in grocery_items:
        price, _ = _known_price_for_ingredient(products, ingredient)
        if price is None:
            unpriced.append(ingredient)
        else:
            known_cost += price
    known_cost = round(known_cost, 2)
    buffer = round(float(payload.budget) - known_cost, 2) if payload.budget is not None else None
    if payload.budget is not None and known_cost > float(payload.budget):
        message = "The known prices alone exceed this budget. Reduce planned days, use more ready-from-inventory meals, or review cheaper store options before creating the trip."
    elif payload.budget is not None and unpriced:
        message = "The known-priced groceries fit within the budget so far, but some missing ingredients do not yet have a reliable saved price. They are listed separately instead of being guessed."
    elif payload.budget is not None:
        message = "Every currently missing ingredient in this plan has a known saved price, so the budget check is fully supported by your household data."
    else:
        message = "This plan prioritizes meals that are ready from inventory and groceries that should be used soon. Missing items are never assigned made-up prices."
    return HouseholdPlanOut(
        currency_code=currency_for_country(user.country),
        days_requested=payload.days,
        planned_days=sum(1 for row in days if row.status == "meal"),
        days=days,
        grocery_items=grocery_items,
        known_grocery_cost=known_cost,
        unpriced_items=unpriced,
        budget=payload.budget,
        known_budget_buffer=buffer,
        message=message,
    )


def _split_pref_stores(raw: str | None) -> list[str]:
    if not raw:
        return []
    return list(dict.fromkeys([part.strip() for part in raw.split(",") if part.strip()]))[:6]


def _trip_options_for_house(db: Session, house: House, user: User) -> list[AutopilotTripOptionOut]:
    active_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.house_id == house.id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    if not active_list:
        return []
    comparison = _basket_comparison(db, house.id, active_list.id, user=user, include_live=False)
    complete_options = [row for row in comparison.store_options if row.complete]
    if not complete_options and comparison.best_single_store:
        complete_options = [comparison.best_single_store]
    if not complete_options:
        return []

    cheapest_single = min(complete_options, key=lambda row: row.known_total or 0)
    preferred_stores = _split_pref_stores(house.autopilot_preferred_stores)
    preferred_match = next((row for row in complete_options if row.store_name in preferred_stores), None)
    alternative_match = next((row for row in complete_options if row.store_name != cheapest_single.store_name), None)
    balanced = comparison.best_single_store or cheapest_single

    if house.autopilot_allow_split_trip and house.autopilot_max_stores > 1 and comparison.split_store_worth_it and comparison.split_store_total is not None:
        cheapest_key = "split"
        cheapest_total = float(comparison.split_store_total)
        cheapest_names = comparison.split_store_names or [balanced.store_name]
        cheapest_summary = comparison.split_store_recommendation or "Lowest supported cost using more than one store."
        cheapest_badge = "Lowest cost"
    else:
        cheapest_key = "cheapest"
        cheapest_total = float(cheapest_single.known_total or 0)
        cheapest_names = [cheapest_single.store_name]
        cheapest_summary = f"Single-store lowest supported total with {cheapest_single.coverage_percent}% coverage."
        cheapest_badge = "Lowest cost"

    premium_target = preferred_match or alternative_match or balanced

    raw_options = [
        {
            "key": cheapest_key,
            "title": "Cost Saver",
            "summary": cheapest_summary,
            "badge": cheapest_badge,
            "store_names": cheapest_names,
            "estimated_total": round(cheapest_total, 2),
        },
        {
            "key": "balanced",
            "title": "Balanced",
            "summary": f"Best one-store option for convenience and savings at {balanced.store_name}.",
            "badge": "Recommended default",
            "store_names": [balanced.store_name],
            "estimated_total": round(float(balanced.known_total or 0), 2),
        },
        {
            "key": "premium",
            "title": "My Usual / Premium",
            "summary": f"Keeps a familiar store or allows a higher-cost choice when that is what the household prefers.",
            "badge": "Your choice",
            "store_names": [premium_target.store_name],
            "estimated_total": round(float(premium_target.known_total or 0), 2),
        },
    ]
    strategy = (house.autopilot_strategy or "balanced").strip().lower()
    preferred_key = "balanced"
    if strategy in {"lowest_cost", "cheapest"}:
        preferred_key = cheapest_key
    elif strategy in {"premium", "convenience"}:
        preferred_key = "premium"
    seen = set()
    options: list[AutopilotTripOptionOut] = []
    for row in raw_options:
        ident = (tuple(row["store_names"]), row["estimated_total"])
        if ident in seen:
            continue
        seen.add(ident)
        options.append(AutopilotTripOptionOut(
            key=row["key"],
            title=row["title"],
            summary=row["summary"],
            badge=row["badge"],
            store_names=row["store_names"],
            estimated_total=row["estimated_total"],
            extra_cost_vs_cheapest=round(max((row["estimated_total"] or 0) - cheapest_total, 0), 2),
            recommended=row["key"] == preferred_key,
        ))
    return options


def _pattern_for_house(db: Session, house: House) -> AutopilotPatternOut:
    recent = (
        db.query(AutopilotDecision)
        .filter(AutopilotDecision.house_id == house.id)
        .order_by(AutopilotDecision.created_at.desc())
        .limit(24)
        .all()
    )
    notes: list[str] = []
    if not recent:
        strategy = house.autopilot_strategy or "balanced"
        label = "Learning from your choices"
        if strategy == "lowest_cost":
            notes.append("Autopilot is currently tuned to favor the lowest supported cost.")
        elif strategy in {"premium", "convenience"}:
            notes.append("Autopilot is currently tuned to respect familiar or premium choices.")
        else:
            notes.append("Autopilot starts in a balanced mode until it learns how this household decides.")
        return AutopilotPatternOut(preferred_mode=strategy, confidence_label=label, notes=notes)

    counts: dict[str, int] = {}
    deltas: list[float] = []
    for row in recent:
        counts[row.selected_option] = counts.get(row.selected_option, 0) + 1
        if row.delta_cost is not None and row.delta_cost > 0:
            deltas.append(float(row.delta_cost))
    preferred_mode = max(counts.items(), key=lambda item: item[1])[0]
    total = len(recent)
    share = counts.get(preferred_mode, 0) / total if total else 0
    if share >= 0.7:
        label = "High-confidence pattern"
    elif share >= 0.5:
        label = "Emerging pattern"
    else:
        label = "Still learning"
    if preferred_mode in {"premium", "convenience", "usual_store"}:
        notes.append("This household often chooses convenience or a familiar store over the absolute cheapest option.")
    elif preferred_mode in {"split", "cheapest", "lowest_cost"}:
        notes.append("This household usually follows the lowest supported cost recommendation.")
    else:
        notes.append("This household usually keeps a balanced one-store plan.")
    if deltas:
        notes.append(f"Recent manual choices accepted about ${sum(deltas)/len(deltas):.2f} of extra cost on average when convenience or preference mattered.")
    if _split_pref_stores(house.autopilot_preferred_stores):
        notes.append("Preferred stores are used as a positive bias whenever they stay reasonably close to the cheaper option.")
    return AutopilotPatternOut(preferred_mode=preferred_mode, confidence_label=label, notes=notes[:3])


def _controls_out(db: Session, house: House, user: User) -> AutopilotControlsOut:
    return AutopilotControlsOut(
        strategy=house.autopilot_strategy or "balanced",
        max_stores=max(int(house.autopilot_max_stores or 1), 1),
        allow_premium=bool(house.autopilot_allow_premium),
        allow_split_trip=bool(house.autopilot_allow_split_trip),
        preferred_stores=_split_pref_stores(house.autopilot_preferred_stores),
        learning_enabled=bool(house.autopilot_learning_enabled),
        use_community_recipes=bool(house.autopilot_use_community_recipes),
        trip_options=_trip_options_for_house(db, house, user),
        learned_pattern=_pattern_for_house(db, house),
    )


@router.get("/houses/{house_id}/autopilot-controls", response_model=AutopilotControlsOut)
def get_autopilot_controls(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    return _controls_out(db, house, user)


@router.post("/houses/{house_id}/autopilot-controls", response_model=AutopilotControlsOut)
def save_autopilot_controls(house_id: int, payload: AutopilotControlsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    strategy = (payload.strategy or "balanced").strip().lower()
    if strategy not in {"balanced", "lowest_cost", "premium", "convenience"}:
        strategy = "balanced"
    house.autopilot_strategy = strategy
    house.autopilot_max_stores = max(1, min(int(payload.max_stores or 1), 3))
    house.autopilot_allow_premium = bool(payload.allow_premium)
    house.autopilot_allow_split_trip = bool(payload.allow_split_trip)
    house.autopilot_preferred_stores = ", ".join(list(dict.fromkeys([row.strip() for row in payload.preferred_stores if row.strip()]))[:6]) or None
    house.autopilot_learning_enabled = bool(payload.learning_enabled)
    house.autopilot_use_community_recipes = bool(payload.use_community_recipes)
    db.add(house)
    db.commit()
    db.refresh(house)
    return _controls_out(db, house, user)


@router.post("/houses/{house_id}/autopilot-decisions", response_model=AutopilotDecisionOut)
def save_autopilot_decision(house_id: int, payload: AutopilotDecisionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    if bool(house.autopilot_learning_enabled):
        entry = AutopilotDecision(
            house_id=house.id,
            user_id=user.id,
            decision_kind=(payload.decision_kind or "trip")[:40],
            recommendation=(payload.recommendation or None)[:80] if payload.recommendation else None,
            selected_option=payload.selected_option[:80],
            delta_cost=payload.delta_cost,
            context_json=json.dumps(payload.context or {}),
        )
        db.add(entry)
        db.commit()
    pattern = _pattern_for_house(db, house)
    return AutopilotDecisionOut(
        message="Choice saved. Autopilot will use this decision to better respect this household's habits.",
        learned_pattern=pattern,
    )


@router.post("/houses/{house_id}/kitchen-check", response_model=KitchenCheckOut)
async def kitchen_check(
    house_id: int,
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not house_plan_has_kitchen_check(db, house_id):
        raise HTTPException(status_code=402, detail="Kitchen Check Beta requires Household Pro.")
    if not images:
        raise HTTPException(status_code=400, detail="Add at least one fridge, freezer or pantry photo.")
    if len(images) > 4:
        raise HTTPException(status_code=400, detail="Kitchen Check accepts up to 4 photos at a time.")
    products = db.query(Product).filter(Product.house_id == house_id, Product.quantity > 0).order_by(Product.name.asc()).all()
    combined_text = ""
    clues: list[str] = []
    checked = 0
    for upload in images:
        content = await upload.read()
        if len(content) > 6 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{upload.filename or 'Image'} is larger than 6 MB.")
        try:
            image = Image.open(BytesIO(content)).convert("RGB")
            text = pytesseract.image_to_string(image, config="--psm 6")
        except Exception:
            continue
        checked += 1
        if text.strip():
            combined_text += "\n" + text
            clues.extend([line.strip() for line in text.splitlines() if len(line.strip()) >= 3][:8])
    if not checked:
        raise HTTPException(status_code=400, detail="The uploaded images could not be read.")
    normalized_text = _clean_key(combined_text)
    digit_text = re.sub(r"\D", "", combined_text)
    confirmed: list[str] = []
    for product in products:
        name_key = _clean_key(product.name)
        brand_key = _clean_key(product.brand)
        barcode = re.sub(r"\D", "", product.barcode or "")
        name_match = len(name_key) >= 5 and name_key in normalized_text
        brand_match = brand_key and len(brand_key) >= 4 and brand_key in normalized_text
        barcode_match = barcode and len(barcode) >= 8 and barcode in digit_text
        if name_match or barcode_match or (brand_match and any(token in normalized_text for token in name_key.split() if len(token) >= 4)):
            confirmed.append(product.name)
    confirmed_keys = {_clean_key(name) for name in confirmed}
    needs_review = [product.name for product in products if _clean_key(product.name) not in confirmed_keys][:30]
    generic_words = {"nutrition", "ingredients", "fresh", "organic", "family", "original", "canada", "best", "value", "large", "small", "use", "before", "expiry", "frozen"}
    matched_names = {_clean_key(name) for name in confirmed}
    possible_new: list[str] = []
    for clue in clues:
        cleaned = " ".join(part for part in re.sub(r"[^A-Za-z0-9 ]+", " ", clue).split() if len(part) >= 3)
        key = _clean_key(cleaned)
        if not cleaned or key in matched_names or key in generic_words:
            continue
        if any(word in generic_words for word in key.split() if len(word) >= 5 and len(key.split()) == 1):
            continue
        possible_new.append(cleaned[:80])
    possible_new = list(dict.fromkeys(possible_new))[:10]
    review_actions = []
    if confirmed:
        review_actions.append("Confirm quantity or freshness for the visible matches before changing inventory.")
    if needs_review:
        review_actions.append("Review items not confirmed in the photos before removing or reducing anything.")
    if possible_new:
        review_actions.append("Check whether any new visible package labels should be added to inventory.")
    if not review_actions:
        review_actions.append("Try clearer close-up photos with labels facing the camera for a stronger result.")
    return KitchenCheckOut(
        images_checked=checked,
        inventory_count=len(products),
        label_confirmed=confirmed,
        needs_review=needs_review,
        possible_new_items=possible_new,
        extracted_clues=list(dict.fromkeys(clues))[:20],
        review_actions=review_actions,
        message="Kitchen Check Beta confirms products only when readable package text, a distinctive brand/name combination or a stored barcode is visible. It highlights visible matches, likely review items and possible new package clues, but it never deletes inventory automatically.",
    )


@router.get("/houses/{house_id}/savings-ledger", response_model=SavingsLedgerOut)
def savings_ledger(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    return _savings_ledger(db, house, user)


@router.get("/houses/{house_id}/receipt-guardian", response_model=ReceiptGuardianOut)
def receipt_guardian(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    if not house_plan_has_receipt_guardian(db, house_id):
        raise HTTPException(status_code=402, detail="Receipt Guardian requires Basic Home or higher.")
    return _receipt_guardian(db, house_id)


@router.get("/houses/{house_id}/stock-up", response_model=list[StockUpSuggestionOut])
def stock_up(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    if not house_plan_has_stock_up_intelligence(db, house_id):
        raise HTTPException(status_code=402, detail="Smart stock-up intelligence requires Family Plus or Household Pro.")
    return _stock_up_suggestions(db, house_id)


@router.get("/houses/{house_id}/recall-guardian", response_model=RecallGuardianOut)
def recall_guardian(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return _recall_guardian(db, house_id)


@router.get("/houses/{house_id}/autopilot", response_model=AutopilotOverviewOut)
def autopilot_overview(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    house_plan = get_house_plan(db, house_id)
    receipt_guardian_unlocked = house_plan_has_receipt_guardian(db, house_id)
    planner_unlocked = house_plan_has_autopilot_planner(db, house_id)
    stock_up_unlocked = house_plan_has_stock_up_intelligence(db, house_id)
    kitchen_check_unlocked = house_plan_has_kitchen_check(db, house_id)
    assistant = weekly_assistant(house_id, db=db, user=user)
    receipt_guard = _receipt_guardian(db, house_id) if receipt_guardian_unlocked else ReceiptGuardianOut(
        receipts_checked=0, issues=[], amount_to_review=0,
        message="Receipt Guardian unlocks with Basic Home. Your original receipt history remains available."
    )
    ledger = _savings_ledger(db, house, user)
    stockups = _stock_up_suggestions(db, house_id) if stock_up_unlocked else []
    recalls = _recall_guardian(db, house_id)
    community_prices = _community_price_pulse(db, house_id, user)
    urgent = len(assistant.expired) + len(recalls.matches)
    restock_count = len(assistant.suggested_items)
    attention = min(100, urgent * 25 + len(assistant.expiring_soon) * 8 + restock_count * 4 + len(receipt_guard.issues) * 5)

    if recalls.matches:
        headline = "A possible food-safety match needs verification"
        subheadline = "Autopilot found inventory wording that overlaps an official Government of Canada food alert. Verify the package details before using the product."
        action = "Review safety match"
        href = f"/assistant?house={house_id}#recall-guardian"
    elif assistant.expired:
        headline = "Start by reviewing expired inventory"
        subheadline = "Autopilot is prioritizing food safety and waste prevention before it recommends another shopping trip."
        action = "Review inventory"
        href = f"/houses/{house_id}/inventory"
    elif receipt_guard.issues:
        headline = "Your latest receipts have a few charges worth checking"
        subheadline = "These are review prompts—not confirmed errors—and each one is tied to a specific receipt line or price history signal."
        action = "Open Receipt Guardian"
        href = f"/assistant?house={house_id}#receipt-guardian"
    elif assistant.expiring_soon:
        headline = "Use what you own before buying more"
        subheadline = "Autopilot found groceries that should be used soon and can prioritize them before the next shopping trip."
        action = "Build this week's plan" if planner_unlocked else "Review meal ideas"
        href = f"/assistant?house={house_id}#weekly-plan" if planner_unlocked else f"/houses/{house_id}/meals"
    elif assistant.suggested_items:
        headline = "Your next trip can be prepared automatically"
        subheadline = "Low/out-of-stock essentials can be added to the list, then checked against your known store prices."
        action = "Prepare the trip"
        href = f"/houses/{house_id}/shopping"
    else:
        headline = "Your household looks under control"
        subheadline = "No urgent inventory signal stands out. Autopilot will keep watching prices, receipts, expiry dates and the next shopping list."
        action = "Review weekly plan" if planner_unlocked else "Review household"
        href = f"/assistant?house={house_id}#weekly-plan" if planner_unlocked else f"/houses/{house_id}"

    return AutopilotOverviewOut(
        generated_at=datetime.now(timezone.utc),
        currency_code=currency_for_country(user.country),
        house_id=house.id,
        house_name=house.name,
        plan_key=house_plan.key,
        receipt_guardian_unlocked=receipt_guardian_unlocked,
        planner_unlocked=planner_unlocked,
        stock_up_unlocked=stock_up_unlocked,
        kitchen_check_unlocked=kitchen_check_unlocked,
        attention_score=attention,
        headline=headline,
        subheadline=subheadline,
        verified_savings=ledger.verified_total,
        potential_savings=ledger.potential_total,
        active_list_items=assistant.active_list_items,
        expiring_items=len(assistant.expiring_soon) + len(assistant.expired),
        restock_items=restock_count,
        receipt_issues=len(receipt_guard.issues),
        recall_matches=len(recalls.matches),
        best_next_action=action,
        best_next_action_href=href,
        stock_up=stockups,
        receipt_guardian=receipt_guard,
        savings_ledger=ledger,
        recall_guardian=recalls,
        community_price_pulse=community_prices,
    )
