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
  is_expiring_soon: boolean;
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
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total?: number | null;
  confidence?: number | null;
  needs_review: boolean;
  is_selected: boolean;
  matched_product_id?: number | null;
  matched_product_name?: string | null;
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
  unit_price?: number | null;
  price?: number | null;
  discount_amount?: number | null;
  confidence?: number | null;
  line_type: string;
  needs_review: boolean;
  applied: boolean;
};

export type ReceiptUploadResult = {
  receipt: Receipt;
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

export type AccountBootstrap = {
  user: UserProfile;
  subscription: Subscription;
  insights: PersonalInsights;
  houses: House[];
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
  found: boolean;
};

export type ProductLookupResponse = {
  premium_required: boolean;
  configured: boolean;
  message: string;
  results: ProductLookupResult[];
};

export type LivePriceResult = {
  item: string;
  retailer?: string | null;
  banner?: string | null;
  store_name?: string | null;
  matched_product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  sale_price?: number | null;
  unit_price?: string | null;
  package_size?: string | null;
  availability?: string | null;
  is_on_sale?: boolean | null;
  match_confidence?: string | null;
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
  message: string;
  supported_retailers: string[];
  results: LivePriceResult[];
};
