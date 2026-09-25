import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AccountBootstrap, AdminUserOffer, House, OnboardingStatus, Subscription, WeeklyAssistant } from '../types';
import FirstRunSetup from '../components/FirstRunSetup';
import InstallAppPrompt from '../components/InstallAppPrompt';

function isPaidStatus(status?: string) {
  return ['active', 'trialing', 'past_due', 'cancel_at_period_end', 'paid'].includes((status || '').toLowerCase());
}

function offerStillActive(until?: string | null) {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [todayBrief, setTodayBrief] = useState<WeeklyAssistant | null>(null);
  const [firstName, setFirstName] = useState('');
  const [offers, setOffers] = useState<AdminUserOffer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  async function load() {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      const nextHouses = Array.isArray(data.houses) ? data.houses : [];
      setHouses(nextHouses);
      setSubscription(data.subscription);
      setFirstName((data.user.full_name || data.user.email || '').split(/[ @]/).filter(Boolean)[0] || '');
      localStorage.setItem('account_profile_cache', JSON.stringify(data.user));
      localStorage.setItem('account_is_admin', data.is_admin ? 'true' : 'false');
      const savedHouse = Number(localStorage.getItem('ghm_active_house_id'));
      const primaryHouse = nextHouses.find((house) => house.id === savedHouse) || nextHouses[0];
      if (primaryHouse) {
        localStorage.setItem('ghm_active_house_id', String(primaryHouse.id));
        void api.get<WeeklyAssistant>(`/insights/houses/${primaryHouse.id}/weekly-assistant`, { params: { t: Date.now() } })
          .then(({ data: brief }) => setTodayBrief(brief))
          .catch(() => setTodayBrief(null));
      } else {
        setTodayBrief(null);
        setShowCreate(true);
      }
      void api.get<AdminUserOffer[]>('/offers/general', { params: { t: Date.now() } })
        .then(({ data: rows }) => setOffers(Array.isArray(rows) ? rows : []))
        .catch(() => setOffers([]));
    } catch (err) {
      setError(errorMessage(err));
      setHouses([]);
    } finally {
      setLoading(false);
    }
  }

  async function createHouse(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setError('');
      const { data } = await api.post<House>('/houses', { name: name.trim() });
      localStorage.setItem('ghm_active_house_id', String(data.id));
      setName('');
      navigate(`/houses/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const ownedHouseCount = Number(subscription?.usage?.houses || 0);
  const canCreateHouse = !!subscription && subscription.limits.houses > ownedHouseCount;
  const newUserOffer = subscription?.new_user_offer;
  const showOffer = Boolean(newUserOffer?.active && offerStillActive(newUserOffer?.eligible_until) && !isPaidStatus(subscription?.subscription_status));
  const activeHouse = houses.find((house) => house.id === Number(localStorage.getItem('ghm_active_house_id'))) || houses[0] || null;

  const todayAction = useMemo(() => {
    if (!activeHouse) return null;
    if (!todayBrief) return { icon: '⌂', eyebrow: 'Your household', title: `Open ${activeHouse.name}`, copy: 'Everything your household needs is organized behind one calm home view.', to: `/houses/${activeHouse.id}`, cta: 'Open home' };
    if (todayBrief.expired.length) return { icon: '⚠️', eyebrow: 'Review, do not consume', title: `${todayBrief.expired.length} expired item${todayBrief.expired.length === 1 ? '' : 's'} need review`, copy: 'Expired products are excluded from meal suggestions. Review and discard them when appropriate.', to: `/houses/${activeHouse.id}/inventory`, cta: 'Review inventory' };
    if (todayBrief.expiring_soon.length) return { icon: '⏳', eyebrow: 'Use before expiry', title: `${todayBrief.expiring_soon.length} item${todayBrief.expiring_soon.length === 1 ? '' : 's'} should be used soon`, copy: 'Plan around them while they are still within their expiry date.', to: `/assistant?house=${activeHouse.id}&view=plan`, cta: 'Plan meals' };
    if (todayBrief.suggested_items.length) return { icon: '🛒', eyebrow: 'Next trip', title: `${todayBrief.suggested_items.length} product${todayBrief.suggested_items.length === 1 ? '' : 's'} may need restocking`, copy: 'GHM can prepare the trip and still respect your preferred stores and convenience choices.', to: `/assistant?house=${activeHouse.id}&view=spend`, cta: 'Prepare trip' };
    if (todayBrief.active_list_items) return { icon: '✓', eyebrow: 'Ready to shop', title: `${todayBrief.active_list_items} item${todayBrief.active_list_items === 1 ? '' : 's'} on the active list`, copy: 'Your shared list is ready whenever someone in the household shops.', to: `/houses/${activeHouse.id}/shopping`, cta: 'Open shopping' };
    return { icon: '✦', eyebrow: 'All calm', title: 'Nothing urgent needs your attention', copy: 'GHM will keep watching stock, expiry, receipts, prices and household patterns.', to: `/houses/${activeHouse.id}`, cta: 'See today' };
  }, [activeHouse, todayBrief]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <main className="page shell wide v95-switchboard-page">
      <header className="v95-switchboard-hero">
        <div><p className="eyebrow">GROCERY HOUSE MANAGER</p><h1>{firstName ? `${greeting}, ${firstName}` : greeting}</h1><p>One calm place for the household. You only need to deal with what matters now.</p></div>
        {activeHouse ? <Link className="primary center-link" to={`/houses/${activeHouse.id}`}>Open {activeHouse.name} →</Link> : null}
      </header>

      <FirstRunSetup onStatus={setOnboarding} />
      {onboarding?.complete ? <InstallAppPrompt /> : null}
      {error && <div className="error">{error}</div>}
      {loading && <div className="panel muted-panel">Preparing your homes…</div>}

      {!loading && todayAction ? <Link to={todayAction.to} className="v95-switchboard-focus"><span>{todayAction.icon}</span><div><p className="eyebrow">{todayAction.eyebrow}</p><h2>{todayAction.title}</h2><p>{todayAction.copy}</p></div><strong>{todayAction.cta} →</strong></Link> : null}

      {!loading && houses.length > 0 ? <section className="v95-house-switcher">
        <header><div><p className="eyebrow">YOUR HOUSEHOLDS</p><h2>Choose where you want to work.</h2></div>{canCreateHouse ? <button type="button" className="secondary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close' : '+ Add household'}</button> : null}</header>
        <div className="v95-house-switcher-grid">{houses.map((house) => <Link key={house.id} to={`/houses/${house.id}`} onClick={() => localStorage.setItem('ghm_active_house_id', String(house.id))} className={activeHouse?.id === house.id ? 'active' : ''}><span>⌂</span><div><strong>{house.name}</strong><small>{house.role} access</small></div><b>→</b></Link>)}</div>
      </section> : null}

      {(showCreate || houses.length === 0) ? <section className="v95-create-home">
        <div><p className="eyebrow">PRIVATE SHARED SPACE</p><h2>{houses.length ? 'Add another household' : 'Create your first Grocery Home'}</h2><p>Inventory, shopping, receipts, expenses and members stay together. You can keep the name simple.</p></div>
        {canCreateHouse || houses.length === 0 ? <form onSubmit={createHouse}><input placeholder="Example: Patel Family Home" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary" disabled={!name.trim()}>Create household</button></form> : <div className="upgrade-callout"><strong>Your current plan has reached its household limit.</strong><Link to="/pricing">Compare plans →</Link></div>}
      </section> : null}

      {onboarding?.complete && (showOffer || offers.length > 0) ? <details className="v95-updates-drawer">
        <summary><span><strong>{showOffer || offers.length ? 'Offers & account updates' : 'Updates'}</strong><small>Kept out of your way until you want to see them.</small></span><b>{(showOffer ? 1 : 0) + offers.length}</b></summary>
        <div>
          {showOffer ? <Link to="/pricing" className="v95-update-row"><span>✦</span><div><strong>65% off Basic Home</strong><small>Eligible new-user offer for the first two billing months.</small></div><b>View →</b></Link> : null}
          {offers.map((offer) => <Link key={offer.id} to="/pricing" className="v95-update-row"><span>◇</span><div><strong>{offer.title}</strong><small>{offer.message || offer.summary}</small></div><b>View →</b></Link>)}
        </div>
      </details> : null}

      {!loading && houses.length === 0 && !error ? <section className="v95-empty-home"><span>⌂</span><h2>Your household starts here.</h2><p>Create one private home above. GHM becomes useful as soon as you add a few groceries, a list or a receipt.</p></section> : null}
    </main>
  );
}
