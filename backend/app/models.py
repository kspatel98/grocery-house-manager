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
    extra_receipt_scan_credits: Mapped[int] = mapped_column(Integer, default=0)
    # V102: one complimentary premium workflow for Free users. Selection may be
    # changed until the experience is successfully used. The server records the
    # selected workflow and completion time so this cannot be reset from a browser.
    premium_try_feature: Mapped[str | None] = mapped_column(String(80), nullable=True)
    premium_try_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    premium_try_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    premium_try_house_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list["HouseMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    activities: Mapped[list["Activity"]] = relationship(back_populates="user")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="uploaded_by")
    price_entries: Mapped[list["ProductStorePrice"]] = relationship(back_populates="recorded_by")
    reviews: Mapped[list["SiteReview"]] = relationship(back_populates="user", cascade="all, delete-orphan", foreign_keys="SiteReview.user_id")
    password_reset_codes: Mapped[list["PasswordResetCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    registration_verification_codes: Mapped[list["RegistrationVerificationCode"]] = relationship(back_populates="existing_user", cascade="all, delete-orphan")
    password_history: Mapped[list["PasswordHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    community_recipes: Mapped[list["CommunityRecipe"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


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


class RegistrationVerificationCode(Base):
    __tablename__ = "registration_verification_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    existing_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    existing_user: Mapped[User | None] = relationship(back_populates="registration_verification_codes")


class House(Base):
    __tablename__ = "houses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    contribute_community_prices: Mapped[bool] = mapped_column(Boolean, default=False)
    autopilot_strategy: Mapped[str] = mapped_column(String(24), default="balanced")
    autopilot_max_stores: Mapped[int] = mapped_column(Integer, default=1)
    autopilot_allow_premium: Mapped[bool] = mapped_column(Boolean, default=True)
    autopilot_allow_split_trip: Mapped[bool] = mapped_column(Boolean, default=False)
    autopilot_preferred_stores: Mapped[str | None] = mapped_column(Text, nullable=True)
    autopilot_learning_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    autopilot_use_community_recipes: Mapped[bool] = mapped_column(Boolean, default=True)
    household_type: Mapped[str] = mapped_column(String(24), default="family")
    # Expense account creation mode: auto creates the current monthly account lazily
    # when the household opens Expenses; custom creates accounts only on request.
    expense_book_mode: Mapped[str] = mapped_column(String(16), default="auto")
    onboarding_preferences_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    usage_scope: Mapped[str] = mapped_column(String(24), default="shared")
    usage_member_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_bought_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    section: Mapped[Section] = relationship(back_populates="products")
    shopping_items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="product")
    store_prices: Mapped[list["ProductStorePrice"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class KitchenStorageZone(Base):
    __tablename__ = "kitchen_storage_zones"
    __table_args__ = (UniqueConstraint("house_id", "name", name="uq_house_kitchen_zone_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    zone_type: Mapped[str] = mapped_column(String(32), default="custom")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_coverage_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_confidence_label: Mapped[str | None] = mapped_column(String(24), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class KitchenVisionScan(Base):
    __tablename__ = "kitchen_vision_scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("kitchen_storage_zones.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    scan_mode: Mapped[str] = mapped_column(String(24), default="quick")
    coverage_percent: Mapped[int] = mapped_column(Integer, default=0)
    coverage_label: Mapped[str] = mapped_column(String(24), default="partial")
    frames_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    detections_count: Mapped[int] = mapped_column(Integer, default=0)
    uncertain_count: Mapped[int] = mapped_column(Integer, default=0)
    scene_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class KitchenVisionObservation(Base):
    __tablename__ = "kitchen_vision_observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("kitchen_vision_scans.id", ondelete="CASCADE"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("kitchen_storage_zones.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    detected_name: Mapped[str] = mapped_column(String(180))
    visibility_state: Mapped[str] = mapped_column(String(32), default="seen")
    visible_instance_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantity_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    evidence: Mapped[str] = mapped_column(String(40), default="visual")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


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
    shopping_list_id: Mapped[int | None] = mapped_column(ForeignKey("shopping_lists.id", ondelete="SET NULL"), nullable=True, index=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    store_name: Mapped[str | None] = mapped_column(String(150), index=True)
    receipt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    ocr_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    receipt_scan_credit_source: Mapped[str | None] = mapped_column(String(32), nullable=True, default="included")
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
    line_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    line_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=True)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=True)
    inventory_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    inventory_quantity_applied: Mapped[float | None] = mapped_column(Float, nullable=True)
    inventory_unit_applied: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_product_from_receipt: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    receipt: Mapped[Receipt] = relationship(back_populates="line_items")
    matched_product: Mapped[Product | None] = relationship()


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    __table_args__ = (UniqueConstraint("house_id", "name", name="uq_expense_category_house_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str] = mapped_column(String(16), default="✨")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)





class ExpenseMonthLock(Base):
    __tablename__ = "expense_month_locks"
    __table_args__ = (UniqueConstraint("house_id", "month_key", name="uq_expense_month_lock_house_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    month_key: Mapped[str] = mapped_column(String(7), index=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    locked_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_auto_created: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    locked_by: Mapped[User | None] = relationship(foreign_keys=[locked_by_user_id])
    participants: Mapped[list["ExpenseMonthParticipant"]] = relationship(back_populates="expense_month", cascade="all, delete-orphan")


class ExpenseMonthParticipant(Base):
    __tablename__ = "expense_month_participants"
    __table_args__ = (UniqueConstraint("expense_month_id", "user_id", name="uq_expense_month_participant_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_month_id: Mapped[int] = mapped_column(ForeignKey("expense_month_locks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    added_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    expense_month: Mapped[ExpenseMonthLock] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    added_by: Mapped[User | None] = relationship(foreign_keys=[added_by_user_id])


class HouseExpense(Base):
    __tablename__ = "house_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(12), default="CAD")
    category: Mapped[str] = mapped_column(String(80), default="Groceries")
    paid_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True, index=True)
    expense_date: Mapped[date] = mapped_column(Date, default=date.today)
    # Accounting month is intentionally separate from the purchase date. A household
    # can keep posting to September for a few days in October, then switch when ready.
    expense_month: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    shares: Mapped[list["ExpenseShare"]] = relationship(back_populates="expense", cascade="all, delete-orphan")
    paid_by: Mapped[User] = relationship(foreign_keys=[paid_by_user_id])
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    receipt: Mapped[Receipt | None] = relationship()


class ExpenseShare(Base):
    __tablename__ = "expense_shares"
    __table_args__ = (UniqueConstraint("expense_id", "user_id", name="uq_expense_share_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("house_expenses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    share_amount: Mapped[float] = mapped_column(Float)

    expense: Mapped[HouseExpense] = relationship(back_populates="shares")
    user: Mapped[User] = relationship()


class ExpenseSettlement(Base):
    __tablename__ = "expense_settlements"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expense_month: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(12), default="CAD")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed", index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    from_user: Mapped[User] = relationship(foreign_keys=[from_user_id])
    to_user: Mapped[User] = relationship(foreign_keys=[to_user_id])


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


class CommunityPriceObservation(Base):
    __tablename__ = "community_price_observations"
    __table_args__ = (UniqueConstraint("source_house_id", "product_key", "store_name", "observed_on", name="uq_community_price_house_product_store_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    product_key: Mapped[str] = mapped_column(String(220), index=True)
    product_name: Mapped[str] = mapped_column(String(180))
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    store_name: Mapped[str] = mapped_column(String(150), index=True)
    price: Mapped[float] = mapped_column(Float)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    observed_on: Mapped[date] = mapped_column(Date, index=True)
    source: Mapped[str] = mapped_column(String(60), default="reviewed_receipt")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class ReceiptScanPurchase(Base):
    __tablename__ = "receipt_scan_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stripe_session_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    pack_key: Mapped[str] = mapped_column(String(80))
    scan_count: Mapped[int] = mapped_column(Integer)
    amount_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(60), default="paid", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    user: Mapped[User] = relationship()


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



class UserFeatureBudget(Base):
    """Atomic plan usage across every house owned by one paying user."""
    __tablename__ = "user_feature_budget"
    __table_args__ = (UniqueConstraint("user_id", "feature_key", "period_key", name="uq_user_feature_budget_period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    feature_key: Mapped[str] = mapped_column(String(50), index=True)
    period_key: Mapped[str] = mapped_column(String(12), index=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class HouseProviderBudget(Base):
    """Atomic daily/monthly quota counter for actual paid provider invocations."""
    __tablename__ = "house_provider_budget"
    __table_args__ = (UniqueConstraint("house_id", "period_key", name="uq_house_provider_budget_period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    period_key: Mapped[str] = mapped_column(String(24), index=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ProductEvent(Base):
    __tablename__ = "product_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    house_id: Mapped[int | None] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), nullable=True, index=True)
    event_name: Mapped[str] = mapped_column(String(64), index=True)
    event_context: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class AutopilotDecision(Base):
    __tablename__ = "autopilot_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    decision_kind: Mapped[str] = mapped_column(String(40), default="trip")
    recommendation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    selected_option: Mapped[str] = mapped_column(String(80))
    delta_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class LinkedRecipeSource(Base):
    """Only GHM-authored metadata + verified outbound link; no third-party recipe content."""
    __tablename__ = "linked_recipe_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    cuisine: Mapped[str] = mapped_column(String(80), index=True)
    meal_kind: Mapped[str] = mapped_column(String(32), default="proper")
    ghm_recipe_id: Mapped[str] = mapped_column(String(100), index=True)
    source_name: Mapped[str] = mapped_column(String(100), default="Dassana's Veg Recipes")
    source_url: Mapped[str] = mapped_column(Text)
    video_on_source: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CommunityRecipe(Base):
    __tablename__ = "community_recipes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    base_servings: Mapped[int] = mapped_column(Integer, default=4)
    meal_kind: Mapped[str] = mapped_column(String(32), default="proper", index=True)
    cuisine: Mapped[str] = mapped_column(String(80), default="International", index=True)
    categories_json: Mapped[str] = mapped_column(Text, default="[]")
    diets_json: Mapped[str] = mapped_column(Text, default="[]")
    ingredients_json: Mapped[str] = mapped_column(Text, default="[]")
    steps_json: Mapped[str] = mapped_column(Text, default="[]")
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, index=True)

    owner: Mapped[User] = relationship(back_populates="community_recipes")


class SiteReview(Base):
    __tablename__ = "site_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    rating: Mapped[int] = mapped_column(Integer, default=5, index=True)
    comment: Mapped[str] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    admin_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    admin_replied_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user: Mapped[User | None] = relationship(back_populates="reviews", foreign_keys=[user_id])


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    message: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # V113 house-chat context. These are deliberately lightweight snapshots so a
    # shared recipe/list/place still makes sense if the source item later changes.
    reply_to_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    attachment_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    attachment_title: Mapped[str | None] = mapped_column(String(180), nullable=True)
    attachment_subtitle: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    house: Mapped[House] = relationship(back_populates="activities")
    user: Mapped[User | None] = relationship(back_populates="activities")


class HouseMessageReaction(Base):
    __tablename__ = "house_message_reactions"
    __table_args__ = (UniqueConstraint("activity_id", "user_id", "emoji", name="uq_house_message_reaction"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class AdminUserOffer(Base):
    __tablename__ = "admin_user_offers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_general: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    offer_kind: Mapped[str] = mapped_column(String(40), index=True)  # discount, free_plan_access, or general
    plan_name: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)  # null = universal discount / announcement
    title: Mapped[str] = mapped_column(String(180))
    occasion: Mapped[str | None] = mapped_column(String(180), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    discount_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stripe_coupon_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_promotion_code_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_promotion_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    stripe_duration: Mapped[str | None] = mapped_column(String(40), nullable=True)  # once, repeating, forever
    duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    access_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    access_lifetime: Mapped[bool] = mapped_column(Boolean, default=False)
    use_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User | None] = relationship(foreign_keys=[user_id])
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])

class HouseholdTemplate(Base):
    __tablename__ = "household_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    template_type: Mapped[str] = mapped_column(String(40), default="shopping", index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    items_json: Mapped[str] = mapped_column(Text, default="[]")
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    uses_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    owner: Mapped[User] = relationship()


class OwnerProviderBudget(Base):
    """New provider executions across ALL houses of one subscription owner."""
    __tablename__ = "owner_provider_budget"
    __table_args__ = (UniqueConstraint("owner_id", "period_key", name="uq_owner_provider_budget_period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    period_key: Mapped[str] = mapped_column(String(24), index=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class HouseCreditBalance(Base):
    __tablename__ = "house_credit_balances"
    __table_args__ = (UniqueConstraint("house_id", "feature_key", name="uq_house_credit_feature"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    feature_key: Mapped[str] = mapped_column(String(40), index=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class HouseCreditEvent(Base):
    """Auditable purchase/spend ledger. Purchase ID guards against duplicate Stripe events."""
    __tablename__ = "house_credit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    feature_key: Mapped[str] = mapped_column(String(40), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(30))
    pack_key: Mapped[str | None] = mapped_column(String(65), nullable=True)
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class HouseCreditPolicy(Base):
    __tablename__ = "house_credit_policies"
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id", ondelete="CASCADE"), primary_key=True)
    members_can_spend: Mapped[bool] = mapped_column(Boolean, default=True)


class CreditWalletBalance(Base):
    """Closed-loop service credits; not money and not withdrawable."""
    __tablename__ = "credit_wallet_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(12), index=True)  # user | house
    owner_id: Mapped[int] = mapped_column(Integer, index=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint("owner_type", "owner_id", name="uq_credit_wallet_owner"),)


class CreditWalletEvent(Base):
    """Append-only personal and house credit activity. Transfer events share transfer_key."""
    __tablename__ = "credit_wallet_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(12), index=True)
    owner_id: Mapped[int] = mapped_column(Integer, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(35), index=True)
    target_house_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    service_pack_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    transfer_key: Mapped[str | None] = mapped_column(String(65), nullable=True)
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class GhmCreditPackPricing(Base):
    """Admin-controlled, versioned-at-checkout pricing for prepaid GHM tokens and service exchanges."""
    __tablename__ = "ghm_credit_pack_pricing"
    pack_key: Mapped[str] = mapped_column(String(80), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)  # CAD token checkout packages
    exchange_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)  # service redemption in tokens
    provider_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)  # estimated cost for WHOLE pack
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AdminOfferEmailEvent(Base):
    __tablename__ = "admin_offer_email_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("admin_user_offers.id", ondelete="SET NULL"), nullable=True)
    sender_role: Mapped[str] = mapped_column(String(35))
    subject: Mapped[str] = mapped_column(String(240))
    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MarketingOptOut(Base):
    __tablename__ = 'marketing_opt_out'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    opted_out: Mapped[bool] = mapped_column(Boolean,default=True)


class GuideArticle(Base):
    """Published public GHM guides, editable without frontend deployments."""
    __tablename__ = "guide_articles"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(130), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(String(320), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="Household guides")
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class MerchCatalogProduct(Base):
    """Admin-editable catalog; old orders store immutable product snapshots."""
    __tablename__ = 'merch_catalog_products'
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(80), default='Other')
    description: Mapped[str] = mapped_column(Text, default='')
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_cents_cad: Mapped[int] = mapped_column(Integer, default=0)
    printkk_design_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MerchOrder(Base):
    """Immutable financial snapshots with explicit customer/supplier lifecycles."""
    __tablename__ = 'merch_orders'
    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    client_key: Mapped[str] = mapped_column(String(100))
    cart_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(40), default='awaiting_payment', index=True)
    customer_name: Mapped[str] = mapped_column(String(180))
    customer_email: Mapped[str] = mapped_column(String(255))
    shipping_address_json: Mapped[str] = mapped_column(Text)
    items_json: Mapped[str] = mapped_column(Text)
    subtotal_cents: Mapped[int] = mapped_column(Integer)
    shipping_cents: Mapped[int] = mapped_column(Integer)
    tax_cents: Mapped[int] = mapped_column(Integer)
    total_cents: Mapped[int] = mapped_column(Integer)
    tokens_reserved: Mapped[int] = mapped_column(Integer, default=0)
    tokens_refunded: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_due_cents: Mapped[int] = mapped_column(Integer, default=0)
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    stripe_checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    stripe_refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    printkk_order_id: Mapped[str | None] = mapped_column(String(140), unique=True, nullable=True)
    provider_stage: Mapped[str] = mapped_column(String(40), default='not_submitted')
    provider_status: Mapped[str | None] = mapped_column(String(70), nullable=True)
    provider_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    support_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    __table_args__ = (UniqueConstraint('user_id','client_key', name='uq_merch_user_checkout_key'),)


class MerchOrderEvent(Base):
    __tablename__ = 'merch_order_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey('merch_orders.id',ondelete='CASCADE'), index=True)
    event_key: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class FestivalMealRule(Base):
    """Dates are curated, not guessed from a lunar calendar; admin can revise without deploy."""
    __tablename__ = 'festival_meal_rules'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(140))
    festival_date: Mapped[date] = mapped_column(Date, index=True)
    region: Mapped[str] = mapped_column(String(120), default='Gujarati / Indian')
    dishes_json: Mapped[str] = mapped_column(Text, default='[]')
    reminder_days: Mapped[int] = mapped_column(Integer, default=7)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
