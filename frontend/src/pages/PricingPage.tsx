import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Plan, PlanName, Subscription } from '../types';

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState('');
  const [busyPlan, setBusyPlan] = useState<PlanName | ''>('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [params] = useSearchParams();

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

    // Subscription data requires a valid login token. Do not block the plan cards if this fails.
    try {
      const subRes = await api.get<Subscription>('/billing/me', { params: { t: Date.now() } });
      setSubscription(subRes.data);
    } catch {
      setSubscription(null);
    }
  }

  async function checkout(planName: PlanName) {
    if (planName === 'free') return;
    try {
      setBusyPlan(planName);
      setError('');
      const { data } = await api.post<{ checkout_url: string }>('/billing/checkout-session', { plan_name: planName });
      window.location.href = data.checkout_url;
    } catch (err) {
      setError(errorMessage(err));
      setBusyPlan('');
    }
  }

  async function manageBilling() {
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
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Subscription plans</h1>
          <p>Simple pricing for families, roommates, and shared homes.</p>
        </div>
        <div className="profile-actions">
          <button className="secondary" onClick={load}>Refresh</button>
          <Link to="/profile" className="secondary center-link">Profile</Link>
          {subscription?.subscription_status && subscription.subscription_status !== 'free' && (
            <button className="secondary" onClick={manageBilling}>Manage billing</button>
          )}
        </div>
      </header>

      {checkoutStatus === 'success' && <div className="success">Checkout completed. Your plan will update after Stripe confirms the payment.</div>}
      {checkoutStatus === 'cancelled' && <div className="hint">Checkout cancelled. Your current plan is unchanged.</div>}
      {error && <div className="error">{error}</div>}
      {loadingPlans && <div className="panel muted-panel">Loading plans...</div>}

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
          return (
            <article key={plan.key} className={`panel pricing-card ${plan.recommended ? 'recommended' : ''}`}>
              {plan.recommended && <div className="recommended-badge">Best value</div>}
              <h2>{plan.name}</h2>
              <p>{plan.tagline}</p>
              <div className="price-line">
                <strong>${plan.price_monthly_cad.toFixed(2)}</strong>
                <span>CAD / month</span>
              </div>
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
                  {busyPlan === plan.key ? 'Opening checkout...' : `Choose ${plan.name}`}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
