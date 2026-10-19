"""Review-first grocery list/photo scan and atomic household import."""
from __future__ import annotations

from collections import defaultdict
from typing import Literal
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_active_shopping_list_limit, get_house_plan, get_house_owner
from app.db.session import get_db
from app.models import Product, Section, ShoppingList, ShoppingListItem, ShoppingItemStatus, User
from app.utils.digitalocean_ai import DigitalOceanAIError
from app.utils.grocery_image_scan import prepare_image, recognize_grocery_image, MAX_SCAN_BYTES
from app.utils.feature_quota import consume_feature_call, used_feature_calls

router = APIRouter(prefix="/houses/{house_id}/grocery-scan", tags=["grocery scan"])


def name_key(name: str) -> str:
    return " ".join(name.strip().casefold().split())


class ReviewedGroceryItem(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    quantity: float = Field(gt=0, le=10000)
    unit: str = Field(min_length=1, max_length=32)
    product_id: int | None = None
    section_id: int | None = None
    category: Literal["Fruits", "Vegetables", "Dairy", "Pantry", "Bakery", "Beverages", "Household", "Frozen", "Snacks", "Other"] = "Other"


class ImportGroceries(BaseModel):
    mode: Literal["products", "written_list"]
    destination: Literal["inventory", "shopping"]
    list_id: int | None = None
    list_title: str = Field(default="Scanned Groceries", min_length=1, max_length=180)
    items: list[ReviewedGroceryItem] = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def enforce_list_only(self):
        if self.mode == "written_list" and self.destination != "shopping":
            raise ValueError("Written lists can only be added to a shopping list.")
        if self.destination == "inventory" and self.list_id is not None:
            raise ValueError("An inventory scan cannot select a shopping list.")
        return self


@router.get("/quota")
def scan_quota(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    owner = get_house_owner(db, house_id)
    limit = get_house_plan(db, house_id).limits.grocery_image_scans_per_month
    used = used_feature_calls(db, owner.id, "grocery_scan") if owner else 0
    return {"limit": limit, "used": used, "remaining": max(0, limit-used), "period": "calendar month (UTC)"}


@router.post("/preview")
def preview_groceries(
    house_id: int,
    mode: Literal["products", "written_list"] = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    content_type = (image.content_type or "").split(";", 1)[0].lower()
    try:
        raw = image.file.read(MAX_SCAN_BYTES + 1)
        prepared = prepare_image(raw, content_type, mode)
        original_prepared = prepare_image(raw, content_type, mode, enhance=False) if mode == "written_list" else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        image.file.close()
    owner = get_house_owner(db, house_id)
    limit = get_house_plan(db, house_id).limits.grocery_image_scans_per_month
    if not owner or not consume_feature_call(owner.id, "grocery_scan", limit, house_id=house_id, actor_id=user.id):
        raise HTTPException(status_code=402, detail=f"The household has reached its Smart Grocery Scan allowance ({limit}/month). Review existing lists, or upgrade the owner's plan. Attempts count even if handwriting cannot be read.")
    try:
        scan = recognize_grocery_image(prepared, mode, alternate_jpeg=original_prepared)
    except DigitalOceanAIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    existing = db.query(Product).filter(Product.house_id == house_id).all()
    by_name = defaultdict(list)
    for product in existing:
        by_name[name_key(product.name)].append(product)
    for row in scan["items"]:
        matches = [p for p in by_name.get(name_key(row["name"]), []) if (p.unit or "pcs").lower() == row["unit"].lower()]
        row["product_id"] = matches[0].id if len(matches) == 1 else None
    return scan


@router.post("/apply")
def apply_groceries(
    house_id: int, payload: ImportGroceries,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    sections = {section.id: section for section in db.query(Section).filter(Section.house_id == house_id).all()}
    shopping_list = None
    if payload.destination == "shopping" and payload.list_id is not None:
        shopping_list = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.id == payload.list_id, ShoppingList.is_done == False).first()
        if shopping_list is None:
            raise HTTPException(status_code=404, detail="The selected shopping list is not active in this house.")
    existing = db.query(Product).filter(Product.house_id == house_id).all()
    by_id = {p.id: p for p in existing}
    by_name = {name_key(p.name): p for p in existing if (p.usage_scope or "shared") == "shared"}
    seen: set[tuple[str, str]] = set()
    chosen = []
    allowed_units = {"pcs", "kg", "g", "L", "mL", "pack", "box", "bag", "bottle", "can", "loaf"}
    for item in payload.items:
        name = re.sub(r"\s+", " ", item.name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Every selected item needs a product name.")
        unit = item.unit.strip()
        if unit not in allowed_units:
            raise HTTPException(status_code=400, detail=f"Choose a supported unit for {name}.")
        key = (name_key(name), unit.lower())
        if key in seen:
            raise HTTPException(status_code=400, detail=f"{name} appears more than once. Combine duplicate rows before saving.")
        seen.add(key)
        if item.section_id is not None and item.section_id not in sections:
            raise HTTPException(status_code=400, detail=f"The section selected for {name} doesn't belong to this house.")
        product = by_id.get(item.product_id) if item.product_id else by_name.get(key[0])
        if product and item.product_id is not None and name_key(product.name) != name_key(name):
            raise HTTPException(status_code=400, detail=f"{name} no longer matches the selected existing product. Rescan or clear its match.")
        if product and (product.usage_scope or "shared") != "shared":
            raise HTTPException(status_code=400, detail=f"{name} refers to a personal product. Choose a shared product instead.")
        if item.product_id and product is None:
            raise HTTPException(status_code=400, detail=f"The existing product selected for {name} no longer exists in this house.")
        if product and (product.unit or "pcs").lower() != unit.lower():
            raise HTTPException(status_code=400, detail=f"{name} uses {product.unit} in inventory. Edit the scanned unit to match before adding.")
        chosen.append((item, name, unit, product))

    # Validate list capacity and available product slots before writing anything.
    if payload.destination == "shopping" and shopping_list is None:
        ensure_active_shopping_list_limit(db, house_id, user)
    new_count = sum(1 for _, _, _, product in chosen if not product)
    if new_count:
        from app.api.plan_utils import get_house_plan
        limit = get_house_plan(db, house_id).limits.products_per_house
        if len(existing) + new_count > limit:
            raise HTTPException(status_code=402, detail=f"Your household can add only {max(0, limit - len(existing))} more distinct products under its current plan. Remove some items or upgrade.")

    try:
        section_by_name = {section.name.casefold(): section for section in sections.values()}
        category_icons = {"Fruits": "🍎", "Vegetables": "🥦", "Dairy": "🥛", "Pantry": "🫙", "Bakery": "🍞", "Beverages": "🧃", "Household": "🧽", "Frozen": "🧊", "Snacks": "🍿", "Other": "🧺"}
        if payload.destination == "shopping" and shopping_list is None:
            shopping_list = ShoppingList(house_id=house_id, title=payload.list_title.strip() or "Scanned Groceries", created_by_id=user.id)
            db.add(shopping_list)
            db.flush()
        existing_items = {}
        if shopping_list is not None:
            existing_items = {x.product_id: x for x in db.query(ShoppingListItem).filter(ShoppingListItem.shopping_list_id == shopping_list.id).all()}
        count_added = 0
        for item, name, unit, product in chosen:
            if product is None:
                section_id = item.section_id
                if section_id is None:
                    section = section_by_name.get(item.category.casefold())
                    if section is None:
                        section = Section(house_id=house_id, name=item.category, icon=category_icons.get(item.category, "🧺"), sort_order=len(sections))
                        db.add(section)
                        db.flush()
                        sections[section.id] = section
                        section_by_name[section.name.casefold()] = section
                    section_id = section.id
                product = Product(house_id=house_id, section_id=section_id, name=name,
                                  quantity=0 if payload.destination == "shopping" else item.quantity,
                                  unit=unit, usage_scope="shared", icon="🛒")
                db.add(product)
                db.flush()
                by_name[name_key(name)] = product
            elif payload.destination == "inventory":
                product.quantity = max(0, float(product.quantity or 0)) + item.quantity
            if shopping_list is not None:
                existing_item = existing_items.get(product.id)
                if existing_item:
                    existing_item.requested_quantity += item.quantity
                    existing_item.status = ShoppingItemStatus.to_buy
                else:
                    entry = ShoppingListItem(shopping_list_id=shopping_list.id, product_id=product.id,
                                            requested_quantity=item.quantity, bought_quantity=0,
                                            status=ShoppingItemStatus.to_buy)
                    db.add(entry)
                    existing_items[product.id] = entry
            count_added += 1
        log_activity(db, house_id=house_id, user=user, action="grocery_photo_import",
                     message=f"{display_name(user)} reviewed and added {count_added} items from a {'product photo' if payload.mode == 'products' else 'written list'} to {'inventory' if payload.destination == 'inventory' else 'a shopping list'}.",
                     entity_type="shopping_list" if shopping_list else "inventory", entity_id=shopping_list.id if shopping_list else None)
        db.commit()
        return {"ok": True, "count": count_added, "destination": payload.destination, "list_id": shopping_list.id if shopping_list else None}
    except Exception:
        db.rollback()
        raise
