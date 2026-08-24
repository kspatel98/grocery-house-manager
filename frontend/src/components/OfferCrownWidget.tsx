import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AdminOfferAction, AdminUserOffer, PlanName } from '../types';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic Home',
  family: 'Family Plus',
  pro: 'Household Pro',
};

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Limited time';
  return date.toLocaleString();
}

function offerKindLabel(offer: AdminUserOffer) {
  if (offer.status === 'checkout_started') return 'Checkout waiting';
  if (offer.offer_kind === 'free_plan_access') return 'Free plan access';
  if (offer.universal) return 'Universal discount';
  return 'Personal discount';
}

export default function OfferCrownWidget() {
  const [offers, setOffers] = useState<AdminUserOffer[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [selectedPlans, setSelectedPlans] = useState<Record<number, PlanName>>({});

  async function loadOffers() {
    if (!localStorage.getItem('token')) return;
    try {
      const { data } = await api.get<AdminUserOffer[]>('/offers/mine', { params: { t: Date.now() } });
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      setOffers([]);
    }
  }

  useEffect(() => {
    loadOffers();
    const timer = window.setInterval(loadOffers, 5000);
    const refresh = () => {
      if (document.visibilityState === 'visible') loadOffers();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', loadOffers);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', loadOffers);
    };
  }, []);

  const primaryOffer = offers[0];
  const otherCount = Math.max(offers.length - 1, 0);

  const selectedPlan = useMemo(() => {
    if (!primaryOffer) return 'basic' as PlanName;
    return selectedPlans[primaryOffer.id] || 'basic';
  }, [primaryOffer, selectedPlans]);

  async function acceptOffer(offer: AdminUserOffer) {
    try {
      setBusyId(offer.id);
      setMessage('');
      const payload = offer.universal ? { plan_name: selectedPlans[offer.id] || 'basic' } : {};
      const { data } = await api.post<AdminOfferAction>(`/offers/${offer.id}/accept`, payload);
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setMessage(data.message || 'Offer accepted.');
      window.dispatchEvent(new Event('account:refresh'));
      await loadOffers();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function declineOffer(offer: AdminUserOffer) {
    if (!window.confirm('Decline this offer? It will disappear from your account.')) return;
    try {
      setBusyId(offer.id);
      setMessage('');
      await api.post(`/offers/${offer.id}/decline`);
      setOffers((prev) => prev.filter((item) => item.id !== offer.id));
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!primaryOffer) return null;

  if (!expanded) {
    return (
      <button className="offer-crown-badge" type="button" onClick={() => setExpanded(true)} aria-label="Open special offer">
        <span>♛</span>
        <strong>{offers.length}</strong>
      </button>
    );
  }

  return (
    <aside className="offer-crown-widget" aria-label="Special personal offer">
      <div className="offer-crown-top">
        <div className="crown-icon" aria-hidden="true">♛</div>
        <div>
          <span>{offerKindLabel(primaryOffer)}</span>
          <strong>{primaryOffer.title}</strong>
        </div>
        <button className="crown-minimize" type="button" onClick={() => setExpanded(false)} aria-label="Minimize offer">–</button>
      </div>
      <p>{primaryOffer.status === 'checkout_started' ? 'Your checkout is waiting. Continue payment before this offer expires.' : primaryOffer.message || primaryOffer.summary}</p>
      <div className="crown-offer-details">
        <span><strong>Offer</strong>{primaryOffer.summary}</span>
        <span><strong>Expires</strong>{formatExpiry(primaryOffer.expires_at)}</span>
        {otherCount > 0 && <span><strong>More</strong>{otherCount} more offer{otherCount === 1 ? '' : 's'} waiting</span>}
      </div>
      {primaryOffer.universal && (
        <label className="crown-plan-picker">
          Choose plan
          <select value={selectedPlan} onChange={(event) => setSelectedPlans((prev) => ({ ...prev, [primaryOffer.id]: event.target.value as PlanName }))}>
            <option value="basic">{PLAN_LABELS.basic}</option>
            <option value="family">{PLAN_LABELS.family}</option>
            <option value="pro">{PLAN_LABELS.pro}</option>
          </select>
        </label>
      )}
      {message && <div className="crown-message">{message}</div>}
      <div className="crown-actions">
        <button className="crown-accept" type="button" disabled={busyId === primaryOffer.id} onClick={() => acceptOffer(primaryOffer)}>
          {busyId === primaryOffer.id ? 'Opening...' : primaryOffer.status === 'checkout_started' ? 'Continue checkout' : primaryOffer.offer_kind === 'free_plan_access' ? 'Accept access' : 'Accept offer'}
        </button>
        <button className="crown-soft" type="button" onClick={() => setExpanded(false)}>Minimize</button>
        <button className="crown-decline" type="button" disabled={busyId === primaryOffer.id} onClick={() => declineOffer(primaryOffer)}>Decline</button>
        <Link to="/pricing" className="crown-soft crown-link">Plans</Link>
      </div>
    </aside>
  );
}
