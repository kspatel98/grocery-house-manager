from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_active_shopping_list_limit
from app.api.products import serialize_product
from app.db.session import get_db
from app.models import Product, ShoppingItemStatus, ShoppingList, ShoppingListItem, User
from app.schemas import (
    ShoppingDoneIn,
    ShoppingListCreate,
    ShoppingListItemsAdd,
    ShoppingListItemOut,
    ShoppingListItemUpdate,
    ShoppingListItemStatusUpdate,
    ShoppingListOut,
    ShoppingListUpdate,
)

router = APIRouter(prefix="/houses/{house_id}/shopping-lists", tags=["shopping lists"])


def serialize_item(item: ShoppingListItem) -> ShoppingListItemOut:
    return ShoppingListItemOut(
        id=item.id,
        product_id=item.product_id,
        requested_quantity=item.requested_quantity,
        bought_quantity=item.bought_quantity,
        message=item.message,
        status=item.status,
        product=serialize_product(item.product),
    )


def serialize_list(shopping_list: ShoppingList) -> ShoppingListOut:
    ordered = sorted(shopping_list.items, key=lambda item: (0 if item.status == ShoppingItemStatus.to_buy else 1, item.id))
    return ShoppingListOut(
        id=shopping_list.id,
        house_id=shopping_list.house_id,
        title=shopping_list.title,
        is_done=shopping_list.is_done,
        created_at=shopping_list.created_at,
        completed_at=shopping_list.completed_at,
        items=[serialize_item(item) for item in ordered],
    )


def load_list(db: Session, house_id: int, list_id: int) -> ShoppingList:
    shopping_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.section))
        .filter(ShoppingList.id == list_id, ShoppingList.house_id == house_id)
        .first()
    )
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Shopping list not found")
    return shopping_list


def validate_products(db: Session, house_id: int, product_ids: list[int]) -> dict[int, Product]:
    products = db.query(Product).filter(Product.house_id == house_id, Product.id.in_(product_ids)).all()
    product_map = {product.id: product for product in products}
    missing = set(product_ids) - set(product_map)
    if missing:
        raise HTTPException(status_code=400, detail=f"Some products do not belong to this house: {sorted(missing)}")
    return product_map


@router.get("", response_model=list[ShoppingListOut])
def list_shopping_lists(house_id: int, include_done: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    query = db.query(ShoppingList).options(
        joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.section)
    ).filter(ShoppingList.house_id == house_id)
    if not include_done:
        query = query.filter(ShoppingList.is_done == False)
    lists = query.order_by(ShoppingList.is_done.asc(), ShoppingList.created_at.desc(), ShoppingList.id.desc()).all()
    return [serialize_list(shopping_list) for shopping_list in lists]


@router.get("/active", response_model=ShoppingListOut | None)
def get_active_list(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    shopping_list = db.query(ShoppingList).options(
        joinedload(ShoppingList.items).joinedload(ShoppingListItem.product).joinedload(Product.section)
    ).filter(ShoppingList.house_id == house_id, ShoppingList.is_done == False).order_by(ShoppingList.created_at.desc()).first()
    return serialize_list(shopping_list) if shopping_list else None


@router.post("", response_model=ShoppingListOut)
def create_shopping_list(house_id: int, payload: ShoppingListCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    if not payload.items:
        raise HTTPException(status_code=400, detail="Add at least one product")
    ensure_active_shopping_list_limit(db, house_id, user)

    product_ids = [item.product_id for item in payload.items]
    validate_products(db, house_id, product_ids)

    shopping_list = ShoppingList(house_id=house_id, title=payload.title, created_by_id=user.id)
    db.add(shopping_list)
    db.flush()
    for item in payload.items:
        db.add(ShoppingListItem(
            shopping_list_id=shopping_list.id,
            product_id=item.product_id,
            requested_quantity=item.requested_quantity,
            bought_quantity=item.bought_quantity or item.requested_quantity,
            message=item.message,
        ))
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="shopping_list_created",
        message=f"Grocery list {shopping_list.title} created by {display_name(user)}.",
        entity_type="shopping_list",
        entity_id=shopping_list.id,
    )
    db.commit()
    shopping_list = load_list(db, house_id, shopping_list.id)
    return serialize_list(shopping_list)


@router.patch("/{list_id}", response_model=ShoppingListOut)
def update_shopping_list(house_id: int, list_id: int, payload: ShoppingListUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    shopping_list = load_list(db, house_id, list_id)
    if shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"]:
        old_title = shopping_list.title
        shopping_list.title = updates["title"]
        log_activity(
            db,
            house_id=house_id,
            user=user,
            action="shopping_list_updated",
            message=f"Grocery list {old_title} renamed to {shopping_list.title} by {display_name(user)}.",
            entity_type="shopping_list",
            entity_id=shopping_list.id,
        )
    db.commit()
    return serialize_list(load_list(db, house_id, list_id))

@router.post("/{list_id}/edit", response_model=ShoppingListOut)
def update_shopping_list_via_post(house_id: int, list_id: int, payload: ShoppingListUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return update_shopping_list(house_id, list_id, payload, db, user)


@router.post("/{list_id}/items", response_model=ShoppingListOut)
def add_items(house_id: int, list_id: int, payload: ShoppingListItemsAdd, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    shopping_list = load_list(db, house_id, list_id)
    if shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Add at least one product")

    product_ids = [item.product_id for item in payload.items]
    product_map = validate_products(db, house_id, product_ids)
    existing = {item.product_id: item for item in shopping_list.items}
    added_names: list[str] = []

    for item in payload.items:
        product = product_map[item.product_id]
        added_names.append(product.name)
        if item.product_id in existing:
            existing_item = existing[item.product_id]
            existing_item.requested_quantity += item.requested_quantity
            existing_item.bought_quantity += item.bought_quantity or item.requested_quantity
            if item.message:
                existing_item.message = item.message
            existing_item.status = ShoppingItemStatus.to_buy
        else:
            db.add(ShoppingListItem(
                shopping_list_id=shopping_list.id,
                product_id=item.product_id,
                requested_quantity=item.requested_quantity,
                bought_quantity=item.bought_quantity or item.requested_quantity,
                message=item.message,
            ))

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="shopping_items_added",
        message=f"{display_name(user)} added {', '.join(added_names[:4])}{' and more' if len(added_names) > 4 else ''} to the grocery list.",
        entity_type="shopping_list",
        entity_id=shopping_list.id,
    )
    db.commit()
    return serialize_list(load_list(db, house_id, list_id))


@router.patch("/{list_id}/items/{item_id}", response_model=ShoppingListOut)
def update_item(house_id: int, list_id: int, item_id: int, payload: ShoppingListItemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    item = db.query(ShoppingListItem).options(
        joinedload(ShoppingListItem.product).joinedload(Product.section),
        joinedload(ShoppingListItem.shopping_list),
    ).filter(ShoppingListItem.id == item_id, ShoppingListItem.shopping_list_id == list_id).first()
    if not item or item.shopping_list.house_id != house_id:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    if item.shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")

    old_status = item.status
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(item, key, value)

    if "status" in updates and item.status != old_status:
        moved_to = "Added in cart" if item.status == ShoppingItemStatus.in_cart else "Products to buy"
        log_activity(
            db,
            house_id=house_id,
            user=user,
            action="shopping_item_status_changed",
            message=f"{item.product.name} moved to {moved_to} by {display_name(user)}.",
            entity_type="shopping_item",
            entity_id=item.id,
        )
    elif updates:
        log_activity(
            db,
            house_id=house_id,
            user=user,
            action="shopping_item_updated",
            message=f"{item.product.name} shopping details updated by {display_name(user)}.",
            entity_type="shopping_item",
            entity_id=item.id,
        )

    db.commit()
    return serialize_list(load_list(db, house_id, list_id))

@router.post("/{list_id}/items/{item_id}/edit", response_model=ShoppingListOut)
def update_item_via_post(house_id: int, list_id: int, item_id: int, payload: ShoppingListItemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return update_item(house_id, list_id, item_id, payload, db, user)


@router.post("/{list_id}/items/{item_id}/status", response_model=ShoppingListOut)
def update_item_status(house_id: int, list_id: int, item_id: int, payload: ShoppingListItemStatusUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    item = db.query(ShoppingListItem).options(
        joinedload(ShoppingListItem.product),
        joinedload(ShoppingListItem.shopping_list),
    ).filter(ShoppingListItem.id == item_id, ShoppingListItem.shopping_list_id == list_id).first()
    if not item or item.shopping_list.house_id != house_id:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    if item.shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")

    old_status = item.status
    item.status = payload.status
    if item.status != old_status:
        moved_to = "Added in cart" if item.status == ShoppingItemStatus.in_cart else "Products to buy"
        log_activity(
            db,
            house_id=house_id,
            user=user,
            action="shopping_item_status_changed",
            message=f"{item.product.name} moved to {moved_to} by {display_name(user)}.",
            entity_type="shopping_item",
            entity_id=item.id,
        )
    db.commit()
    return serialize_list(load_list(db, house_id, list_id))


@router.delete("/{list_id}/items/{item_id}")
def remove_item(house_id: int, list_id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    item = db.query(ShoppingListItem).options(
        joinedload(ShoppingListItem.product),
        joinedload(ShoppingListItem.shopping_list),
    ).filter(ShoppingListItem.id == item_id, ShoppingListItem.shopping_list_id == list_id).first()
    if not item or item.shopping_list.house_id != house_id:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    if item.shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")
    product_name = item.product.name
    db.delete(item)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="shopping_item_removed",
        message=f"{product_name} removed from the grocery list by {display_name(user)}.",
        entity_type="shopping_list",
        entity_id=list_id,
    )
    db.commit()
    return {"ok": True}


@router.delete("/{list_id}")
def cancel_shopping_list(house_id: int, list_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    shopping_list = load_list(db, house_id, list_id)
    if shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")
    title = shopping_list.title
    db.delete(shopping_list)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="shopping_list_cancelled",
        message=f"Grocery list {title} cancelled by {display_name(user)}.",
        entity_type="shopping_list",
        entity_id=list_id,
    )
    db.commit()
    return {"ok": True}


@router.post("/{list_id}/done", response_model=ShoppingListOut)
def complete_shopping(house_id: int, list_id: int, payload: ShoppingDoneIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    shopping_list = load_list(db, house_id, list_id)
    if shopping_list.is_done:
        raise HTTPException(status_code=400, detail="Shopping list is already done")

    updated_count = 0
    for item in shopping_list.items:
        if item.status == ShoppingItemStatus.in_cart:
            item.product.quantity += item.bought_quantity
            item.product.last_bought_at = datetime.now(timezone.utc)
            updated_count += 1
    shopping_list.is_done = True
    shopping_list.completed_by_id = user.id
    shopping_list.completed_at = datetime.now(timezone.utc)
    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="shopping_list_completed",
        message=f"Shopping done by {display_name(user)}. {updated_count} product quantities were added to inventory.",
        entity_type="shopping_list",
        entity_id=shopping_list.id,
    )
    db.commit()
    return serialize_list(load_list(db, house_id, list_id))
