import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AccountBootstrap, House, PremiumTryChoice, PremiumTryStatus } from '../types';

const planLabels: Record<string, string> = {
  basic: 'Basic Home',
  family: 'Family Plus',
  pro: 'Household Pro',
};

function featureDestination(feature: string, houseId: number) {
  const encoded = encodeURIComponent(feature);
  if (feature === 'smart_receipt_scan') return `/houses/${houseId}/scan?premiumTry=${encoded}`;
  if (feature === 'whole_list_compare' || feature === 'nearby_store_suggestions') return `/houses/${houseId}/shopping?premiumTry=${encoded}`;
  if (feature === 'kitchen_vision') return `/houses/${houseId}/kitchen?premiumTry=${encoded}`;
  if (feature === 'autopilot_planner' || feature === 'smart_stock_up') return `/assistant?house=${houseId}&view=${feature === 'autopilot_planner' ? 'plan' : 'spend'}&premiumTry=${encoded}`;
  if (feature === 'product_lookup' || feature === 'live_price_compare' || feature === 'weekly_flyers') return `/market?house=${houseId}&premiumTry=${encoded}`;
  return `/houses/${houseId}`;
}

function choiceGroup(choice: PremiumTryChoice) {
  return choice.min_plan === 'basic' ? 'Start simple' : choice.min_plan === 'family' ? 'Plan & save' : 'See advanced GHM';
}

export default function PremiumTryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PremiumTryStatus | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [draftFeature, setDraftFeature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      const premiumTry = data.subscription.premium_try || null;
      const owned = (data.houses || []).filter((house) => house.role === 'owner');
      setStatus(premiumTry);
      setHouses(owned);
      const requestedHouse = Number(params.get('house') || 0);
      const nextHouse = owned.find((house) => house.id === requestedHouse)?.id || premiumTry?.house_id || owned[0]?.id || null;
      setSelectedHouseId(nextHouse);
      const requestedFeature = params.get('feature') || params.get('premiumTry') || '';
      const validRequested = premiumTry?.choices.some((choice) => choice.key === requestedFeature) ? requestedFeature : '';
      setDraftFeature(validRequested || premiumTry?.selected_feature || '');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const result: Record<string, PremiumTryChoice[]> = {};
    for (const choice of status?.choices || []) {
      const key = choiceGroup(choice);
      (result[key] ||= []).push(choice);
    }
    return result;
  }, [status]);

  async function saveSelection() {
    if (!draftFeature) {
      setError('Choose the premium feature you want to experience once for free.');
      return;
    }
    if (!selectedHouseId) {
      setError('Create or choose a house you own first. The free experience belongs to one of your houses so an upgrade can continue the same workflow later.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const { data } = await api.post<PremiumTryStatus>('/billing/premium-try/select', { feature_key: draftFeature });
      setStatus(data);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function continueToFeature() {
    if (!status?.selected_feature || !selectedHouseId) return;
    navigate(featureDestination(status.selected_feature, selectedHouseId));
  }

  const savedChoice = status?.choices.find((choice) => choice.key === status.selected_feature) || null;
  const draftChoice = status?.choices.find((choice) => choice.key === draftFeature) || null;
  const selectionChanged = Boolean(draftFeature && draftFeature !== status?.selected_feature);

  return <main className="page shell wide premium-try-page-v102">
    <section className="premium-try-hero-v102">
      <div className="premium-try-hero-copy-v102">
        <span className="premium-try-kicker-v102">FREE STARTER • NO CARD REQUIRED</span>
        <h1>Try one premium feature once — free.</h1>
        <p>Pick the premium workflow that matters most to your household. GHM gives you the real result once. If it earns a place in your routine, subscribe only when you want to use it again.</p>
        <div className="premium-try-rule-row-v102">
          <span><b>1</b><small>Choose one feature</small></span>
          <span><b>✓</b><small>Use the real workflow once</small></span>
          <span><b>0</b><small>No payment card</small></span>
        </div>
      </div>
      <div className="premium-try-hero-art-v102" aria-hidden="true"><div className="premium-try-orbit-v102"><span>✨</span><i>🧾</i><i>🛒</i><i>🏷️</i><i>👁️</i></div></div>
    </section>

    {error && <div className="error premium-try-message-v102">{error}</div>}

    {!status ? <section className="panel">Loading your free Premium Try…</section> : status.used_at ? (
      <section className="premium-try-used-v102">
        <div className="premium-try-used-icon-v102">✓</div>
        <div><p className="eyebrow">YOUR FREE EXPERIENCE WAS USED</p><h2>You tried {status.selected_label || 'a premium feature'}.</h2><p>That one-time experience stays part of your GHM story. Subscribe to keep using premium workflows whenever your household needs them.</p><div className="premium-try-actions-v102"><Link className="primary center-link" to="/pricing">See subscription plans</Link><Link className="secondary center-link" to="/learn">See how GHM helps</Link></div></div>
      </section>
    ) : !status.eligible ? (
      <section className="premium-try-used-v102 premium-try-paid-v102">
        <div className="premium-try-used-icon-v102">♛</div>
        <div><p className="eyebrow">PREMIUM IS ALREADY ACTIVE</p><h2>You do not need the one-time free try right now.</h2><p>{status.message}</p><Link className="primary center-link" to="/houses">Open my household</Link></div>
      </section>
    ) : (
      <>
        <section className="premium-try-clarity-v102">
          <span>💡</span><div><strong>Your choice is not consumed when you select it.</strong><p>You can change your mind until the chosen workflow completes successfully. Failed or unavailable attempts do not use your free experience.</p></div>
        </section>

        <section className="premium-try-house-v102 panel">
          <div><p className="eyebrow">1 • CHOOSE THE HOUSE</p><h2>Where should GHM demonstrate the feature?</h2><p>The Premium Try works in a house you own because paid house features follow the owner's plan.</p></div>
          {houses.length ? <select value={selectedHouseId || ''} onChange={(event) => setSelectedHouseId(event.target.value ? Number(event.target.value) : null)}>{houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select> : <div className="premium-try-no-house-v102"><strong>You do not own a house yet.</strong><span>Create a Grocery Home first, then come back and choose your free premium experience.</span><Link className="primary center-link" to="/houses">Create a house</Link></div>}
        </section>

        <section className="premium-try-picker-v102">
          <header><p className="eyebrow">2 • CHOOSE ONE EXPERIENCE</p><h2>Which premium problem should GHM solve for you once?</h2><p>Choose based on the result you want—not the plan name.</p></header>
          {(Object.entries(groups) as [string, PremiumTryChoice[]][]).map(([group, choices]) => <div className="premium-try-group-v102" key={group}>
            <h3>{group}</h3>
            <div className="premium-try-grid-v102">{choices.map((choice) => {
              const selected = draftFeature === choice.key;
              const saved = status.selected_feature === choice.key;
              return <button type="button" key={choice.key} className={`premium-try-choice-v102 ${selected ? 'selected' : ''}`} onClick={() => setDraftFeature(choice.key)}>
                <span className="premium-try-choice-icon-v102" aria-hidden="true">{choice.icon}</span>
                <div><small>{planLabels[choice.min_plan] || choice.upgrade_label}</small><strong>{choice.label}</strong><p>{choice.description}</p></div>
                <em>{saved ? 'Selected' : selected ? 'Choose this' : 'Select'}</em>
              </button>;
            })}</div>
          </div>)}
        </section>

        <section className="premium-try-confirm-v102">
          <div className="premium-try-confirm-copy-v102">
            <span className="premium-try-choice-icon-v102" aria-hidden="true">{draftChoice?.icon || '✨'}</span>
            <div><small>{savedChoice && !selectionChanged ? 'YOUR SELECTED FREE TRY' : 'READY TO SELECT'}</small><strong>{draftChoice?.label || 'Choose a feature above'}</strong><p>{draftChoice ? `Use it successfully once for free. Repeating it later requires ${draftChoice.upgrade_label} or higher.` : 'Pick the premium experience that would be most useful to your household.'}</p></div>
          </div>
          <div className="premium-try-actions-v102">
            {selectionChanged || !status.selected_feature ? <button className="primary" type="button" disabled={busy || !draftFeature || !selectedHouseId} onClick={saveSelection}>{busy ? 'Saving…' : status.selected_feature ? 'Change my selection' : 'Select this free try'}</button> : null}
            {status.selected_feature && !selectionChanged ? <button className="orange-button" type="button" disabled={!selectedHouseId} onClick={continueToFeature}>Use {status.selected_label || 'my free try'} →</button> : null}
          </div>
        </section>
      </>
    )}

    <section className="premium-try-faq-v102">
      <article><span>🔒</span><div><strong>No surprise subscription</strong><p>GHM never starts a paid plan because you use the free experience.</p></div></article>
      <article><span>↺</span><div><strong>One successful use</strong><p>The opportunity stays available until your selected workflow completes successfully.</p></div></article>
      <article><span>↔</span><div><strong>Change before use</strong><p>Selected the wrong feature? Pick another one before the free experience is consumed.</p></div></article>
    </section>
  </main>;
}
