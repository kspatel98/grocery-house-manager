from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_active_shopping_list_limit, ensure_product_limit
from app.db.session import get_db
from app.models import HouseholdTemplate, Product, Section, ShoppingItemStatus, ShoppingList, ShoppingListItem, User
from app.schemas import HouseholdTemplateApplyOut, HouseholdTemplateCreateIn, HouseholdTemplateOut

router = APIRouter(prefix="/templates", tags=["household templates"])


def _clean_items(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in items:
        item = " ".join((raw or "").strip().split())[:180]
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return cleaned[:80]


def _out(row: HouseholdTemplate, user: User) -> HouseholdTemplateOut:
    try:
        items = json.loads(row.items_json or "[]")
    except Exception:
        items = []
    owner = row.owner
    uploader = owner.full_name if owner and owner.full_name else (owner.email.split("@")[0] if owner and owner.email else "GHM user")
    return HouseholdTemplateOut(
        id=row.id,
        user_id=row.user_id,
        uploader_name=uploader,
        title=row.title,
        template_type=row.template_type,
        description=row.description,
        items=[str(item) for item in items if str(item).strip()],
        is_shared=bool(row.is_shared),
        uses_count=int(row.uses_count or 0),
        can_edit=row.user_id == user.id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[HouseholdTemplateOut])
def list_templates(
    mine_only: bool = False,
    search: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(HouseholdTemplate)
    if mine_only:
        query = query.filter(HouseholdTemplate.user_id == user.id)
    else:
        query = query.filter(or_(HouseholdTemplate.user_id == user.id, HouseholdTemplate.is_shared.is_(True)))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(HouseholdTemplate.title.ilike(pattern), HouseholdTemplate.description.ilike(pattern)))
    rows = query.order_by(HouseholdTemplate.is_shared.desc(), HouseholdTemplate.uses_count.desc(), HouseholdTemplate.updated_at.desc()).limit(100).all()
    return [_out(row, user) for row in rows]


@router.post("", response_model=HouseholdTemplateOut)
def create_template(payload: HouseholdTemplateCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = _clean_items(payload.items)
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one useful template item.")
    row = HouseholdTemplate(
        user_id=user.id,
        title=" ".join(payload.title.strip().split()),
        template_type=payload.template_type,
        description=(payload.description or "").strip() or None,
        items_json=json.dumps(items),
        is_shared=bool(payload.is_shared),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row, user)


@router.put("/{template_id}", response_model=HouseholdTemplateOut)
def update_template(template_id: int, payload: HouseholdTemplateCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(HouseholdTemplate, template_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    items = _clean_items(payload.items)
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one useful template item.")
    row.title = " ".join(payload.title.strip().split())
    row.template_type = payload.template_type
    row.description = (payload.description or "").strip() or None
    row.items_json = json.dumps(items)
    row.is_shared = bool(payload.is_shared)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row, user)


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(HouseholdTemplate, template_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "message": "Template deleted."}


def _template_section(db: Session, house_id: int) -> Section:
    section = db.query(Section).filter(Section.house_id == house_id, Section.name == "Template items").first()
    if section:
        return section
    section = Section(house_id=house_id, name="Template items", icon="🧺", sort_order=98)
    db.add(section)
    db.flush()
    return section


@router.post("/{template_id}/apply", response_model=HouseholdTemplateApplyOut)
def apply_template(template_id: int, house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    row = db.get(HouseholdTemplate, template_id)
    if not row or (row.user_id != user.id and not row.is_shared):
        raise HTTPException(status_code=404, detail="Template not found")
    try:
        items = _clean_items(json.loads(row.items_json or "[]"))
    except Exception:
        items = []
    if not items:
        raise HTTPException(status_code=400, detail="This template has no items to apply.")

    shopping_list = db.query(ShoppingList).filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False)).order_by(ShoppingList.created_at.desc()).first()
    if not shopping_list:
        ensure_active_shopping_list_limit(db, house_id, user)
        shopping_list = ShoppingList(house_id=house_id, title=f"{row.title} list", created_by_id=user.id)
        db.add(shopping_list)
        db.flush()

    existing_items = db.query(ShoppingListItem).filter(ShoppingListItem.shopping_list_id == shopping_list.id).all()
    existing_product_ids = {item.product_id for item in existing_items if item.status != ShoppingItemStatus.skipped}
    section: Section | None = None
    added: list[str] = []
    skipped: list[str] = []
    created: list[str] = []

    for name in items:
        product = db.query(Product).filter(Product.house_id == house_id, func.lower(Product.name) == name.casefold()).first()
        if not product:
            ensure_product_limit(db, house_id, user)
            if section is None:
                section = _template_section(db, house_id)
            product = Product(house_id=house_id, section_id=section.id, name=name, quantity=0, unit="pcs", low_stock_threshold=0, notes=f"Created from community template: {row.title}")
            db.add(product)
            db.flush()
            created.append(product.name)
        if product.id in existing_product_ids:
            skipped.append(product.name)
            continue
        db.add(ShoppingListItem(
            shopping_list_id=shopping_list.id,
            product_id=product.id,
            requested_quantity=1,
            bought_quantity=1,
            message=f"Template · {row.title}",
            status=ShoppingItemStatus.to_buy,
        ))
        existing_product_ids.add(product.id)
        added.append(product.name)

    row.uses_count = int(row.uses_count or 0) + 1
    row.updated_at = datetime.now(timezone.utc)
    log_activity(db, house_id=house_id, user=user, action="template_applied", message=f"{display_name(user)} applied the household template {row.title}.", entity_type="shopping_list", entity_id=shopping_list.id)
    db.commit()
    return HouseholdTemplateApplyOut(
        list_id=shopping_list.id,
        list_title=shopping_list.title,
        added_items=added,
        skipped_existing=skipped,
        created_products=created,
        message=f"{len(added)} item{'s' if len(added) != 1 else ''} from {row.title} added to {shopping_list.title}.",
    )
