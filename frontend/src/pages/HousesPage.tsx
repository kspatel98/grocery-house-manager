import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AccountBootstrap, AdminUserOffer, House, OnboardingStatus, Subscription, WeeklyAssistant } from '../types';
import FirstRunSetup from '../components/FirstRunSetup';
import InstallAppPrompt from '../components/InstallAppPrompt';
import OverlayPortal from '../components/OverlayPortal';

function isPaidStatus(status?: string) {
  return ['active', 'trialing', 'past_due', 'cancel_at_period_end', 'paid'].includes((status || '').toLowerCase());
}

function offerStillActive(until?: string | null) {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>(() => {
    try { const cached = JSON.parse(localStorage.getItem('account_bootstrap_cache_v106') || 'null') as AccountBootstrap | null; return Array.isArray(cached?.houses) ? cached!.houses : []; } catch { return []; }
  });
  const [name, setName] = useState('');
  const [householdType, setHouseholdType] = useState<'family' | 'roommates' | 'couple' | 'solo' | 'other'>('family');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => houses.length === 0);
  const [subscription, setSubscription] = useState<Subscription | null>(() => {
    try { return (JSON.parse(localStorage.getItem('account_bootstrap_cache_v106') || 'null') as AccountBootstrap | null)?.subscription || null; } catch { return null; }
  });
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [todayBrief, setTodayBrief] = useState<WeeklyAssistant | null>(null);
  const [firstName, setFirstName] = useState(() => {
    try { const user = (JSON.parse(localStorage.getItem('account_bootstrap_cache_v106') || 'null') as AccountBootstrap | null)?.user; return (user?.full_name || user?.email || '').split(/[ @]/).filter(Boolean)[0] || ''; } catch { return ''; }
  });
  const [offers, setOffers] = useState<AdminUserOffer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const navigate = useNavigate();

  async function load() {
    try {
      if (!houses.length) setLoading(true);
      setError('');
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      const nextHouses = Array.isArray(data.houses) ? data.houses : [];
      setHouses(nextHouses);
      setSubscription(data.subscription);
      setFirstName((data.user.full_name || data.user.email || '').split(/[ @]/).filter(Boolean)[0] || '');
      localStorage.setItem('account_profile_cache', JSON.stringify(data.user));
      localStorage.setItem('account_bootstrap_cache_v106', JSON.stringify(data));
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
      // Keep the most recent household shell available during a transient reconnect.
      // A background/API hiccup should not make the user's homes appear to vanish.
      try {
        const cached = JSON.parse(localStorage.getItem('account_bootstrap_cache_v106') || 'null') as AccountBootstrap | null;
        if (Array.isArray(cached?.houses) && cached!.houses.length) {
          setHouses(cached!.houses);
          setSubscription(cached!.subscription);
          setFirstName((cached!.user.full_name || cached!.user.email || '').split(/[ @]/).filter(Boolean)[0] || '');
        }
      } catch { /* no usable cache */ }
    } finally {
      setLoading(false);
    }
  }

  async function createHouse(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    try {
      setCreating(true);
      setCreateError('');
      const { data } = await api.post<House>('/houses', { name: name.trim(), household_type: householdType });
      localStorage.setItem('ghm_active_house_id', String(data.id));
      setName('');
      setHouseholdType('family');
      navigate(`/houses/${data.id}`);
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreating(false);
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
      <header className="v104-switchboard-hero">
        <div className="v104-switchboard-copy"><p className="eyebrow">GROCERY HOUSE MANAGER</p><h1>{firstName ? `${greeting}, ${firstName}` : greeting}</h1><p>Your groceries, meals, receipts, shopping and household money — connected in one place.</p><div className="v104-switchboard-actions">{activeHouse ? <Link className="primary center-link" to={`/houses/${activeHouse.id}?tab=home`}>Open {activeHouse.name} →</Link> : null}{activeHouse ? <Link className="secondary center-link" to={`/houses/${activeHouse.id}/scan`}>Scan receipt</Link> : null}</div></div>
        <div className="v104-switchboard-art" aria-hidden="true"><span>🏡</span><div><i>🥦</i><i>🧾</i><i>🛒</i><i>💸</i></div></div>
      </header>

      <FirstRunSetup onStatus={setOnboarding} onHouseCreated={(house) => { setHouses((current) => current.some((row) => row.id === house.id) ? current : [...current, house]); setShowCreate(false); void load(); }} />
      {onboarding?.complete ? <InstallAppPrompt /> : null}
      {error && houses.length === 0 ? <div className="error">{error}</div> : error ? <div className="ghm-refresh-note-v106"><span>↻</span><div><strong>Showing your last loaded household view.</strong><small>GHM will refresh automatically when the connection is stable.</small></div></div> : null}
      {loading && houses.length === 0 && <div className="ghm-shell-loader-v106" aria-live="polite"><span></span><div><strong>Opening your homes</strong><small>Loading the latest household data…</small></div></div>}

      {!loading && todayAction ? <Link to={todayAction.to} className="v95-switchboard-focus"><span>{todayAction.icon}</span><div><p className="eyebrow">{todayAction.eyebrow}</p><h2>{todayAction.title}</h2><p>{todayAction.copy}</p></div><strong>{todayAction.cta} →</strong></Link> : null}

      {!loading && houses.length > 0 ? <section className="v95-house-switcher">
        <header><div><p className="eyebrow">YOUR HOUSEHOLDS</p><h2>Choose where you want to work.</h2></div>{canCreateHouse ? <button type="button" className="secondary" onClick={() => { setCreateError(''); setShowCreate(true); }}>+ Add household</button> : null}</header>
        <div className="v95-house-switcher-grid">{houses.map((house) => <Link key={house.id} to={`/houses/${house.id}?tab=home`} onClick={() => localStorage.setItem('ghm_active_house_id', String(house.id))} className={activeHouse?.id === house.id ? 'active' : ''}><span>⌂</span><div><strong>{house.name}</strong><small>{house.role} access</small></div><b>→</b></Link>)}</div>
      </section> : null}

      {((showCreate && (canCreateHouse || houses.length === 0)) || (!loading && houses.length === 0 && onboarding === null)) && (
        <OverlayPortal>
          <div className="modal-backdrop v136-house-create-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !creating && houses.length > 0) setShowCreate(false); }}>
            <section className="focus-dialog v136-house-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-house-title">
              <header className="focus-dialog-titlebar"><div><p className="eyebrow">PRIVATE SHARED SPACE</p><h2 id="create-house-title">{houses.length ? 'Add another household' : 'Create your first household'}</h2><small>Every household keeps its own inventory, shopping and expenses.</small></div><button className="icon-btn" type="button" data-dialog-close="true" aria-label="Close create household" disabled={creating} onClick={() => setShowCreate(false)}>×</button></header>
              <form onSubmit={createHouse} className="v136-house-create-form">
                <div className="focus-dialog-scroll v136-house-create-body">
                  <label htmlFor="new-house-name">Household name</label>
                  <input id="new-house-name" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Family Home" />
                  <div className="v136-house-create-choose"><strong>What kind of household?</strong><small>Choose one to personalize your setup. You can change it later.</small></div>
                  <div className="v136-house-type-grid" role="group" aria-label="Household type">
                    {([
                      ['family','🏠','Family','Groceries and meals'],
                      ['roommates','👥','Roommates','Shared shopping and bills'],
                      ['couple','♥','Couple','Plan together'],
                      ['solo','●','Just me','Personal home'],
                      ['other','⌂','Other','Flexible setup'],
                    ] as const).map(([key,icon,title,sub]) => <button type="button" key={key} aria-pressed={householdType === key} className={householdType === key ? 'selected' : ''} onClick={() => setHouseholdType(key)}><span aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{sub}</small></span><b aria-hidden="true">{householdType === key ? '✓' : ''}</b></button>)}
                  </div>
                  {createError ? <div role="alert" className="error">{createError}</div> : null}
                </div>
                <footer className="focus-dialog-actions v136-house-create-actions"><button type="button" className="secondary" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="primary" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create household'}</button></footer>
              </form>
            </section>
          </div>
        </OverlayPortal>
      )}

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
