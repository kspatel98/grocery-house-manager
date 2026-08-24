from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field
from app.models import HouseRole, ShoppingItemStatus, PlanName


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    avatar_url: str | None = None
    country: str | None = None
    city: str | None = None
    currency_code: str = "CAD"

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
    country: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    country: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)


class RegisterRequestOut(BaseModel):
    ok: bool = True
    message: str
    debug_code: str | None = None


class RegisterConfirmIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginIn(BaseModel):
    credential: str


class PasswordChangeIn(BaseModel):
    old_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequestIn(BaseModel):
    email: EmailStr


class ForgotPasswordRequestOut(BaseModel):
    ok: bool = True
    message: str
    # Only returned in non-production when SMTP is not configured, so local testing is possible.
    debug_code: str | None = None


class ForgotPasswordVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ForgotPasswordVerifyOut(BaseModel):
    verified: bool
    message: str


class ForgotPasswordResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class HouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class HouseOut(BaseModel):
    id: int
    name: str
    role: HouseRole | None = None
    owner_name: str | None = None
    owner_plan_name: PlanName | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseMemberOut(BaseModel):
    id: int
    user_id: int
    full_name: str | None = None
    # Hidden from regular house members for privacy. Admin dashboard has its own user controls.
    email: EmailStr | None = None
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


class ProductStorePriceOut(BaseModel):
    id: int
    store_name: str
    price: float
    source: str = "manual"
    recorded_at: datetime

    model_config = {"from_attributes": True}


class ProductOut(ProductBase):
    id: int
    house_id: int
    section_id: int
    section_name: str | None = None
    created_at: datetime
    updated_at: datetime
    is_low_stock: bool = False
    is_out_of_stock: bool = False
    is_expiring_soon: bool = False
    is_expired: bool = False
    stock_status: str = "in_stock"
    store_prices: list[ProductStorePriceOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ShoppingListItemCreate(BaseModel):
    product_id: int
    requested_quantity: float = Field(default=1, gt=0)
    bought_quantity: float | None = Field(default=None, gt=0)
    bought_price: float | None = Field(default=None, ge=0)
    bought_store_name: str | None = Field(default=None, max_length=150)
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
    bought_price: float | None = Field(default=None, ge=0)
    bought_store_name: str | None = Field(default=None, max_length=150)
    message: str | None = None
    status: ShoppingItemStatus | None = None


class ShoppingListItemStatusUpdate(BaseModel):
    status: ShoppingItemStatus


class ShoppingListItemOut(BaseModel):
    id: int
    product_id: int
    requested_quantity: float
    bought_quantity: float
    bought_price: float | None = None
    bought_store_name: str | None = None
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
    receipt_scans_per_month: int = 0


class PlanOut(BaseModel):
    key: PlanName
    name: str
    price_monthly_cad: float
    price_annual_cad: float | None = None
    regular_price_monthly_cad: float | None = None
    discount_percent: int | None = None
    discount_label: str | None = None
    tagline: str
    limits: PlanLimitsOut
    features: list[str]
    recommended: bool = False


class NewUserOfferOut(BaseModel):
    active: bool
    applies_to_plan: PlanName = PlanName.basic
    discount_percent: int = 65
    duration_months: int = 2
    eligible_until: datetime | None = None
    message: str


class SubscriptionOut(BaseModel):
    plan_name: PlanName
    subscription_status: str
    current_period_end: datetime | None = None
    limits: PlanLimitsOut
    usage: dict[str, int | dict[str, int]] = Field(default_factory=dict)
    new_user_offer: NewUserOfferOut | None = None


class BillingRenewalOut(BaseModel):
    billing_source: str
    plan_name: PlanName
    current_period_end: datetime | None = None
    auto_renews: bool = False
    next_payment_at: datetime | None = None
    next_payment_amount: float | None = None
    currency: str | None = None
    message: str


class ReceiptScanPackOut(BaseModel):
    key: str
    name: str
    scan_count: int
    price_cad: float
    description: str


class ReceiptScanPackCheckoutIn(BaseModel):
    pack_key: str


class CheckoutSessionIn(BaseModel):
    plan_name: PlanName
    promotion_code_id: str | None = None
    billing_cycle: Literal["monthly", "annual"] = "monthly"


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


class ReceiptLineCreate(BaseModel):
    product_id: int
    price: float = Field(ge=0)
    store_name: str | None = Field(default=None, max_length=150)


class ReceiptCreate(BaseModel):
    store_name: str | None = Field(default=None, max_length=150)
    receipt_date: date | None = None
    image_url: str | None = None
    notes: str | None = None
    items: list[ReceiptLineCreate] = Field(default_factory=list)


class ReceiptLineItemOut(BaseModel):
    id: int
    line_type: str = "product"
    description: str
    normalized_name: str | None = None
    sku: str | None = None
    upc: str | None = None
    quantity: float | None = None
    line_unit: str | None = None
    unit_price: float | None = None
    discount_amount: float | None = None
    tax_amount: float | None = None
    line_total: float | None = None
    confidence: float | None = None
    needs_review: bool = True
    is_selected: bool = True
    matched_product_id: int | None = None
    matched_product_name: str | None = None
    inventory_applied: bool = False
    inventory_quantity_applied: float | None = None
    inventory_unit_applied: str | None = None
    created_product_from_receipt: bool = False


class ReceiptOut(BaseModel):
    id: int
    house_id: int
    store_name: str | None = None
    receipt_date: date | None = None
    image_url: str | None = None
    notes: str | None = None
    ocr_provider: str | None = None
    ocr_status: str = "manual"
    ocr_confidence: float | None = None
    currency: str | None = None
    subtotal_amount: float | None = None
    tax_amount: float | None = None
    discount_amount: float | None = None
    total_amount: float | None = None
    receipt_number: str | None = None
    payment_method: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    uploaded_by: UserOut | None = None
    price_entries: list[ProductStorePriceOut] = Field(default_factory=list)
    line_items: list[ReceiptLineItemOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ReceiptParsedLineOut(BaseModel):
    raw_text: str
    line_item_id: int | None = None
    product_name: str | None = None
    matched_product_id: int | None = None
    matched_product_name: str | None = None
    quantity: float | None = None
    line_unit: str | None = None
    unit_price: float | None = None
    price: float | None = None
    discount_amount: float | None = None
    confidence: float | None = None
    line_type: str = "product"
    needs_review: bool = True
    applied: bool = False


class ReceiptScanUsageOut(BaseModel):
    used: int = 0
    limit: int = 0
    remaining: int = 0
    plan_name: str
    plan_key: PlanName
    month_label: str
    allowed: bool = False
    is_last_available: bool = False
    quota_scope: str
    quota_owner_id: int | None = None
    quota_owner_name: str | None = None
    message: str
    service_capacity_available: bool = True
    extra_credits: int = 0
    will_use_extra_credit: bool = False
    can_buy_extra_scans: bool = True


class ReceiptUploadOut(BaseModel):
    receipt: ReceiptOut
    usage: ReceiptScanUsageOut | None = None
    extracted_text: str | None = None
    parsed_lines: list[ReceiptParsedLineOut] = Field(default_factory=list)
    matched_count: int = 0
    message: str
    scan_status: str = "review_ready"


class ReceiptDeleteOut(BaseModel):
    ok: bool = True
    message: str
    inventory_adjusted: int = 0
    products_deleted: int = 0
    prices_deleted: int = 0


class ReceiptReviewLineIn(BaseModel):
    id: int | None = None
    description: str = Field(min_length=1, max_length=500)
    product_id: int | None = None
    quantity: float | None = Field(default=None, ge=0)
    line_unit: str | None = Field(default=None, max_length=32)
    unit_price: float | None = Field(default=None, ge=0)
    line_total: float | None = Field(default=None, ge=0)
    discount_amount: float | None = Field(default=None, ge=0)
    tax_amount: float | None = Field(default=None, ge=0)
    line_type: str = Field(default="product", max_length=50)
    is_selected: bool = True
    update_inventory: bool = True
    create_product: bool = False
    new_product_name: str | None = Field(default=None, max_length=180)
    new_product_section_id: int | None = None
    new_product_unit: str | None = Field(default=None, max_length=32)
    new_product_quantity: float | None = Field(default=None, ge=0)


class ReceiptReviewSaveIn(BaseModel):
    store_name: str | None = Field(default=None, max_length=150)
    receipt_date: date | None = None
    receipt_number: str | None = Field(default=None, max_length=120)
    payment_method: str | None = Field(default=None, max_length=120)
    subtotal_amount: float | None = Field(default=None, ge=0)
    tax_amount: float | None = Field(default=None, ge=0)
    discount_amount: float | None = Field(default=None, ge=0)
    total_amount: float | None = Field(default=None, ge=0)
    notes: str | None = None
    items: list[ReceiptReviewLineIn] = Field(default_factory=list)


class PersonalInsightsOut(BaseModel):
    plan_name: PlanName
    receipts_uploaded: int = 0
    prices_recorded: int = 0
    stores_tracked: int = 0
    estimated_personal_spend: float = 0
    premium_tools: list[str] = Field(default_factory=list)


class AccountDeleteIn(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=255)




class AccountDeletePreviewOut(BaseModel):
    can_delete: bool
    blocked_shared_houses: list[str] = Field(default_factory=list)
    solo_owned_houses: list[str] = Field(default_factory=list)
    message: str


class PremiumCrownStatsOut(BaseModel):
    total_users: int = 0
    crown_users: int = 0


class AccountBootstrapOut(BaseModel):
    user: UserProfileOut
    subscription: SubscriptionOut
    insights: PersonalInsightsOut
    houses: list[HouseOut] = Field(default_factory=list)
    premium_crown_stats: PremiumCrownStatsOut = Field(default_factory=PremiumCrownStatsOut)
    is_admin: bool = False

class OnboardingStepOut(BaseModel):
    key: str
    title: str
    description: str
    complete: bool = False
    href: str | None = None


class OnboardingStatusOut(BaseModel):
    complete: bool = False
    completed_steps: int = 0
    total_steps: int = 5
    percent: int = 0
    primary_house_id: int | None = None
    steps: list[OnboardingStepOut] = Field(default_factory=list)


class SavingsSummaryOut(BaseModel):
    currency_code: str = "CAD"
    month_label: str
    tracked_spend: float = 0
    receipt_discounts: float = 0
    lower_price_choices: float = 0
    estimated_savings: float = 0
    plan_monthly_cost: float = 0
    savings_after_plan_cost: float = 0
    roi_multiple: float | None = None
    comparison_opportunities: int = 0
    message: str


class BasketStoreOptionOut(BaseModel):
    store_name: str
    estimated_total: float = 0
    priced_items: int = 0
    total_items: int = 0
    coverage_percent: int = 0
    missing_items: list[str] = Field(default_factory=list)


class BasketComparisonOut(BaseModel):
    currency_code: str = "CAD"
    premium_required: bool = False
    message: str
    list_id: int
    list_title: str
    total_items: int = 0
    best_single_store: BasketStoreOptionOut | None = None
    store_options: list[BasketStoreOptionOut] = Field(default_factory=list)
    split_store_total: float | None = None
    split_store_savings: float | None = None
    split_store_names: list[str] = Field(default_factory=list)
    split_store_coverage_percent: int = 0
    split_store_picks: list[str] = Field(default_factory=list)


class WeeklyAssistantRecipeOut(BaseModel):
    name: str
    reason: str
    matched_items: list[str] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)


class WeeklyAssistantSuggestedItemOut(BaseModel):
    product_id: int
    product_name: str
    reason: str
    requested_quantity: float = 1


class WeeklyAssistantOut(BaseModel):
    currency_code: str = "CAD"
    house_id: int
    house_name: str
    generated_at: datetime
    low_stock: list[str] = Field(default_factory=list)
    out_of_stock: list[str] = Field(default_factory=list)
    expiring_soon: list[str] = Field(default_factory=list)
    expired: list[str] = Field(default_factory=list)
    long_held: list[str] = Field(default_factory=list)
    suggested_missing: list[str] = Field(default_factory=list)
    suggested_items: list[WeeklyAssistantSuggestedItemOut] = Field(default_factory=list)
    active_list_id: int | None = None
    active_list_title: str | None = None
    active_list_items: int = 0
    best_store_name: str | None = None
    best_store_total: float | None = None
    alternative_store_name: str | None = None
    alternative_store_total: float | None = None
    potential_store_savings: float | None = None
    monthly_savings: float = 0
    recipes: list[WeeklyAssistantRecipeOut] = Field(default_factory=list)
    message: str


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
    blocked_by_new_user_offer: bool = False
    available_after: datetime | None = None


class AdminSummaryOut(BaseModel):
    total_users: int
    paid_or_granted_users: int
    total_houses: int
    total_products: int
    total_receipts: int
    users_by_plan: dict[str, int] = Field(default_factory=dict)


class AdminUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    country: str | None = None
    city: str | None = None
    currency_code: str = "CAD"
    plan_name: PlanName
    subscription_status: str
    created_at: datetime
    houses_owned: int = 0
    memberships: int = 0
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None


class AdminPlanAssignIn(BaseModel):
    plan_name: PlanName
    reason: str | None = Field(default=None, max_length=240)


class AdminEmailTestIn(BaseModel):
    email: EmailStr


class AdminEmailStatusOut(BaseModel):
    email_configured: bool = False
    provider: str = "smtp"
    smtp_configured: bool = False
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_from_email: EmailStr | None = None
    smtp_username: str | None = None
    smtp_use_tls: bool = True
    smtp_force_ipv4: bool = True
    resend_configured: bool = False
    resend_from_email: EmailStr | None = None
    missing_settings: list[str] = []
    message: str


class AdminActionOut(BaseModel):
    ok: bool
    message: str


class AdminRefundIn(BaseModel):
    confirm: bool = False
    amount_cents: int | None = Field(default=None, ge=1)
    reason: str | None = Field(default=None, max_length=240)


class NearbyStoreOut(BaseModel):
    name: str
    address: str | None = None
    rating: float | None = None
    user_ratings_total: int | None = None
    maps_url: str | None = None
    source: str = "fallback"


class ShoppingItemSuggestionOut(BaseModel):
    product_id: int
    product_name: str
    requested_quantity: float
    current_store: str | None = None
    current_price: float | None = None
    best_known_store: str | None = None
    best_known_price: float | None = None
    best_known_source: str | None = None
    best_known_recorded_at: datetime | None = None
    freshness_label: str | None = None
    savings_vs_current: float | None = None
    message: str


class ShoppingSuggestionsOut(BaseModel):
    currency_code: str = "CAD"
    location_label: str | None = None
    premium_required: bool = False
    message: str
    nearby_stores: list[NearbyStoreOut] = Field(default_factory=list)
    item_suggestions: list[ShoppingItemSuggestionOut] = Field(default_factory=list)



class ProductLookupResultOut(BaseModel):
    source: str = "open_food_facts"
    barcode: str | None = None
    name: str
    brand: str | None = None
    image_url: str | None = None
    categories: list[str] = Field(default_factory=list)
    nutrition_grade: str | None = None
    quantity: str | None = None
    store_name: str | None = None
    product_url: str | None = None
    price: float | None = None
    lookup_note: str | None = None
    found: bool = True


class ProductLookupOut(BaseModel):
    premium_required: bool = False
    configured: bool = True
    store_filter: str | None = None
    message: str
    lookup_status: str | None = None
    lookup_details: list[str] = Field(default_factory=list)
    results: list[ProductLookupResultOut] = Field(default_factory=list)


class PriceCompareIn(BaseModel):
    items: list[str] = Field(default_factory=list, max_length=20)
    product_ids: list[int] = Field(default_factory=list, max_length=20)
    location: str | None = Field(default=None, max_length=180)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=80)
    postal_code: str | None = Field(default=None, max_length=20)
    lat: float | None = None
    lng: float | None = None
    retailers: list[str] = Field(default_factory=list, max_length=8)
    force_refresh: bool = False


class LivePriceResultOut(BaseModel):
    item: str
    retailer: str | None = None
    banner: str | None = None
    store_name: str | None = None
    store_address: str | None = None
    store_url: str | None = None
    matched_product_name: str | None = None
    brand: str | None = None
    price: float | None = None
    sale_price: float | None = None
    unit_price: str | None = None
    package_size: str | None = None
    availability: str | None = None
    is_on_sale: bool | None = None
    match_confidence: str | None = None
    confidence_explanation: str | None = None
    source_url: str | None = None
    scraped_at: datetime | None = None
    raw_source: str = "apify_canada"


class LivePriceCompareOut(BaseModel):
    premium_required: bool = False
    configured: bool = False
    cached: bool = False
    currency_code: str = "CAD"
    location_label: str | None = None
    source: str = "apify_canada"
    connection_status: str = "not_connected"
    failure_reason: str | None = None
    used_fallback: bool = False
    message: str
    supported_retailers: list[str] = Field(default_factory=list)
    results: list[LivePriceResultOut] = Field(default_factory=list)


class MarketCapabilitiesOut(BaseModel):
    product_lookup_available: bool
    live_price_compare_available: bool
    apify_configured: bool
    live_price_status: str = "not_connected"
    supported_retailers: list[str] = Field(default_factory=list)
    message: str

class SiteReviewCreateIn(BaseModel):
    rating: int = Field(default=5, ge=1, le=5)
    comment: str = Field(min_length=8, max_length=700)
    is_public: bool = True


class SiteReviewOut(BaseModel):
    id: int
    user_id: int | None = None
    rating: int
    comment: str
    is_public: bool = True
    created_at: datetime
    updated_at: datetime | None = None
    user_name: str | None = None
    user_avatar_url: str | None = None
    can_edit: bool = False


class SiteReviewSummaryOut(BaseModel):
    total_users: int = 0
    new_users_this_month: int = 0
    average_rating: float = 0
    review_count: int = 0
    best_positive_comment: str | None = None
    best_reviewer_name: str | None = None
    best_rating: int | None = None


class AdminOfferCreateIn(BaseModel):
    user_id: int | None = None
    is_general: bool = False
    offer_kind: str = Field(pattern="^(discount|free_plan_access|general)$")
    plan_name: PlanName | None = None  # null means universal discount; required for free plan access
    title: str | None = Field(default=None, max_length=180)
    occasion: str | None = Field(default=None, max_length=180)
    message: str | None = Field(default=None, max_length=700)
    discount_percent: int | None = Field(default=None, ge=1, le=100)
    stripe_duration: str | None = Field(default="once", pattern="^(once|repeating|forever)$")
    duration_months: int | None = Field(default=None, ge=1, le=36)
    access_duration_days: int | None = Field(default=None, ge=1, le=3650)
    access_lifetime: bool = False
    use_limit: int | None = Field(default=1, ge=1, le=9999)
    expires_in_days: int = Field(default=7, ge=1, le=365)


class AdminOfferAcceptIn(BaseModel):
    plan_name: PlanName | None = None


class AdminOfferOut(BaseModel):
    id: int
    user_id: int | None = None
    user_email: str | None = None
    user_name: str | None = None
    is_general: bool = False
    offer_kind: str
    plan_name: str | None = None
    plan_label: str | None = None
    title: str
    occasion: str | None = None
    message: str | None = None
    discount_percent: int | None = None
    stripe_duration: str | None = None
    duration_months: int | None = None
    access_duration_days: int | None = None
    access_lifetime: bool = False
    use_limit: int | None = None
    status: str
    expires_at: datetime
    accepted_at: datetime | None = None
    declined_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime
    stripe_promotion_code: str | None = None
    universal: bool = False
    can_accept: bool = False
    checkout_url: str | None = None
    summary: str


class AdminOfferActionOut(BaseModel):
    ok: bool = True
    message: str
    checkout_url: str | None = None
    offer: AdminOfferOut | None = None
