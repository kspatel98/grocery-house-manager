import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { CouponValidation, Plan, PlanName, Subscription } from '../types';

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

function calculateFallbackDiscount(planPrice: number, coupon: CouponValidation | null) {
  if (!coupon?.valid) return null;
  if (typeof coupon.percent_off === 'number') {
    return Math.max(0, Number((planPrice * (1 - coupon.percent_off / 100)).toFixed(2)));
  }
  if (typeof coupon.amount_off === 'number') {
    return Math.max(0, Number((planPrice - coupon.amount_off).toFixed(2)));
  }
  return null;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState('');
  const [busyPlan, setBusyPlan] = useState<PlanName | ''>('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loggedIn = Boolean(localStorage.getItem('token'));

  async function load() {
    setError('');
    setLoadingPlans(true);

    try {
      const plansRes = await api.get<Plan[]>('/billing/plans', { params: { t: Date.now() } });
      setPlans(plansRes.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingPlans(false);
    }

    try {
      const subRes = await api.get<Subscription>('/billing/me', { params: { t: Date.now() } });
      setSubscription(subRes.data);
    } catch {
      setSubscription(null);
    }
  }

  async function validateCoupon(event: React.FormEvent) {
    event.preventDefault();
    const code = couponCode.trim();
    if (!loggedIn) {
      setCoupon({ valid: false, message: 'Please login or create an account before applying a coupon.' });
      return;
    }
    if (!code) {
      setCoupon({ valid: false, message: 'Enter a coupon code.' });
      return;
    }
    if (coupon?.valid) {
      setCoupon({
        valid: false,
        message: 'A coupon is already applied. Remove the current coupon before applying another one.',
      });
      return;
    }
    try {
      setCouponBusy(true);
      setCoupon(null);
      const { data } = await api.post<CouponValidation>('/billing/coupon/validate', { code });
      setCoupon(data);
      setError('');
    } catch (err) {
      setCoupon({ valid: false, message: errorMessage(err) });
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponCode('');
  }

  async function checkout(planName: PlanName) {
    if (planName === 'free') return;
    if (!loggedIn) {
      navigate('/login');
      return;
    }
    try {
      setBusyPlan(planName);
      setError('');
      const { data } = await api.post<{ checkout_url: string }>('/billing/checkout-session', {
        plan_name: planName,
        promotion_code_id: coupon?.valid ? coupon.promotion_code_id : null,
      });
      window.location.href = data.checkout_url;
    } catch (err) {
      setError(errorMessage(err));
      setBusyPlan('');
    }
  }

  async function manageBilling() {
    if (!loggedIn) {
      navigate('/login');
      return;
    }
    try {
      const { data } = await api.post<{ url: string }>('/billing/customer-portal');
      window.location.href = data.url;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { load(); }, []);

  const checkoutStatus = params.get('checkout');

  return (
    <main className="page shell wide pricing-page">
      <header className="topbar">
        <div>
          <Link to={loggedIn ? '/houses' : '/'} className="breadcrumb">← {loggedIn ? 'Houses' : 'Home'}</Link>
          <h1>Subscription plans</h1>
          <p>Choose the plan for houses you own. Members can use house features based on the owner's plan, while their own subscription unlocks personal premium tools.</p>
        </div>
        <div className="profile-actions">
          <button className="secondary" onClick={load}>Refresh</button>
          {!loggedIn && <Link className="primary center-link" to="/login">Login to subscribe</Link>}
          {subscription?.subscription_status && subscription.subscription_status !== 'free' && (
            <button className="secondary" onClick={manageBilling}>Manage billing</button>
          )}
        </div>
      </header>

      {checkoutStatus === 'success' && <div className="success">Checkout completed. Your plan will update after Stripe confirms the payment.</div>}
      {checkoutStatus === 'cancelled' && <div className="hint">Checkout cancelled. Your current plan is unchanged.</div>}
      {error && <div className="error">{error}</div>}
      {loadingPlans && <div className="panel muted-panel">Loading plans...</div>}
      {!loggedIn && (
        <section className="hint offer-banner">
          <strong>Viewing plans as a guest.</strong> Create an account or sign in to see your new-user offer, apply account-specific coupons, and start checkout.
        </section>
      )}

      {subscription?.new_user_offer?.active && (
        <section className="success offer-banner">
          <strong>New-user offer available:</strong> Basic Home is shown as <s>$1.99</s> $0.70 CAD/month for the first 2 billing months. After 2 months, Stripe will charge the regular Basic Home price of $1.99 CAD/month. You can still enter a coupon; if you use a coupon, the automatic Basic offer will not be applied.
          {subscription.new_user_offer.eligible_until && ` This offer is available until ${new Date(subscription.new_user_offer.eligible_until).toLocaleDateString()}.`}
        </section>
      )}

      <section className="panel coupon-panel">
        <div>
          <p className="eyebrow">Have a coupon?</p>
          <h2>Apply coupon code</h2>
          <p>Public prices are shown by default. Enter an active coupon code to preview your discounted price before checkout. Only one discount can be used at a time. A verified coupon replaces the automatic Basic new-user offer for checkout; after a discount or paid plan is accepted, new coupons cannot be added to that active subscription.</p>
        </div>
        <form onSubmit={validateCoupon} className="coupon-form">
          <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="COUPON CODE" disabled={!loggedIn} />
          <button className="secondary" disabled={couponBusy || !loggedIn}>{!loggedIn ? 'Login first' : couponBusy ? 'Checking...' : 'Apply'}</button>
          {coupon && <button type="button" className="ghost-button" onClick={removeCoupon}>Remove</button>}
        </form>
        {coupon && (
          <div className={coupon.valid ? 'success compact-message' : 'error compact-message'}>
            {coupon.message}
            {coupon.valid && coupon.percent_off ? ` ${coupon.percent_off}% off.` : ''}
            {coupon.valid && coupon.amount_off ? ` ${formatPrice(coupon.amount_off)} ${coupon.currency || 'CAD'} off.` : ''}
            {coupon.valid ? ' The cards below now show the price you should pay after the coupon.' : ''}
          </div>
        )}
      </section>

      {!loadingPlans && plans.length === 0 && !error && (
        <section className="panel empty-state">
          <h2>Plans could not be loaded</h2>
          <p>Please check that the backend is running and that <code>VITE_API_URL</code> points to your production API.</p>
          <button className="secondary" onClick={load}>Try again</button>
        </section>
      )}

      <section className="pricing-grid">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan_name === plan.key;
          const hasLaunchDiscount = Boolean(plan.regular_price_monthly_cad && plan.regular_price_monthly_cad > plan.price_monthly_cad);
          const hasAppliedCoupon = !!coupon?.valid && !!coupon.promotion_code_id;
          const hasNewUserBasicOffer = !!subscription?.new_user_offer?.active && plan.key === 'basic' && !hasAppliedCoupon;
          const newUserOfferPrice = hasNewUserBasicOffer ? Number((plan.price_monthly_cad * 0.35).toFixed(2)) : null;
          const backendCouponPrice = hasAppliedCoupon ? coupon.discounted_prices?.[plan.key] : null;
          const fallbackCouponPrice = calculateFallbackDiscount(plan.price_monthly_cad, coupon);
          const couponPrice = typeof backendCouponPrice === 'number' ? backendCouponPrice : fallbackCouponPrice;
          const hasCouponDiscount = plan.key !== 'free' && hasAppliedCoupon && typeof couponPrice === 'number' && couponPrice < plan.price_monthly_cad;
          const effectivePrice = hasNewUserBasicOffer && newUserOfferPrice !== null ? newUserOfferPrice : (hasCouponDiscount ? couponPrice : plan.price_monthly_cad);
          const oldPrice = (hasCouponDiscount || hasNewUserBasicOffer) ? plan.price_monthly_cad : plan.regular_price_monthly_cad;
          return (
            <article key={plan.key} className={`panel pricing-card ${plan.recommended ? 'recommended' : ''} ${hasCouponDiscount || hasNewUserBasicOffer ? 'coupon-applied-card' : ''}`}>
              {plan.recommended && <div className="recommended-badge">Best value</div>}
              {plan.discount_label && !hasCouponDiscount && <div className="discount-badge">{plan.discount_label}</div>}
              {hasNewUserBasicOffer && <div className="coupon-badge">New-user offer</div>}
              {hasCouponDiscount && <div className="coupon-badge">Coupon applied</div>}
              <h2>{plan.name}</h2>
              <p>{plan.tagline}</p>
              <div className="price-line">
                {(hasLaunchDiscount || hasCouponDiscount || hasNewUserBasicOffer) && oldPrice !== null && oldPrice !== undefined && <span className="old-price">{formatPrice(oldPrice)}</span>}
                <strong>{formatPrice(effectivePrice)}</strong>
                <span>CAD / month</span>
              </div>
              {hasNewUserBasicOffer && (
                <p className="coupon-savings">
                  65% off for your first 2 billing months. After that, this plan automatically renews at the regular price of {formatPrice(plan.price_monthly_cad)} CAD/month. If you apply a coupon instead, this automatic offer will not be used.
                </p>
              )}
              {hasCouponDiscount && (
                <p className="coupon-savings">
                  You save {formatPrice(plan.price_monthly_cad - effectivePrice)} per month with this code.
                </p>
              )}
              <ul className="feature-list">
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <div className="limits-box">
                <span>{plan.limits.houses} house{plan.limits.houses === 1 ? '' : 's'}</span>
                <span>{plan.limits.products_per_house} products/house</span>
                <span>{plan.limits.active_lists_per_house} active lists/house</span>
                <span>{plan.limits.members_per_house} members/house</span>
              </div>
              {isCurrent ? (
                <button className="secondary full" disabled>Current plan</button>
              ) : plan.key === 'free' ? (
                <button className="secondary full" disabled>Free by default</button>
              ) : (
                <button className="primary full" disabled={busyPlan === plan.key} onClick={() => checkout(plan.key)}>
                  {!loggedIn ? 'Login to choose' : busyPlan === plan.key ? 'Opening checkout...' : `Choose ${plan.name}`}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
