from datetime import date, timedelta
from pathlib import Path
import re
import shutil
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session, joinedload
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_product_limit
from app.core.config import settings
from app.db.session import get_db
from app.models import Product, ProductStorePrice, Receipt, Section, User
from app.schemas import ProductCreate, ProductOut, ProductUpdate, ReceiptCreate, ReceiptOut, ProductStorePriceOut, ReceiptParsedLineOut, ReceiptUploadOut

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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    query = db.query(Product).options(joinedload(Product.section), joinedload(Product.store_prices)).filter(Product.house_id == house_id)
    if section_id:
        query = query.filter(Product.section_id == section_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    sort_column = SORT_FIELDS.get(sort_by, Product.name)
    query = query.order_by(desc(sort_column) if direction == "desc" else asc(sort_column))
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


def extract_receipt_text(path: Path) -> str:
    """Best-effort OCR for receipt images. PDFs are stored but not OCR'd in this starter."""
    if path.suffix.lower() == ".pdf":
        return ""
    try:
        from PIL import Image
        import pytesseract
        return pytesseract.image_to_string(Image.open(path)) or ""
    except Exception:
        return ""


def parse_receipt_lines(text_value: str, products: list[Product], store_name: str | None, house_id: int, receipt_id: int, user_id: int, db: Session) -> tuple[list[ReceiptParsedLineOut], int]:
    parsed: list[ReceiptParsedLineOut] = []
    matched_count = 0
    product_lookup = [(product, product.name.lower()) for product in products]
    for raw_line in (text_value or "").splitlines():
        line = " ".join(raw_line.strip().split())
        if not line or len(line) < 5:
            continue
        match = PRICE_PATTERN.search(line)
        if not match:
            continue
        item_name = match.group("name").strip(" -:.")
        try:
            item_price = float(match.group("price").replace(",", "."))
        except ValueError:
            continue
        item_lower = item_name.lower()
        matched_product = None
        for product, product_lower in product_lookup:
            if product_lower in item_lower or item_lower in product_lower:
                matched_product = product
                break
        applied = False
        if matched_product:
            store = (store_name or matched_product.store_name or "Receipt store").strip()
            existing = db.query(ProductStorePrice).filter(
                ProductStorePrice.product_id == matched_product.id,
                ProductStorePrice.store_name == store,
            ).first()
            if existing:
                existing.price = item_price
                existing.source = "receipt_ocr"
                existing.receipt_id = receipt_id
                existing.recorded_by_id = user_id
            else:
                db.add(ProductStorePrice(
                    house_id=house_id,
                    product_id=matched_product.id,
                    store_name=store,
                    price=item_price,
                    source="receipt_ocr",
                    receipt_id=receipt_id,
                    recorded_by_id=user_id,
                ))
            matched_product.price = item_price
            matched_product.store_name = store
            matched_count += 1
            applied = True
        parsed.append(ReceiptParsedLineOut(
            raw_text=line,
            product_name=item_name,
            matched_product_id=matched_product.id if matched_product else None,
            matched_product_name=matched_product.name if matched_product else None,
            price=item_price,
            applied=applied,
        ))
    return parsed[:30], matched_count


def serialize_receipt(receipt: Receipt) -> ReceiptOut:
    return ReceiptOut(
        id=receipt.id,
        house_id=receipt.house_id,
        store_name=receipt.store_name,
        receipt_date=receipt.receipt_date,
        image_url=receipt.image_url,
        notes=receipt.notes,
        created_at=receipt.created_at,
        uploaded_by=receipt.uploaded_by,
        price_entries=[serialize_store_price(price) for price in receipt.price_entries],
    )


@router.get("/receipts", response_model=list[ReceiptOut])
def list_receipts(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    receipts = (
        db.query(Receipt)
        .options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries))
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
    )
    db.add(receipt)
    db.flush()

    updated_products: list[str] = []
    for line in payload.items:
        product = db.query(Product).filter(Product.id == line.product_id, Product.house_id == house_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {line.product_id} does not belong to this house")
        store = (line.store_name or payload.store_name or product.store_name or "Unknown store").strip()
        existing = db.query(ProductStorePrice).filter(
            ProductStorePrice.product_id == product.id,
            ProductStorePrice.store_name == store,
        ).first()
        if existing:
            existing.price = line.price
            existing.source = "receipt"
            existing.receipt_id = receipt.id
            existing.recorded_by_id = user.id
        else:
            db.add(ProductStorePrice(
                house_id=house_id,
                product_id=product.id,
                store_name=store,
                price=line.price,
                source="receipt",
                receipt_id=receipt.id,
                recorded_by_id=user.id,
            ))
        product.price = line.price
        product.store_name = store
        updated_products.append(product.name)

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="receipt_uploaded",
        message=f"Receipt uploaded by {display_name(user)}. Updated prices for {len(updated_products)} product(s).",
        entity_type="receipt",
        entity_id=receipt.id,
    )
    db.commit()
    refreshed = db.query(Receipt).options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries)).filter(Receipt.id == receipt.id).first()
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
    uploads_dir = Path(settings.upload_dir) / f"house-{house_id}"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = safe_upload_name(file.filename or "receipt.jpg")
    destination = uploads_dir / filename
    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    image_url = f"/uploads/house-{house_id}/{filename}"

    extracted = (receipt_text or "").strip()
    if not extracted:
        extracted = extract_receipt_text(destination).strip()

    receipt = Receipt(
        house_id=house_id,
        uploaded_by_id=user.id,
        store_name=(store_name or None),
        receipt_date=receipt_date,
        image_url=image_url,
        notes=notes or ("Receipt uploaded with automatic OCR." if extracted else "Receipt uploaded. Add prices manually if OCR did not find products."),
    )
    db.add(receipt)
    db.flush()

    products = db.query(Product).filter(Product.house_id == house_id).all()
    parsed_lines, matched_count = parse_receipt_lines(extracted, products, store_name, house_id, receipt.id, user.id, db)

    log_activity(
        db,
        house_id=house_id,
        user=user,
        action="receipt_file_uploaded",
        message=f"Receipt photo uploaded by {display_name(user)}. Auto-updated {matched_count} product price(s).",
        entity_type="receipt",
        entity_id=receipt.id,
    )
    db.commit()
    refreshed = db.query(Receipt).options(joinedload(Receipt.uploaded_by), joinedload(Receipt.price_entries)).filter(Receipt.id == receipt.id).first()
    message = (
        f"Receipt uploaded. Auto-updated {matched_count} matched product price(s). Review unmatched lines before relying on them."
        if extracted else
        "Receipt uploaded. OCR did not find readable text, so add product prices manually from the receipt."
    )
    return ReceiptUploadOut(
        receipt=serialize_receipt(refreshed),
        extracted_text=extracted or None,
        parsed_lines=parsed_lines,
        matched_count=matched_count,
        message=message,
    )


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
