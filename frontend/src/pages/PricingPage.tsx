import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Plan, PlanName, Subscription } from '../types';

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState('');
  const [busyPlan, setBusyPlan] = useState<PlanName | ''>('');
  const [params] = useSearchParams();

  async function load() {
    try {
      const [plansRes, subRes] = await Promise.all([
        api.get<Plan[]>('/billing/plans'),
        api.get<Subscription>('/billing/me'),
      ]);
      setPlans(plansRes.data);
      setSubscription(subRes.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function checkout(planName: PlanName) {
    if (planName === 'free') return;
    try {
      setBusyPlan(planName);
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
          <p>Reasonable pricing with limits that feel useful, not restrictive.</p>
        </div>
        <div className="profile-actions">
          <Link to="/profile" className="secondary center-link">Profile</Link>
          {subscription?.subscription_status && subscription.subscription_status !== 'free' && (
            <button className="secondary" onClick={manageBilling}>Manage billing</button>
          )}
        </div>
      </header>

      {checkoutStatus === 'success' && <div className="success">Checkout completed. Stripe webhook will update your plan after payment confirmation.</div>}
      {checkoutStatus === 'cancelled' && <div className="hint">Checkout cancelled. Your current plan is unchanged.</div>}
      {error && <div className="error">{error}</div>}

      <section className="pricing-grid">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan_name === plan.key;
          return (
            <article key={plan.key} className={`panel pricing-card ${plan.recommended ? 'recommended' : ''}`}>
              {plan.recommended && <div className="recommended-badge">Most attractive</div>}
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

      <section className="panel">
        <h2>Payment gateway setup</h2>
        <p>
          This starter uses Stripe Checkout for hosted subscription checkout. Add your Stripe secret key and recurring Price IDs in <code>backend/.env</code>, then point your Stripe webhook to <code>/billing/webhook</code>.
        </p>
      </section>
    </main>
  );
}
