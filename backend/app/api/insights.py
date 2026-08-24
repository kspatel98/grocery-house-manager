from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import get_house_plan
from app.db.session import get_db
from app.models import (
    House,
    HouseMember,
    Invite,
    PlanName,
    Product,
    Receipt,
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
    SavingsSummaryOut,
    WeeklyAssistantOut,
    WeeklyAssistantRecipeOut,
    WeeklyAssistantSuggestedItemOut,
)
from app.utils.location import currency_for_country

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


@router.get("/onboarding", response_model=OnboardingStatusOut)
def onboarding_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    house = _active_owned_house(db, user)
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

    steps = [
        OnboardingStepOut(
            key="house",
            title="Create your grocery house",
            description="Give your household one shared place for inventory and shopping.",
            complete=has_house,
            href="/houses",
        ),
        OnboardingStepOut(
            key="inventory",
            title="Add 5 groceries",
            description=f"{min(products_count, 5)} of 5 added. Start with the items your household buys most often.",
            complete=products_count >= 5,
            href=f"/houses/{house.id}/inventory" if house else "/houses",
        ),
        OnboardingStepOut(
            key="list",
            title="Create your first shopping list",
            description="Build one shared list so everyone can see what is needed and what is already in the cart.",
            complete=active_lists > 0,
            href=f"/houses/{house.id}/shopping" if house else "/houses",
        ),
        OnboardingStepOut(
            key="invite",
            title="Invite a household member",
            description="Invite your partner, family member, or roommate so the list becomes truly shared.",
            complete=member_count > 1,
            href=f"/houses/{house.id}" if house else "/houses",
        ),
        OnboardingStepOut(
            key="ready",
            title="Finish your household setup",
            description="Your starter system is ready once the core house, inventory, list, and sharing steps are complete.",
            complete=bool(has_house and products_count >= 5 and active_lists > 0 and (member_count > 1 or invite_sent)),
            href=f"/assistant?house={house.id}" if house else "/houses",
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


def _basket_comparison(db: Session, house_id: int, list_id: int) -> BasketComparisonOut:
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
    if total_items == 0:
        return BasketComparisonOut(
            message="This shopping list has no active items to compare yet.",
            list_id=shopping_list.id,
            list_title=shopping_list.title,
            total_items=0,
        )

    item_best: dict[int, tuple[str, float]] = {}
    all_store_names: set[str] = set()
    price_map: dict[int, dict[str, float]] = {}

    for item in items:
        by_store: dict[str, float] = {}
        for entry in item.product.store_prices or []:
            if entry.price is None or not entry.store_name:
                continue
            value = float(entry.price)
            current = by_store.get(entry.store_name)
            if current is None or value < current:
                by_store[entry.store_name] = value
        if item.product.price is not None and item.product.store_name:
            current = by_store.get(item.product.store_name)
            value = float(item.product.price)
            if current is None or value < current:
                by_store[item.product.store_name] = value
        price_map[item.id] = by_store
        all_store_names.update(by_store.keys())
        if by_store:
            best_store, best_price = min(by_store.items(), key=lambda pair: pair[1])
            item_best[item.id] = (best_store, best_price)

    store_options: list[BasketStoreOptionOut] = []
    for store in sorted(all_store_names):
        known_total = 0.0
        missing: list[str] = []
        priced = 0
        for item in items:
            qty = float(item.requested_quantity or 1)
            store_price = price_map.get(item.id, {}).get(store)
            if store_price is not None:
                known_total += store_price * qty
                priced += 1
                continue
            best = item_best.get(item.id)
            if best:
                # Fill a missing store-specific price with a small conservative premium over
                # the best known price so baskets stay comparable without pretending it is live data.
                known_total += best[1] * qty * 1.05
            missing.append(item.product.name)
        coverage = round((priced / total_items) * 100) if total_items else 0
        store_options.append(
            BasketStoreOptionOut(
                store_name=store,
                estimated_total=round(known_total, 2),
                priced_items=priced,
                total_items=total_items,
                coverage_percent=coverage,
                missing_items=missing,
            )
        )

    store_options.sort(key=lambda row: (-row.coverage_percent, row.estimated_total, row.store_name.lower()))
    candidates = [row for row in store_options if row.coverage_percent >= 60] or store_options
    best_single = min(candidates, key=lambda row: row.estimated_total) if candidates else None

    # Keep the "split trip" practical: at most two stores, never one store per item.
    # Missing pair-specific prices are estimated conservatively from the best saved price,
    # and coverage is returned so users can judge how much of the result is directly known.
    split_value = None
    split_savings = None
    split_names: list[str] = []
    split_coverage = 0
    split_picks: list[str] = []
    pair_candidates: list[tuple[float, int, tuple[str, str], list[str]]] = []
    for first_store, second_store in combinations(sorted(all_store_names), 2):
        pair_total = 0.0
        pair_priced = 0
        pair_picks: list[str] = []
        for item in items:
            qty = float(item.requested_quantity or 1)
            available = []
            for store in (first_store, second_store):
                value = price_map.get(item.id, {}).get(store)
                if value is not None:
                    available.append((store, value))
            if available:
                chosen_store, chosen_price = min(available, key=lambda pair: pair[1])
                pair_total += chosen_price * qty
                pair_priced += 1
                pair_picks.append(f"{item.product.name} → {chosen_store}")
                continue
            best = item_best.get(item.id)
            if best:
                pair_total += best[1] * qty * 1.05
                pair_picks.append(f"{item.product.name} → estimated (no saved price at either store)")
        coverage = round((pair_priced / total_items) * 100) if total_items else 0
        if pair_priced:
            pair_candidates.append((round(pair_total, 2), coverage, (first_store, second_store), pair_picks))

    if pair_candidates:
        reliable_pairs = [row for row in pair_candidates if row[1] >= 60]
        candidate_pool = reliable_pairs or pair_candidates
        pair_total, pair_coverage, pair_names, pair_picks = min(candidate_pool, key=lambda row: (row[0], -row[1]))
        split_value = pair_total
        split_names = list(pair_names)
        split_coverage = pair_coverage
        split_picks = pair_picks[:20]
        if best_single:
            split_savings = round(max(best_single.estimated_total - split_value, 0), 2)

    if not store_options:
        message = "No saved store prices exist for this list yet. Scan receipts or save store prices to build whole-list comparisons."
    elif best_single:
        message = f"{best_single.store_name} is the strongest single-store estimate from your saved household price history. Coverage is shown so you can judge confidence."
    else:
        message = "Price history exists, but there is not enough coverage for a reliable single-store estimate yet."

    return BasketComparisonOut(
        message=message,
        list_id=shopping_list.id,
        list_title=shopping_list.title,
        total_items=total_items,
        best_single_store=best_single,
        store_options=store_options[:8],
        split_store_total=split_value,
        split_store_savings=split_savings,
        split_store_names=split_names,
        split_store_coverage_percent=split_coverage,
        split_store_picks=split_picks,
    )


@router.get("/houses/{house_id}/shopping-lists/{list_id}/basket-comparison", response_model=BasketComparisonOut)
def basket_comparison(house_id: int, list_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    plan = get_house_plan(db, house_id)
    if plan.key not in {PlanName.family, PlanName.pro}:
        shopping_list = db.query(ShoppingList).filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id).first()
        if not shopping_list:
            raise HTTPException(status_code=404, detail="Shopping list not found")
        return BasketComparisonOut(
            premium_required=True,
            message=f"Whole-list store comparison is a Family Plus feature. This house currently uses {plan.name}.",
            list_id=shopping_list.id,
            list_title=shopping_list.title,
            total_items=db.query(ShoppingListItem).filter(ShoppingListItem.shopping_list_id == list_id).count(),
        )
    return _basket_comparison(db, house_id, list_id)


RECIPE_RULES = [
    ("Vegetable fried rice", [{"rice"}, {"egg", "eggs"}], {"vegetable", "vegetables", "onion", "carrot", "peas"}),
    ("Creamy pasta night", [{"pasta"}], {"cheese", "milk", "cream", "tomato", "sauce"}),
    ("Breakfast omelette", [{"egg", "eggs"}], {"cheese", "milk", "onion", "pepper", "spinach"}),
    ("Chicken rice bowl", [{"chicken"}, {"rice"}], {"vegetable", "vegetables", "yogurt", "sauce"}),
    ("Yogurt fruit bowl", [{"yogurt"}], {"banana", "apple", "berries", "fruit"}),
    ("Grilled cheese & soup", [{"bread"}, {"cheese"}], {"tomato", "soup", "butter"}),
]


def _recipe_suggestions(products: list[Product]) -> list[WeeklyAssistantRecipeOut]:
    today = date.today()
    available = [
        product
        for product in products
        if float(product.quantity or 0) > 0 and (not product.expiry_date or product.expiry_date >= today)
    ]
    names = {_normalize_name(product.name): product.name for product in available}
    tokens: set[str] = set()
    for normalized in names:
        tokens.update(normalized.split())

    result: list[WeeklyAssistantRecipeOut] = []
    for recipe_name, required_groups, optional in RECIPE_RULES:
        required_hits: list[str] = []
        valid = True
        for group in required_groups:
            hit = next((ingredient for ingredient in sorted(group) if ingredient in tokens), None)
            if not hit:
                valid = False
                break
            required_hits.append(hit)
        if not valid:
            continue
        optional_hits = [ingredient for ingredient in optional if ingredient in tokens]
        missing = [ingredient for ingredient in sorted(optional) if ingredient not in tokens][:2]
        matched = sorted(set(required_hits + optional_hits))
        result.append(
            WeeklyAssistantRecipeOut(
                name=recipe_name,
                reason="Uses groceries already in your inventory" + (" and gives you a way to use more of what is on hand." if optional_hits else "."),
                matched_items=matched[:8],
                missing_items=missing,
            )
        )
        if len(result) >= 4:
            break
    return result


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
        comparison = _basket_comparison(db, house_id, active_list.id)
        if comparison.best_single_store:
            best_store_name = comparison.best_single_store.store_name
            best_store_total = comparison.best_single_store.estimated_total
        if len(comparison.store_options) > 1:
            ordered = sorted(comparison.store_options, key=lambda row: row.estimated_total)
            if ordered:
                first = ordered[0]
                second = next((row for row in ordered[1:] if row.store_name != first.store_name), None)
                if first:
                    best_store_name = first.store_name
                    best_store_total = first.estimated_total
                if second:
                    alternative_name = second.store_name
                    alternative_total = second.estimated_total
                    potential_savings = round(max(second.estimated_total - first.estimated_total, 0), 2)

    savings = _savings_summary(db, house, user)
    recipes = _recipe_suggestions(products)
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
