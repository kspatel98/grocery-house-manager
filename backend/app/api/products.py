from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import difflib
import re
import shutil
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import asc, desc, or_
from sqlalchemy.orm import Session, joinedload
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_product_limit, ensure_receipt_scan_limit, receipt_scan_usage
from app.core.config import settings
from app.db.session import get_db
from app.models import Product, ProductStorePrice, Receipt, ReceiptLineItem, Section, User
from app.utils.receipt_ocr import local_receipt_scan, veryfi_receipt_scan
from app.schemas import ProductCreate, ProductOut, ProductUpdate, ReceiptCreate, ReceiptOut, ProductStorePriceOut, ReceiptLineItemOut, ReceiptParsedLineOut, ReceiptReviewSaveIn, ReceiptUploadOut

router = APIRouter(prefix="/houses/{house_id}", tags=["products"])

SORT_FIELDS = {
    "name": Product.name,
    "price": Product.price,
    "store_name": Product.store_name,
    "quantity": Product.quantity,
    "created_at": Product.created_at,
    "expiry_date": Product.expiry_date,
}


def serialize_store_price(price: ProductStorePrice) -> ProductStorePriceOut:
    return ProductStorePriceOut(
        id=price.id,
        store_name=price.store_name,
        price=price.price,
        source=price.source,
        recorded_at=price.recorded_at,
    )


def serialize_product(product: Product) -> ProductOut:
    today = date.today()
    is_low_stock = product.low_stock_threshold is not None and product.quantity <= product.low_stock_threshold
    is_expiring_soon = bool(product.expiry_date and product.expiry_date <= today + timedelta(days=7))
    return ProductOut(
        id=product.id,
        house_id=product.house_id,
        section_id=product.section_id,
        section_name=product.section.name if product.section else None,
        name=product.name,
        image_url=product.image_url,
        icon=product.icon,
        quantity=product.quantity,
        unit=product.unit,
        price=product.price,
        store_name=product.store_name,
        brand=product.brand,
        barcode=product.barcode,
        expiry_date=product.expiry_date,
        low_stock_threshold=product.low_stock_threshold,
        notes=product.notes,
        created_at=product.created_at,
        updated_at=product.updated_at,
        is_low_stock=is_low_stock,
        is_expiring_soon=is_expiring_soon,
        store_prices=[serialize_store_price(price) for price in sorted(product.store_prices, key=lambda p: (p.price, p.store_name.lower()))] if hasattr(product, "store_prices") and product.store_prices else [],
    )


@router.get("/products", response_model=list[ProductOut])
def list_products(
    house_id: int,
    sort_by: str = Query(default="name"),
    direction: str = Query(default="asc"),
    section_id: int | None = None,
    search: str | None = None,
    limit: int = Query(default=300, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    query = db.query(Product).options(joinedload(Product.section), joinedload(Product.store_prices)).filter(Product.house_id == house_id)
    if section_id:
        query = query.filter(Product.section_id == section_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(
            Product.name.ilike(pattern),
            Product.brand.ilike(pattern),
            Product.store_name.ilike(pattern),
            Product.barcode.ilike(pattern),
        ))
    sort_column = SORT_FIELDS.get(sort_by, Product.name)
    query = query.order_by(desc(sort_column) if direction == "desc" else asc(sort_column))
    query = query.offset(offset).limit(limit)
    return [serialize_product(product) for product in query.all()]


@router.post("/sections/{section_id}/products", response_model=ProductOut)
def create_product(house_id: int, section_id: int, payload: ProductCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    ensure_product_limit(db, house_id, user)
    section = db.query(Section).filter(Section.id == section_id, Section.house_id == house_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    product = Product(house_id=house_id, section_id=section_id, **payload.model_dump())
    db.add(product)
    db.flush()
    if product.price is not None and product.store_name:
        db.add(ProductStorePrice(
            house_id=house_id,
            product_id=product.id,
            store_name=product.store_name,
            price=product.price,
            source="manual",
            recorded_by_id=user.id,
        ))
    log_activity(db, house_id=house_id, user=user, action="product_created", message=f"Product {product.name} added by {display_name(user)}.", entity_type="product", entity_id=product.id)
    db.commit()
    db.refresh(product)
    product.section = section
    return serialize_product(product)


def _update_product_record(house_id: int, product_id: int, payload: ProductUpdate, db: Session, user: User) -> ProductOut:
    require_house_member(house_id, user, db)
    product = db.query(Product).options(joinedload(Product.section), joinedload(Product.store_prices)).filter(Product.id == product_id, Product.house_id == house_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    updates = payload.model_dump(exclude_unset=True)
    # Remove keys that are intentionally omitted or sent as undefined/null for required fields.
    cleaned_updates = {key: value for key, value in updates.items() if value is not None or key in {"price", "image_url", "icon", "store_name", "brand", "barcode", "expiry_date", "low_stock_threshold", "notes"}}

    if "section_id" in cleaned_updates:
        section_id = cleaned_updates["section_id"]
        if section_id is None:
            cleaned_updates.pop("section_id")
        else:
            section = db.query(Section).filter(Section.id == section_id, Section.house_id == house_id).first()
            if not section:
                raise HTTPException(status_code=400, detail="New section does not exist in this house")

    old_name = product.name
    old_store_name = product.store_name
    price_was_sent = "price" in cleaned_updates
    for key, value in cleaned_updates.items():
        setattr(product, key, value)

    if price_was_sent and product.price is None:
        store_to_clear = product.store_name or old_store_name
        if store_to_clear:
            db.query(ProductStorePrice).filter(
                ProductStorePrice.product_id == product.id,
                ProductStorePrice.store_name == store_to_clear,
                ProductStorePrice.source == "manual",
            ).delete(synchronize_session=False)

    if product.price is not None and product.store_name:
        existing_price = db.query(ProductStorePrice).filter(
            ProductStorePrice.product_id == product.id,
            ProductStorePrice.store_name == product.store_name,
        ).first()
        if existing_price:
            existing_price.price = product.price
            existing_price.source = "manual"
            existing_price.recorded_by_id = user.id
        else:
            db.add(ProductStorePrice(
                house_id=house_id,
                product_id=product.id,
                store_name=product.store_name,
                price=product.price,
                source="manual",
                recorded_by_id=user.id,
            ))

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="product_updated",
        message=f"Product {old_name} updated by {display_name(user)}.",
        entity_type="product",
        entity_id=product.id,
    )
    db.commit()

    refreshed = db.query(Product).options(joinedload(Product.section), joinedload(Product.store_prices)).filter(Product.id == product_id, Product.house_id == house_id).first()
    if not refreshed:
        raise HTTPException(status_code=404, detail="Product not found after update")
    return serialize_product(refreshed)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(house_id: int, product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _update_product_record(house_id, product_id, payload, db, user)


@router.post("/products/{product_id}/edit", response_model=ProductOut)
def update_product_via_post(house_id: int, product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return _update_product_record(house_id, product_id, payload, db, user)




PRICE_PATTERN = re.compile(r"(?P<name>[A-Za-z][A-Za-z0-9 '&.,/-]{2,}?)\s+\$?(?P<price>\d{1,4}[.,]\d{2})\s*$")


def safe_upload_name(filename: str) -> str:
    suffix = Path(filename or "receipt").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        suffix = ".jpg"
    return f"receipt-{uuid4().hex}{suffix}"


def receipt_upload_size_ok(file: UploadFile) -> None:
    # FastAPI's UploadFile does not expose content length reliably across all proxies,
    # so the stream copy below is the final guard. This helper keeps the user-facing
    # error in one place.
    if file.content_type and not (
        file.content_type.startswith("image/")
        or file.content_type in {"application/pdf", "application/octet-stream"}
    ):
        raise HTTPException(status_code=400, detail="Upload a receipt image or PDF.")


def match_product_for_line(description: str, products: list[Product]) -> tuple[Product | None, float]:
    clean = " ".join((description or "").lower().replace("*", " ").split())
    if not clean:
        return None, 0.0
    best: Product | None = None
    best_score = 0.0
    for product in products:
        product_name = " ".join(product.name.lower().split())
        if not product_name:
            continue
        if product_name in clean or clean in product_name:
            score = 0.95
        else:
            score = difflib.SequenceMatcher(None, product_name, clean).ratio()
        if product.barcode and product.barcode in clean:
            score = max(score, 0.98)
        if score > best_score:
            best = product
            best_score = score
    if best_score < 0.62:
        return None, best_score
    return best, best_score


def serialize_receipt_line_item(item: ReceiptLineItem) -> ReceiptLineItemOut:
    return ReceiptLineItemOut(
        id=item.id,
        line_type=item.line_type,
        description=item.description,
        normalized_name=item.normalized_name,
        sku=item.sku,
        upc=item.upc,
        quantity=item.quantity,
        unit_price=item.unit_price,
        discount_amount=item.discount_amount,
        tax_amount=item.tax_amount,
        line_total=item.line_total,
        confidence=item.confidence,
        needs_review=item.needs_review,
        is_selected=item.is_selected,
        matched_product_id=item.matched_product_id,
        matched_product_name=item.matched_product.name if item.matched_product else None,
    )


def serialize_receipt(receipt: Receipt) -> ReceiptOut:
    return ReceiptOut(
        id=receipt.id,
        house_id=receipt.house_id,
        store_name=receipt.store_name,
        receipt_date=receipt.receipt_date,
        image_url=receipt.image_url,
        notes=receipt.notes,
        ocr_provider=receipt.ocr_provider,
        ocr_status=receipt.ocr_status,
        ocr_confidence=receipt.ocr_confidence,
        currency=receipt.currency,
        subtotal_amount=receipt.subtotal_amount,
        tax_amount=receipt.tax_amount,
        discount_amount=receipt.discount_amount,
        total_amount=receipt.total_amount,
        receipt_number=receipt.receipt_number,
        payment_method=receipt.payment_method,
        reviewed_at=receipt.reviewed_at,
        created_at=receipt.created_at,
        uploaded_by=receipt.uploaded_by,
        price_entries=[serialize_store_price(price) for price in receipt.price_entries],
        line_items=[serialize_receipt_line_item(item) for item in sorted(receipt.line_items, key=lambda line: (line.sort_order, line.id))] if getattr(receipt, "line_items", None) else [],
    )


def parsed_line_from_item(item: ReceiptLineItem) -> ReceiptParsedLineOut:
    return ReceiptParsedLineOut(
        raw_text=item.description,
        line_item_id=item.id,
        product_name=item.description,
        matched_product_id=item.matched_product_id,
        matched_product_name=item.matched_product.name if item.matched_product else None,
        quantity=item.quantity,
        unit_price=item.unit_price,
        price=item.line_total,
        discount_amount=item.discount_amount,
        confidence=item.confidence,
        line_type=item.line_type,
        needs_review=item.needs_review,
        applied=False,
    )


def price_for_history(quantity: float | None, unit_price: float | None, line_total: float | None, discount: float | None) -> float | None:
    if unit_price is not None and unit_price >= 0:
        return round(float(unit_price), 2)
    if line_total is not None and line_total >= 0:
        qty = quantity or 1
        if qty > 0:
            return round(max((float(line_total) - float(discount or 0)) / qty, 0), 2)
        return round(float(line_total), 2)
    return None


def upsert_store_price(db: Session, *, house_id: int, product: Product, store_name: str, price: float, source: str, receipt_id: int, user_id: int) -> None:
    existing = db.query(ProductStorePrice).filter(
        ProductStorePrice.product_id == product.id,
        ProductStorePrice.store_name == store_name,
    ).first()
    if existing:
        existing.price = price
        existing.source = source
        existing.receipt_id = receipt_id
        existing.recorded_by_id = user_id
        existing.recorded_at = datetime.now(timezone.utc)
    else:
        db.add(ProductStorePrice(
            house_id=house_id,
            product_id=product.id,
            store_name=store_name,
            price=price,
            source=source,
            receipt_id=receipt_id,
            recorded_by_id=user_id,
        ))
    product.price = price
    product.store_name = store_name
    product.last_bought_at = datetime.now(timezone.utc)


@router.get("/receipts", response_model=list[ReceiptOut])
def list_receipts(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    receipts = (
        db.query(Receipt)
        .options(
            joinedload(Receipt.uploaded_by),
            joinedload(Receipt.price_entries),
            joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product),
        )
        .filter(Receipt.house_id == house_id)
        .order_by(Receipt.created_at.desc(), Receipt.id.desc())
        .limit(50)
        .all()
    )
    return [serialize_receipt(receipt) for receipt in receipts]


@router.post("/receipts", response_model=ReceiptOut)
def create_receipt(house_id: int, payload: ReceiptCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    receipt = Receipt(
        house_id=house_id,
        uploaded_by_id=user.id,
        store_name=payload.store_name,
        receipt_date=payload.receipt_date,
        image_url=payload.image_url,
        notes=payload.notes,
        ocr_status="saved_manual",
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(receipt)
    db.flush()

    updated_products: list[str] = []
    for index, line in enumerate(payload.items):
        product = db.query(Product).filter(Product.id == line.product_id, Product.house_id == house_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {line.product_id} does not belong to this house")
        store = (line.store_name or payload.store_name or product.store_name or "Unknown store").strip()
        upsert_store_price(db, house_id=house_id, product=product, store_name=store, price=line.price, source="receipt", receipt_id=receipt.id, user_id=user.id)
        db.add(ReceiptLineItem(
            receipt_id=receipt.id,
            house_id=house_id,
            matched_product_id=product.id,
            line_type="product",
            description=product.name,
            normalized_name=product.name,
            quantity=1,
            unit_price=line.price,
            line_total=line.price,
            needs_review=False,
            is_selected=True,
            sort_order=index,
        ))
        updated_products.append(product.name)

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="receipt_uploaded",
        message=f"Manual receipt saved by {display_name(user)}. Updated prices for {len(updated_products)} product(s).",
        entity_type="receipt",
        entity_id=receipt.id,
    )
    db.commit()
    refreshed = db.query(Receipt).options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries), joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product)).filter(Receipt.id == receipt.id).first()
    return serialize_receipt(refreshed)


@router.post("/receipts/upload", response_model=ReceiptUploadOut)
def upload_receipt_file(
    house_id: int,
    file: UploadFile = File(...),
    store_name: str | None = Form(default=None),
    receipt_date: date | None = Form(default=None),
    notes: str | None = Form(default=None),
    receipt_text: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    ensure_receipt_scan_limit(db, house_id, user)
    receipt_upload_size_ok(file)
    uploads_dir = Path(settings.upload_dir) / f"house-{house_id}"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = safe_upload_name(file.filename or "receipt.jpg")
    destination = uploads_dir / filename
    max_bytes = max(settings.receipt_upload_max_mb, 1) * 1024 * 1024
    written = 0
    with destination.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Receipt file is too large. Upload a file up to {settings.receipt_upload_max_mb} MB.")
            output.write(chunk)
    image_url = f"/uploads/house-{house_id}/{filename}"

    scan = veryfi_receipt_scan(destination, filename, receipt_text)
    products = db.query(Product).filter(Product.house_id == house_id).all()
    receipt = Receipt(
        house_id=house_id,
        uploaded_by_id=user.id,
        store_name=(store_name or scan.get("store_name") or None),
        receipt_date=receipt_date or scan.get("receipt_date"),
        image_url=image_url,
        notes=notes or "Receipt scanned. Review extracted data before saving to price history.",
        ocr_provider=scan.get("provider"),
        ocr_status=scan.get("status") or "review_ready",
        ocr_confidence=scan.get("confidence"),
        currency=scan.get("currency"),
        subtotal_amount=scan.get("subtotal_amount"),
        tax_amount=scan.get("tax_amount"),
        discount_amount=scan.get("discount_amount"),
        total_amount=scan.get("total_amount"),
        receipt_number=scan.get("receipt_number"),
        payment_method=scan.get("payment_method"),
        raw_extracted_text=scan.get("raw_text"),
        raw_extracted_json=scan.get("raw_json"),
    )
    db.add(receipt)
    db.flush()

    matched_count = 0
    for index, line in enumerate(scan.get("line_items") or []):
        matched_product, match_score = match_product_for_line(str(line.get("description") or ""), products)
        if matched_product:
            matched_count += 1
        db.add(ReceiptLineItem(
            receipt_id=receipt.id,
            house_id=house_id,
            matched_product_id=matched_product.id if matched_product else None,
            line_type=line.get("line_type") or "product",
            description=str(line.get("description") or f"Receipt item {index + 1}")[:500],
            normalized_name=line.get("normalized_name"),
            sku=line.get("sku"),
            upc=line.get("upc"),
            quantity=line.get("quantity"),
            unit_price=line.get("unit_price"),
            discount_amount=line.get("discount_amount"),
            tax_amount=line.get("tax_amount"),
            line_total=line.get("line_total"),
            confidence=line.get("confidence") or match_score or None,
            needs_review=bool(line.get("needs_review", True)) or not matched_product,
            is_selected=(line.get("line_type") or "product") == "product",
            sort_order=index,
        ))

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="receipt_scanned",
        message=f"Receipt scanned by {display_name(user)}. {len(scan.get('line_items') or [])} line item(s) are ready for review.",
        entity_type="receipt",
        entity_id=receipt.id,
    )
    db.commit()
    refreshed = db.query(Receipt).options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries), joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product)).filter(Receipt.id == receipt.id).first()
    parsed = [parsed_line_from_item(item) for item in sorted(refreshed.line_items, key=lambda line: (line.sort_order, line.id))]
    usage = receipt_scan_usage(db, house_id, user)
    message = scan.get("message") or "Receipt scanned. Review every row before saving."
    if usage.get("limit"):
        message = f"{message} Monthly scans used: {usage.get('used')}/{usage.get('limit')}."
    return ReceiptUploadOut(
        receipt=serialize_receipt(refreshed),
        extracted_text=refreshed.raw_extracted_text,
        parsed_lines=parsed,
        matched_count=matched_count,
        message=message,
        scan_status=refreshed.ocr_status,
    )


@router.post("/receipts/{receipt_id}/confirm", response_model=ReceiptOut)
def confirm_receipt_review(house_id: int, receipt_id: int, payload: ReceiptReviewSaveIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    receipt = (
        db.query(Receipt)
        .options(joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product), joinedload(Receipt.price_entries), joinedload(Receipt.uploaded_by))
        .filter(Receipt.id == receipt_id, Receipt.house_id == house_id)
        .first()
    )
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    receipt.store_name = payload.store_name or receipt.store_name or "Receipt store"
    receipt.receipt_date = payload.receipt_date or receipt.receipt_date
    receipt.receipt_number = payload.receipt_number or receipt.receipt_number
    receipt.payment_method = payload.payment_method or receipt.payment_method
    receipt.subtotal_amount = payload.subtotal_amount
    receipt.tax_amount = payload.tax_amount
    receipt.discount_amount = payload.discount_amount
    receipt.total_amount = payload.total_amount
    receipt.notes = payload.notes or receipt.notes
    receipt.ocr_status = "saved_reviewed"
    receipt.reviewed_at = datetime.now(timezone.utc)

    by_id = {item.id: item for item in receipt.line_items}
    updated_count = 0
    for index, line in enumerate(payload.items):
        item = by_id.get(line.id) if line.id else None
        if item is None:
            item = ReceiptLineItem(receipt_id=receipt.id, house_id=house_id, description=line.description, sort_order=index)
            db.add(item)
            db.flush()
        item.description = line.description.strip()
        item.normalized_name = line.description.strip()[:220]
        item.line_type = line.line_type or "product"
        item.quantity = line.quantity
        item.unit_price = line.unit_price
        item.line_total = line.line_total
        item.discount_amount = line.discount_amount
        item.tax_amount = line.tax_amount
        item.is_selected = line.is_selected
        item.sort_order = index
        item.matched_product_id = line.product_id
        item.needs_review = not (line.is_selected and line.product_id and (line.unit_price is not None or line.line_total is not None))
        if not line.is_selected or line.line_type != "product" or not line.product_id:
            continue
        product = db.query(Product).filter(Product.id == line.product_id, Product.house_id == house_id).first()
        if not product:
            continue
        price = price_for_history(line.quantity, line.unit_price, line.line_total, line.discount_amount)
        if price is None:
            continue
        upsert_store_price(db, house_id=house_id, product=product, store_name=receipt.store_name or "Receipt store", price=price, source="receipt_scan_reviewed", receipt_id=receipt.id, user_id=user.id)
        updated_count += 1

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="receipt_review_saved",
        message=f"Receipt reviewed by {display_name(user)}. Updated price history for {updated_count} product(s).",
        entity_type="receipt",
        entity_id=receipt.id,
    )
    db.commit()
    refreshed = db.query(Receipt).options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries), joinedload(Receipt.line_items).joinedload(ReceiptLineItem.matched_product)).filter(Receipt.id == receipt.id).first()
    return serialize_receipt(refreshed)


@router.delete("/products/{product_id}")
def delete_product(house_id: int, product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    product = db.query(Product).filter(Product.id == product_id, Product.house_id == house_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product_name = product.name
    db.delete(product)
    log_activity(db, house_id=house_id, user=user, action="product_deleted", message=f"Product {product_name} removed by {display_name(user)}.", entity_type="product", entity_id=product_id)
    db.commit()
    return {"ok": True}
