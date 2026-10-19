import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import OverlayPortal from './OverlayPortal';
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
  const [expanded, setExpanded] = useState(false);
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
    const timer = window.setInterval(loadOffers, 30000);
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

  return <>
    <button type="button" className="v141-offer-notice" onClick={() => setExpanded(true)} aria-label="View your GHM offer">
      <span className="v141-offer-notice-star" aria-hidden="true">✦</span>
      <span><strong>Special GHM offer</strong><small>{offers.length} available · Tap to review</small></span>
      <span aria-hidden="true">→</span>
    </button>
    {expanded && <OverlayPortal>
      <div className="v141-offer-shade" role="presentation" onClick={() => setExpanded(false)}>
        <section className="v141-offer-dialog" role="dialog" aria-modal="true" aria-label="Your GHM premium offer" onClick={e=>e.stopPropagation()}>
          <header className="v141-offer-dialog-head">
            <div><span className="eyebrow">PERSONAL GHM INVITATION</span><h2>{primaryOffer.title}</h2></div>
            <button type="button" className="v141-offer-close" onClick={() => setExpanded(false)} aria-label="Close offer">×</button>
          </header>
          <div className="v141-offer-dialog-body">
            <div className="v141-offer-highlight"><span aria-hidden="true">✦</span><strong>{primaryOffer.summary}</strong></div>
            <p>{primaryOffer.status === 'checkout_started' ? 'Your checkout is still waiting. You can continue from this offer.' : primaryOffer.message || 'This offer is available to your GHM account.'}</p>
            <div className="v141-offer-facts">
              <div><span>Offer type</span><strong>{offerKindLabel(primaryOffer)}</strong></div>
              <div><span>Available until</span><strong>{formatExpiry(primaryOffer.expires_at)}</strong></div>
              {otherCount>0&&<div><span>More offers</span><strong>{otherCount} additional</strong></div>}
            </div>
            {primaryOffer.universal && <label className="v141-offer-plan">Choose a plan
              <select value={selectedPlan} onChange={e=>setSelectedPlans(prev=>({...prev,[primaryOffer.id]:e.target.value as PlanName}))}>
                <option value="basic">{PLAN_LABELS.basic}</option><option value="family">{PLAN_LABELS.family}</option><option value="pro">{PLAN_LABELS.pro}</option>
              </select>
            </label>}
            {message&&<p className="v141-offer-message" role="status">{message}</p>}
          </div>
          <footer className="v141-offer-dialog-actions">
            <button className="primary" type="button" disabled={busyId===primaryOffer.id} onClick={()=>acceptOffer(primaryOffer)}>
              {busyId===primaryOffer.id?'Please wait…':primaryOffer.status==='checkout_started'?'Continue checkout':primaryOffer.offer_kind==='free_plan_access'?'Activate free access':'Review and accept'}
            </button>
            <button className="secondary" type="button" onClick={()=>setExpanded(false)}>Maybe later</button>
            <button className="ghost-button" type="button" disabled={busyId===primaryOffer.id} onClick={()=>declineOffer(primaryOffer)}>Decline offer</button>
          </footer>
          <small className="v141-offer-fineprint">Review offer terms before accepting. Complimentary access does not automatically enrol you in a paid plan.</small>
        </section>
      </div>
    </OverlayPortal>}
  </>;
}
