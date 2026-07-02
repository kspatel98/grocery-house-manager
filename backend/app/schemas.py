from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field
from app.models import HouseRole, ShoppingItemStatus, PlanName


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class UserProfileOut(UserOut):
    auth_provider: str
    created_at: datetime
    plan_name: str = "free"
    subscription_status: str = "free"
    subscription_current_period_end: datetime | None = None


class UserProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    avatar_url: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginIn(BaseModel):
    credential: str


class HouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class HouseOut(BaseModel):
    id: int
    name: str
    role: HouseRole | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseMemberOut(BaseModel):
    id: int
    user_id: int
    full_name: str | None = None
    email: EmailStr
    avatar_url: str | None = None
    role: HouseRole
    joined_at: datetime


class ActivityOut(BaseModel):
    id: int
    house_id: int
    action: str
    message: str
    entity_type: str | None = None
    entity_id: int | None = None
    created_at: datetime
    user: UserOut | None = None

    model_config = {"from_attributes": True}


class InviteOut(BaseModel):
    token: str
    join_url: str
    expires_at: datetime | None = None


class SectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=64)
    sort_order: int = 0


class SectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=64)
    sort_order: int | None = None


class SectionOut(BaseModel):
    id: int
    house_id: int
    name: str
    icon: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    image_url: str | None = None
    icon: str | None = Field(default=None, max_length=64)
    quantity: float = 0
    unit: str = Field(default="pcs", max_length=32)
    price: float | None = None
    store_name: str | None = Field(default=None, max_length=150)
    brand: str | None = Field(default=None, max_length=120)
    barcode: str | None = Field(default=None, max_length=120)
    expiry_date: date | None = None
    low_stock_threshold: float | None = None
    notes: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    section_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=180)
    image_url: str | None = None
    icon: str | None = Field(default=None, max_length=64)
    quantity: float | None = None
    unit: str | None = Field(default=None, max_length=32)
    price: float | None = None
    store_name: str | None = Field(default=None, max_length=150)
    brand: str | None = Field(default=None, max_length=120)
    barcode: str | None = Field(default=None, max_length=120)
    expiry_date: date | None = None
    low_stock_threshold: float | None = None
    notes: str | None = None


class ProductOut(ProductBase):
    id: int
    house_id: int
    section_id: int
    section_name: str | None = None
    created_at: datetime
    updated_at: datetime
    is_low_stock: bool = False
    is_expiring_soon: bool = False

    model_config = {"from_attributes": True}


class ShoppingListItemCreate(BaseModel):
    product_id: int
    requested_quantity: float = Field(default=1, gt=0)
    bought_quantity: float | None = Field(default=None, gt=0)
    message: str | None = None


class ShoppingListCreate(BaseModel):
    title: str = Field(default="Grocery List", max_length=180)
    items: list[ShoppingListItemCreate]


class ShoppingListUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)


class ShoppingListItemsAdd(BaseModel):
    items: list[ShoppingListItemCreate]


class ShoppingListItemUpdate(BaseModel):
    requested_quantity: float | None = Field(default=None, gt=0)
    bought_quantity: float | None = Field(default=None, gt=0)
    message: str | None = None
    status: ShoppingItemStatus | None = None


class ShoppingListItemStatusUpdate(BaseModel):
    status: ShoppingItemStatus


class ShoppingListItemOut(BaseModel):
    id: int
    product_id: int
    requested_quantity: float
    bought_quantity: float
    message: str | None = None
    status: ShoppingItemStatus
    product: ProductOut

    model_config = {"from_attributes": True}


class ShoppingListOut(BaseModel):
    id: int
    house_id: int
    title: str
    is_done: bool
    created_at: datetime
    completed_at: datetime | None = None
    items: list[ShoppingListItemOut]

    model_config = {"from_attributes": True}


class ShoppingDoneIn(BaseModel):
    confirm: bool


class PlanLimitsOut(BaseModel):
    houses: int
    products_per_house: int
    active_lists_per_house: int
    members_per_house: int


class PlanOut(BaseModel):
    key: PlanName
    name: str
    price_monthly_cad: float
    regular_price_monthly_cad: float | None = None
    discount_percent: int | None = None
    discount_label: str | None = None
    tagline: str
    limits: PlanLimitsOut
    features: list[str]
    recommended: bool = False


class SubscriptionOut(BaseModel):
    plan_name: PlanName
    subscription_status: str
    current_period_end: datetime | None = None
    limits: PlanLimitsOut
    usage: dict[str, int | dict[str, int]] = Field(default_factory=dict)


class CheckoutSessionIn(BaseModel):
    plan_name: PlanName
    promotion_code_id: str | None = None


class CheckoutSessionOut(BaseModel):
    checkout_url: str


class InvitePreviewOut(BaseModel):
    token: str
    house_id: int
    house_name: str
    inviter_name: str
    inviter_email: EmailStr | None = None
    expires_at: datetime | None = None
    already_member: bool = False


class AccountDeleteIn(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=255)


class CouponValidateIn(BaseModel):
    code: str = Field(min_length=1, max_length=80)


class CouponValidateOut(BaseModel):
    valid: bool
    message: str
    promotion_code_id: str | None = None
    coupon_name: str | None = None
    percent_off: float | None = None
    amount_off: float | None = None
    currency: str | None = None
    discounted_prices: dict[str, float] = Field(default_factory=dict)
