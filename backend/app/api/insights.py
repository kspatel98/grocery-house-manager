from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from itertools import combinations
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_active_shopping_list_limit, ensure_product_limit, get_house_plan
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    House,
    HouseMember,
    Invite,
    PlanName,
    Product,
    ProductStorePrice,
    Receipt,
    Section,
    ShoppingItemStatus,
    ShoppingList,
    ShoppingListItem,
    User,
)
from app.schemas import (
    BasketComparisonOut,
    BasketStoreOptionOut,
    OnboardingStatusOut,
    OnboardingStepOut,
    RecipeMissingAddIn,
    RecipeMissingAddOut,
    RecipeShoppingAddIn,
    RecipeShoppingAddOut,
    SavingsSummaryOut,
    WeeklyAssistantOut,
    WeeklyAssistantRecipeOut,
    WeeklyAssistantSuggestedItemOut,
)
from app.utils.location import currency_for_country
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

    # item_id -> store -> supported price record. Newer/live data wins over old history;
    # within the same source tier we keep the lower observed price.
    price_map: dict[int, dict[str, dict]] = {item.id: {} for item in items}
    data_sources: set[str] = set()

    def put_price(item_id: int, store: str | None, price: float | None, source: str, recorded_at: datetime | None = None):
        if not store or price is None or price < 0:
            return
        store_name = " ".join(store.split()).strip()
        if not store_name:
            return
        rank = {"live": 0, "recent_receipt": 1, "saved_price": 2}.get(source, 3)
        current = price_map.setdefault(item_id, {}).get(store_name)
        candidate = {"price": float(price), "source": source, "rank": rank, "recorded_at": recorded_at}
        if current is None or rank < current["rank"] or (rank == current["rank"] and float(price) < current["price"]):
            price_map[item_id][store_name] = candidate
        if source == "live":
            data_sources.add("Live Canadian prices")
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

    all_store_names = sorted({store for stores in price_map.values() for store in stores})
    store_options: list[BasketStoreOptionOut] = []
    for store in all_store_names:
        known_total = 0.0
        missing: list[str] = []
        priced = live_count = receipt_count = saved_count = 0
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
        if live_count:
            source_summary = f"{live_count} live" + (f", {receipt_count} recent receipt" if receipt_count else "") + (f", {saved_count} saved" if saved_count else "")
            freshness = "Includes live/recent retailer results"
        elif receipt_count:
            source_summary = f"{receipt_count} recent receipt" + (f", {saved_count} saved" if saved_count else "")
            freshness = "Based on your recent receipts and saved history"
        else:
            source_summary = f"{saved_count} saved price" + ("s" if saved_count != 1 else "")
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
    recipes = _recipe_suggestions(products, active_list)
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
