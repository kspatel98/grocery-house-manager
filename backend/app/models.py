from datetime import date, datetime, timezone
from enum import Enum
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuthProvider(str, Enum):
    email = "email"
    google = "google"


class HouseRole(str, Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


class ShoppingItemStatus(str, Enum):
    to_buy = "to_buy"
    in_cart = "in_cart"
    skipped = "skipped"


class PlanName(str, Enum):
    free = "free"
    basic = "basic"
    family = "family"
    pro = "pro"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    auth_provider: Mapped[AuthProvider] = mapped_column(SAEnum(AuthProvider), default=AuthProvider.email)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    plan_name: Mapped[PlanName] = mapped_column(SAEnum(PlanName), default=PlanName.free)
    subscription_status: Mapped[str] = mapped_column(String(60), default="free")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    subscription_current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list["HouseMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    activities: Mapped[list["Activity"]] = relationship(back_populates="user")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="uploaded_by")
    price_entries: Mapped[list["ProductStorePrice"]] = relationship(back_populates="recorded_by")
    password_reset_codes: Mapped[list["PasswordResetCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    password_history: Mapped[list["PasswordHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class PasswordHistory(Base):
    __tablename__ = "password_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    user: Mapped[User] = relationship(back_populates="password_history")


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="password_reset_codes")


class House(Base):
    __tablename__ = "houses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    members: Mapped[list["HouseMember"]] = relationship(back_populates="house", cascade="all, delete-orphan")
    sections: Mapped[list["Section"]] = relationship(back_populates="house", cascade="all, delete-orphan")
    invites: Mapped[list["Invite"]] = relationship(back_populates="house", cascade="all, delete-orphan")
    activities: Mapped[list["Activity"]] = relationship(back_populates="house", cascade="all, delete-orphan")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="house", cascade="all, delete-orphan")


class HouseMember(Base):
    __tablename__ = "house_members"
    __table_args__ = (UniqueConstraint("house_id", "user_id", name="uq_house_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[HouseRole] = mapped_column(SAEnum(HouseRole), default=HouseRole.member)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    house: Mapped[House] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    house: Mapped[House] = relationship(back_populates="invites")


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (UniqueConstraint("house_id", "name", name="uq_house_section_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str | None] = mapped_column(String(64))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    house: Mapped[House] = relationship(back_populates="sections")
    products: Mapped[list["Product"]] = relationship(back_populates="section", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    image_url: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(64))
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(32), default="pcs")
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    store_name: Mapped[str | None] = mapped_column(String(150), index=True)
    brand: Mapped[str | None] = mapped_column(String(120))
    barcode: Mapped[str | None] = mapped_column(String(120), index=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    low_stock_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    last_bought_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    section: Mapped[Section] = relationship(back_populates="products")
    shopping_items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="product")
    store_prices: Mapped[list["ProductStorePrice"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180), default="Grocery List")
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="shopping_list", cascade="all, delete-orphan")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(ForeignKey("shopping_lists.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    requested_quantity: Mapped[float] = mapped_column(Float, default=1)
    bought_quantity: Mapped[float] = mapped_column(Float, default=1)
    message: Mapped[str | None] = mapped_column(Text)
    bought_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    bought_store_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    status: Mapped[ShoppingItemStatus] = mapped_column(SAEnum(ShoppingItemStatus), default=ShoppingItemStatus.to_buy)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    shopping_list: Mapped[ShoppingList] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(back_populates="shopping_items")


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    store_name: Mapped[str | None] = mapped_column(String(150), index=True)
    receipt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    ocr_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ocr_status: Mapped[str] = mapped_column(String(50), default="manual", index=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(12), nullable=True)
    subtotal_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(120), nullable=True)
    raw_extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_extracted_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    house: Mapped[House] = relationship(back_populates="receipts")
    uploaded_by: Mapped[User | None] = relationship(back_populates="receipts")
    price_entries: Mapped[list["ProductStorePrice"]] = relationship(back_populates="receipt", cascade="all, delete-orphan")
    line_items: Mapped[list["ReceiptLineItem"]] = relationship(back_populates="receipt", cascade="all, delete-orphan")


class ReceiptLineItem(Base):
    __tablename__ = "receipt_line_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("receipts.id", ondelete="CASCADE"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    matched_product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    line_type: Mapped[str] = mapped_column(String(50), default="product", index=True)
    description: Mapped[str] = mapped_column(Text)
    normalized_name: Mapped[str | None] = mapped_column(String(220), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(120), nullable=True)
    upc: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    line_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=True)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    receipt: Mapped[Receipt] = relationship(back_populates="line_items")
    matched_product: Mapped[Product | None] = relationship()


class ProductStorePrice(Base):
    __tablename__ = "product_store_prices"
    __table_args__ = (UniqueConstraint("product_id", "store_name", name="uq_product_store_price"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    store_name: Mapped[str] = mapped_column(String(150), index=True)
    price: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(60), default="manual")
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True, index=True)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    product: Mapped[Product] = relationship(back_populates="store_prices")
    receipt: Mapped[Receipt | None] = relationship(back_populates="price_entries")
    recorded_by: Mapped[User | None] = relationship(back_populates="price_entries")


class ExternalPriceCache(Base):
    __tablename__ = "external_price_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    cache_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(80), default="apify_canada")
    query: Mapped[str] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(180), nullable=True)
    retailers: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    message: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    house: Mapped[House] = relationship(back_populates="activities")
    user: Mapped[User | None] = relationship(back_populates="activities")
