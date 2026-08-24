export type User = {
  id: number;
  email: string;
  full_name?: string;
  avatar_url?: string;
  country?: string;
  city?: string;
  currency_code?: string;
};

export type UserProfile = User & {
  auth_provider: string;
  created_at: string;
  plan_name?: PlanName;
  subscription_status?: string;
  subscription_current_period_end?: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type House = {
  id: number;
  name: string;
  role?: 'owner' | 'admin' | 'member';
  owner_name?: string;
  owner_plan_name?: PlanName;
  created_at: string;
};

export type Section = {
  id: number;
  house_id: number;
  name: string;
  icon?: string;
  sort_order: number;
};

export type ProductStorePrice = {
  id: number;
  store_name: string;
  price: number;
  source: string;
  recorded_at: string;
};

export type Product = {
  id: number;
  house_id: number;
  section_id: number;
  section_name?: string;
  name: string;
  image_url?: string;
  icon?: string;
  quantity: number;
  unit: string;
  price?: number;
  store_name?: string;
  brand?: string;
  barcode?: string;
  expiry_date?: string;
  low_stock_threshold?: number;
  notes?: string;
  is_low_stock: boolean;
  is_out_of_stock?: boolean;
  is_expiring_soon: boolean;
  is_expired?: boolean;
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired';
  created_at: string;
  updated_at: string;
  store_prices?: ProductStorePrice[];
};

export type ShoppingItemStatus = 'to_buy' | 'in_cart' | 'skipped';

export type ShoppingListItem = {
  id: number;
  product_id: number;
  requested_quantity: number;
  bought_quantity: number;
  message?: string;
  bought_price?: number;
  bought_store_name?: string;
  status: ShoppingItemStatus;
  product: Product;
};

export type ShoppingList = {
  id: number;
  house_id: number;
  title: string;
  is_done: boolean;
  created_at: string;
  completed_at?: string;
  items: ShoppingListItem[];
};


export type HouseMember = {
  id: number;
  user_id: number;
  full_name?: string;
  email?: string | null;
  avatar_url?: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
};

export type Activity = {
  id: number;
  house_id: number;
  action: string;
  message: string;
  entity_type?: string;
  entity_id?: number;
  created_at: string;
  user?: User;
};

export type PlanName = 'free' | 'basic' | 'family' | 'pro';

export type PlanLimits = {
  houses: number;
  products_per_house: number;
  active_lists_per_house: number;
  members_per_house: number;
  receipt_scans_per_month: number;
};

export type Plan = {
  key: PlanName;
  name: string;
  price_monthly_cad: number;
  price_annual_cad?: number | null;
  regular_price_monthly_cad?: number | null;
  discount_percent?: number | null;
  discount_label?: string | null;
  tagline: string;
  limits: PlanLimits;
  features: string[];
  recommended: boolean;
};

export type Subscription = {
  plan_name: PlanName;
  subscription_status: string;
  current_period_end?: string;
  limits: PlanLimits;
  usage: Record<string, number | Record<string, number>>;
  new_user_offer?: NewUserOffer;
};

export type BillingRenewalDetails = {
  billing_source: 'stripe' | 'admin_granted' | 'none';
  plan_name: PlanName;
  current_period_end?: string | null;
  auto_renews: boolean;
  next_payment_at?: string | null;
  next_payment_amount?: number | null;
  currency?: string | null;
  message: string;
};


export type InvitePreview = {
  token: string;
  house_id: number;
  house_name: string;
  inviter_name: string;
  inviter_email?: string;
  expires_at?: string;
  already_member: boolean;
};

export type CouponValidation = {
  valid: boolean;
  message: string;
  promotion_code_id?: string;
  coupon_name?: string;
  percent_off?: number;
  amount_off?: number;
  currency?: string;
  discounted_prices?: Partial<Record<PlanName, number>>;
  blocked_by_new_user_offer?: boolean;
  available_after?: string;
};


export type ReceiptLineItem = {
  id: number;
  line_type: string;
  description: string;
  normalized_name?: string | null;
  sku?: string | null;
  upc?: string | null;
  quantity?: number | null;
  line_unit?: string | null;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total?: number | null;
  confidence?: number | null;
  needs_review: boolean;
  is_selected: boolean;
  matched_product_id?: number | null;
  matched_product_name?: string | null;
  inventory_applied?: boolean;
  inventory_quantity_applied?: number | null;
  inventory_unit_applied?: string | null;
  created_product_from_receipt?: boolean;
};

export type Receipt = {
  id: number;
  house_id: number;
  store_name?: string;
  receipt_date?: string;
  image_url?: string;
  notes?: string;
  ocr_provider?: string | null;
  ocr_status: string;
  ocr_confidence?: number | null;
  currency?: string | null;
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  total_amount?: number | null;
  receipt_number?: string | null;
  payment_method?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  uploaded_by?: User;
  price_entries: ProductStorePrice[];
  line_items: ReceiptLineItem[];
};

export type NewUserOffer = {
  active: boolean;
  applies_to_plan: PlanName;
  discount_percent: number;
  duration_months: number;
  eligible_until?: string;
  message: string;
};

export type ReceiptParsedLine = {
  raw_text: string;
  line_item_id?: number | null;
  product_name?: string | null;
  matched_product_id?: number | null;
  matched_product_name?: string | null;
  quantity?: number | null;
  line_unit?: string | null;
  unit_price?: number | null;
  price?: number | null;
  discount_amount?: number | null;
  confidence?: number | null;
  line_type: string;
  needs_review: boolean;
  applied: boolean;
};

export type ReceiptScanUsage = {
  used: number;
  limit: number;
  remaining: number;
  plan_name: string;
  plan_key: PlanName;
  month_label: string;
  allowed: boolean;
  is_last_available: boolean;
  quota_scope: string;
  quota_owner_id?: number | null;
  quota_owner_name?: string | null;
  message: string;
  service_capacity_available: boolean;
  extra_credits: number;
  will_use_extra_credit: boolean;
  can_buy_extra_scans: boolean;
};

export type ReceiptUploadResult = {
  receipt: Receipt;
  usage?: ReceiptScanUsage | null;
  extracted_text?: string | null;
  parsed_lines: ReceiptParsedLine[];
  matched_count: number;
  message: string;
  scan_status: string;
};

export type PersonalInsights = {
  plan_name: PlanName;
  receipts_uploaded: number;
  prices_recorded: number;
  stores_tracked: number;
  estimated_personal_spend: number;
  premium_tools: string[];
};


export type AccountDeletePreview = {
  can_delete: boolean;
  blocked_shared_houses: string[];
  solo_owned_houses: string[];
  message: string;
};

export type PremiumCrownStats = {
  total_users: number;
  crown_users: number;
};

export type AccountBootstrap = {
  user: UserProfile;
  subscription: Subscription;
  insights: PersonalInsights;
  houses: House[];
  premium_crown_stats?: PremiumCrownStats;
  is_admin?: boolean;
};


export type AdminSummary = {
  total_users: number;
  paid_or_granted_users: number;
  total_houses: number;
  total_products: number;
  total_receipts: number;
  users_by_plan: Record<string, number>;
};

export type AdminUser = {
  id: number;
  email: string;
  full_name?: string;
  country?: string;
  city?: string;
  currency_code: string;
  plan_name: PlanName;
  subscription_status: string;
  created_at: string;
  houses_owned: number;
  memberships: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
};


export type AdminEmailStatus = {
  email_configured: boolean;
  provider: string;
  smtp_configured: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_from_email?: string;
  smtp_username?: string;
  smtp_use_tls: boolean;
  smtp_force_ipv4: boolean;
  resend_configured: boolean;
  resend_from_email?: string;
  missing_settings: string[];
  message: string;
};

export type AdminAction = {
  ok: boolean;
  message: string;
};

export type NearbyStore = {
  name: string;
  address?: string;
  rating?: number;
  user_ratings_total?: number;
  maps_url?: string;
  source: string;
};

export type ShoppingItemSuggestion = {
  product_id: number;
  product_name: string;
  requested_quantity: number;
  current_store?: string;
  current_price?: number;
  best_known_store?: string;
  best_known_price?: number;
  best_known_source?: string | null;
  best_known_recorded_at?: string | null;
  freshness_label?: string | null;
  savings_vs_current?: number;
  message: string;
};

export type ShoppingSuggestions = {
  currency_code: string;
  location_label?: string;
  premium_required: boolean;
  message: string;
  nearby_stores: NearbyStore[];
  item_suggestions: ShoppingItemSuggestion[];
};

export type MarketCapabilities = {
  product_lookup_available: boolean;
  live_price_compare_available: boolean;
  apify_configured: boolean;
  live_price_status?: 'connected' | 'not_connected' | string;
  supported_retailers: string[];
  message: string;
};

export type ProductLookupResult = {
  source: string;
  barcode?: string | null;
  name: string;
  brand?: string | null;
  image_url?: string | null;
  categories: string[];
  nutrition_grade?: string | null;
  quantity?: string | null;
  store_name?: string | null;
  product_url?: string | null;
  price?: number | null;
  lookup_note?: string | null;
  found: boolean;
};

export type ProductLookupResponse = {
  premium_required: boolean;
  configured: boolean;
  store_filter?: string | null;
  message: string;
  lookup_status?: string | null;
  lookup_details?: string[];
  results: ProductLookupResult[];
};

export type LivePriceResult = {
  item: string;
  retailer?: string | null;
  banner?: string | null;
  store_name?: string | null;
  store_address?: string | null;
  store_url?: string | null;
  matched_product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  sale_price?: number | null;
  unit_price?: string | null;
  package_size?: string | null;
  availability?: string | null;
  is_on_sale?: boolean | null;
  match_confidence?: string | null;
  confidence_explanation?: string | null;
  source_url?: string | null;
  scraped_at?: string | null;
  raw_source: string;
};

export type LivePriceCompareResponse = {
  premium_required: boolean;
  configured: boolean;
  cached: boolean;
  currency_code: string;
  location_label?: string | null;
  source: string;
  connection_status?: 'connected' | 'not_connected' | string;
  failure_reason?: string | null;
  used_fallback?: boolean;
  message: string;
  supported_retailers: string[];
  results: LivePriceResult[];
};

export type SiteReview = {
  id: number;
  user_id?: number | null;
  rating: number;
  comment: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string | null;
  user_name?: string | null;
  user_avatar_url?: string | null;
  can_edit?: boolean;
};

export type SiteReviewSummary = {
  total_users: number;
  new_users_this_month: number;
  average_rating: number;
  review_count: number;
  best_positive_comment?: string | null;
  best_reviewer_name?: string | null;
  best_rating?: number | null;
};


export type ReceiptScanPack = {
  key: string;
  name: string;
  scan_count: number;
  price_cad: number;
  description: string;
};

export type AdminUserOffer = {
  id: number;
  user_id?: number | null;
  user_email?: string | null;
  user_name?: string | null;
  is_general?: boolean;
  offer_kind: 'discount' | 'free_plan_access' | 'general';
  plan_name?: PlanName | string | null;
  plan_label?: string | null;
  title: string;
  occasion?: string | null;
  message?: string | null;
  discount_percent?: number | null;
  stripe_duration?: string | null;
  duration_months?: number | null;
  access_duration_days?: number | null;
  access_lifetime: boolean;
  use_limit?: number | null;
  status: string;
  expires_at: string;
  accepted_at?: string | null;
  declined_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  stripe_promotion_code?: string | null;
  universal: boolean;
  can_accept: boolean;
  checkout_url?: string | null;
  summary: string;
};

export type AdminOfferAction = {
  ok: boolean;
  message: string;
  checkout_url?: string | null;
  offer?: AdminUserOffer | null;
};


export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  complete: boolean;
  href?: string | null;
};

export type OnboardingStatus = {
  complete: boolean;
  completed_steps: number;
  total_steps: number;
  percent: number;
  primary_house_id?: number | null;
  steps: OnboardingStep[];
};

export type SavingsSummary = {
  currency_code: string;
  month_label: string;
  tracked_spend: number;
  receipt_discounts: number;
  lower_price_choices: number;
  estimated_savings: number;
  plan_monthly_cost: number;
  savings_after_plan_cost: number;
  roi_multiple?: number | null;
  comparison_opportunities: number;
  message: string;
};

export type BasketStoreOption = {
  store_name: string;
  estimated_total: number;
  priced_items: number;
  total_items: number;
  coverage_percent: number;
  missing_items: string[];
};

export type BasketComparison = {
  currency_code: string;
  premium_required: boolean;
  message: string;
  list_id: number;
  list_title: string;
  total_items: number;
  best_single_store?: BasketStoreOption | null;
  store_options: BasketStoreOption[];
  split_store_total?: number | null;
  split_store_savings?: number | null;
  split_store_names: string[];
  split_store_coverage_percent: number;
  split_store_picks: string[];
};

export type WeeklyAssistantRecipe = {
  name: string;
  reason: string;
  matched_items: string[];
  missing_items: string[];
};

export type WeeklyAssistantSuggestedItem = {
  product_id: number;
  product_name: string;
  reason: string;
  requested_quantity: number;
};

export type WeeklyAssistant = {
  currency_code: string;
  house_id: number;
  house_name: string;
  generated_at: string;
  low_stock: string[];
  out_of_stock: string[];
  expiring_soon: string[];
  expired: string[];
  long_held: string[];
  suggested_missing: string[];
  suggested_items: WeeklyAssistantSuggestedItem[];
  active_list_id?: number | null;
  active_list_title?: string | null;
  active_list_items: number;
  best_store_name?: string | null;
  best_store_total?: number | null;
  alternative_store_name?: string | null;
  alternative_store_total?: number | null;
  potential_store_savings?: number | null;
  monthly_savings: number;
  recipes: WeeklyAssistantRecipe[];
  message: string;
};
