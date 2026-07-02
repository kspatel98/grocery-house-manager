export type User = {
  id: number;
  email: string;
  full_name?: string;
  avatar_url?: string;
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
  created_at: string;
};

export type Section = {
  id: number;
  house_id: number;
  name: string;
  icon?: string;
  sort_order: number;
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
};

export type ShoppingItemStatus = 'to_buy' | 'in_cart' | 'skipped';

export type ShoppingListItem = {
  id: number;
  product_id: number;
  requested_quantity: number;
  bought_quantity: number;
  message?: string;
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
  email: string;
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
};
