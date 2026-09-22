import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type {
  AccountBootstrap,
  AutopilotOverview,
  House,
  HouseholdPlan,
  KitchenCheck,
  RecipeMissingAddResponse,
  ReceiptGuardianIssue,
  ShoppingList,
  WeeklyAssistant,
  WeeklyAssistantRecipe,
} from '../types';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextDayNames(count: number) {
  const start = new Date();
  return Array.from({ length: count }, (_, index) => dayNames[(start.getDay() + index) % 7]);
}

export default function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<number | null>(null);
  const [assistant, setAssistant] = useState<WeeklyAssistant | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [planDays, setPlanDays] = useState(5);
  const [defaultServings, setDefaultServings] = useState(4);
  const [budget, setBudget] = useState('');
  const [skipDays, setSkipDays] = useState<string[]>([]);
  const [servingOverrides, setServingOverrides] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<HouseholdPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [kitchenCheck, setKitchenCheck] = useState<KitchenCheck | null>(null);
  const [communityPriceBusy, setCommunityPriceBusy] = useState(false);
  const kitchenInputRef = useRef<HTMLInputElement | null>(null);
  const [reminderPermission, setReminderPermission] = useState<'unsupported' | NotificationPermission>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  async function loadHouses() {
    try {
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      const list = data.houses || [];
      setHouses(list);
      const requested = Number(params.get('house'));
      const selected = list.find((row) => row.id === requested)?.id || list[0]?.id || null;
      setHouseId(selected);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function maybeShowHouseholdReminder(selected: number, brief: WeeklyAssistant) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (localStorage.getItem('ghm_smart_reminders') !== '1') return;
    const urgent = brief.out_of_stock.length + brief.low_stock.length + brief.expiring_soon.length + brief.expired.length;
    if (!urgent) return;
    const key = `ghm_autopilot_reminder_${selected}`;
    const lastShown = Number(localStorage.getItem(key) || 0);
    if (Date.now() - lastShown < 20 * 60 * 60 * 1000) return;
    const body = `${urgent} household item${urgent === 1 ? '' : 's'} need attention in ${brief.house_name}. Autopilot has prepared the next actions.`;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('GHM Autopilot', {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `ghm-autopilot-${selected}`,
          data: { url: `/assistant?house=${selected}` },
        });
      } else {
        new Notification('GHM Autopilot', { body, icon: '/icon-192.png' });
      }
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Device reminders are optional and must never block the household workspace.
    }
  }

  async function enableReminders() {
    if (typeof Notification === 'undefined') {
      setReminderPermission('unsupported');
      setMessage('This browser does not support web-app notifications. Autopilot still works normally.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setReminderPermission(permission);
      if (permission === 'granted') {
        localStorage.setItem('ghm_smart_reminders', '1');
        setMessage('Autopilot household reminders are enabled on this device.');
        if (houseId && assistant) await maybeShowHouseholdReminder(houseId, assistant);
      } else if (permission === 'denied') {
        localStorage.removeItem('ghm_smart_reminders');
        setMessage('Notifications are blocked for this site. You can change this later in browser or phone settings.');
      }
    } catch {
      setMessage('This browser could not enable notifications. Autopilot still works normally.');
    }
  }

  async function loadAutopilot(selected: number) {
    try {
      setBusy(true);
      setError('');
      const [assistantRes, autopilotRes] = await Promise.all([
        api.get<WeeklyAssistant>(`/insights/houses/${selected}/weekly-assistant`, { params: { t: Date.now() } }),
        api.get<AutopilotOverview>(`/insights/houses/${selected}/autopilot`, { params: { t: Date.now() } }),
      ]);
      setAssistant(assistantRes.data);
      setAutopilot(autopilotRes.data);
      void maybeShowHouseholdReminder(selected, assistantRes.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadHouses(); }, []);
  useEffect(() => {
    if (!houseId) return;
    setParams({ house: String(houseId) }, { replace: true });
    setPlan(null);
    setKitchenCheck(null);
    loadAutopilot(houseId);
  }, [houseId]);

  const selectedHouse = houses.find((row) => row.id === houseId) || null;
  const visiblePlanDays = useMemo(() => nextDayNames(planDays), [planDays]);
  const controlPercent = Math.max(0, 100 - (autopilot?.attention_score || 0));

  async function addSuggestedItems() {
    if (!houseId || !assistant?.suggested_items.length) return;
    try {
      setBusy(true);
      setMessage('');
      const items = assistant.suggested_items.map((item) => ({
        product_id: item.product_id,
        requested_quantity: item.requested_quantity || 1,
        bought_quantity: item.requested_quantity || 1,
        message: `GHM Autopilot · ${item.reason}`,
      }));
      let updated: ShoppingList;
      if (assistant.active_list_id) {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${assistant.active_list_id}/items`, { items });
        updated = data;
        setMessage(`${items.length} restock suggestion${items.length === 1 ? '' : 's'} added to ${updated.title}.`);
      } else {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists`, { title: 'Autopilot grocery list', items });
        updated = data;
        setMessage(`Created ${updated.title} with ${items.length} household restock suggestion${items.length === 1 ? '' : 's'}.`);
      }
      await loadAutopilot(houseId);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addRecipeMissing(recipe: WeeklyAssistantRecipe) {
    if (!houseId || !recipe.missing_items.length) return;
    try {
      setRecipeBusy(recipe.name);
      setMessage('');
      setError('');
      const { data } = await api.post<RecipeMissingAddResponse>(`/insights/houses/${houseId}/recipes/add-missing`, {
        ingredients: recipe.missing_items,
        list_id: assistant?.active_list_id || undefined,
        recipe_name: recipe.name,
      });
      setMessage(data.message);
      await loadAutopilot(houseId);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRecipeBusy('');
    }
  }

  function toggleSkipDay(day: string) {
    setSkipDays((current) => current.includes(day) ? current.filter((row) => row !== day) : [...current, day]);
  }

  async function buildHouseholdPlan() {
    if (!houseId) return;
    try {
      setPlanBusy(true);
      setError('');
      const { data } = await api.post<HouseholdPlan>(`/insights/houses/${houseId}/household-plan`, {
        days: planDays,
        default_servings: defaultServings,
        skip_days: skipDays,
        guest_servings: servingOverrides,
        budget: budget.trim() ? Number(budget) : null,
      });
      setPlan(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPlanBusy(false);
    }
  }

  async function addPlanGroceries() {
    if (!houseId || !plan?.grocery_items.length) return;
    try {
      setPlanBusy(true);
      setMessage('');
      const chunks: string[][] = [];
      for (let index = 0; index < plan.grocery_items.length; index += 8) chunks.push(plan.grocery_items.slice(index, index + 8));
      let listId = assistant?.active_list_id || undefined;
      let listTitle = assistant?.active_list_title || 'Autopilot grocery list';
      for (const chunk of chunks) {
        const { data } = await api.post<RecipeMissingAddResponse>(`/insights/houses/${houseId}/recipes/add-missing`, {
          ingredients: chunk,
          list_id: listId,
          recipe_name: 'Autopilot weekly plan',
        });
        listId = data.list_id;
        listTitle = data.list_title;
      }
      setMessage(`${plan.grocery_items.length} planned ingredient${plan.grocery_items.length === 1 ? '' : 's'} are ready in ${listTitle}.`);
      await loadAutopilot(houseId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPlanBusy(false);
    }
  }

  async function runKitchenCheck() {
    if (!houseId) return;
    const files = Array.from(kitchenInputRef.current?.files || []);
    if (!files.length) {
      setError('Choose 1–4 fridge, freezer or pantry photos first.');
      return;
    }
    try {
      setKitchenBusy(true);
      setError('');
      const form = new FormData();
      files.slice(0, 4).forEach((file) => form.append('images', file));
      const { data } = await api.post<KitchenCheck>(`/insights/houses/${houseId}/kitchen-check`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setKitchenCheck(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKitchenBusy(false);
    }
  }

  async function copyReceiptInquiry(issue: ReceiptGuardianIssue) {
    const store = issue.store_name || 'the store';
    const purchaseDate = issue.receipt_date ? ` on ${issue.receipt_date}` : '';
    const item = issue.product_name ? ` for ${issue.product_name}` : '';
    const amount = issue.amount_to_review != null ? ` The amount I would like verified is ${money(issue.amount_to_review, autopilot?.currency_code)}.` : '';
    const text = `Hello, I am reviewing a receipt from ${store}${purchaseDate}${item}. ${issue.detail}${amount} Could you please verify whether the receipt was charged correctly? Thank you.`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage('A neutral store inquiry was copied. Review the receipt and promotion conditions before sending it.');
    } catch {
      setMessage(text);
    }
  }

  async function toggleCommunityPriceSharing() {
    if (!houseId || !autopilot || selectedHouse?.role !== 'owner') return;
    const nextEnabled = !autopilot.community_price_pulse.sharing_enabled;
    try {
      setCommunityPriceBusy(true);
      setError('');
      const { data } = await api.post(`/insights/houses/${houseId}/community-price-sharing`, { enabled: nextEnabled });
      setAutopilot((current) => current ? { ...current, community_price_pulse: data } : current);
      setHouses((current) => current.map((house) => house.id === houseId ? { ...house, contribute_community_prices: nextEnabled } : house));
      setMessage(nextEnabled
        ? 'Community Price Pulse is on. Future reviewed receipt prices can contribute privacy-protected local observations.'
        : 'Community Price Pulse sharing is off and this household’s prior contributions were removed.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCommunityPriceBusy(false);
    }
  }

  if (!houses.length && !busy && !error) {
    return (
      <main className="page shell wide autopilot-page cinematic-page">
        <section className="autopilot-empty panel">
          <span>🏡</span><div><p className="eyebrow">GHM AUTOPILOT</p><h1>Create or join a Grocery Home first</h1><p>Autopilot becomes useful as soon as the household has a few groceries, a list or a receipt.</p></div>
          <Link to="/houses" className="primary center-link">Set up my home</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page shell wide autopilot-page cinematic-page">
      <header className="autopilot-hero">
        <div className="autopilot-hero-copy">
          <div className="autopilot-kicker-row"><span className="autopilot-live-dot" /> <p className="eyebrow">GHM AUTOPILOT · HOUSEHOLD GROCERY CFO</p>{autopilot ? <Link to="/pricing" className={`autopilot-plan-chip plan-${autopilot.plan_key}`}>{autopilot.plan_key === 'pro' ? 'Household Pro' : autopilot.plan_key === 'family' ? 'Family Plus' : autopilot.plan_key === 'basic' ? 'Basic Home' : 'Free Starter'}</Link> : null}</div>
          <h1>{autopilot?.headline || 'Your household, one step ahead.'}</h1>
          <p>{autopilot?.subheadline || 'Building a plan from your inventory, receipts, shopping list, saved prices and expiry dates.'}</p>
          <div className="autopilot-hero-actions">
            {autopilot?.best_next_action_href ? <Link className="primary center-link" to={autopilot.best_next_action_href}>{autopilot.best_next_action} →</Link> : null}
            {reminderPermission === 'default' ? <button type="button" className="secondary" onClick={enableReminders}>🔔 Enable smart reminders</button> : null}
            {reminderPermission === 'granted' ? <span className="autopilot-reminder-on">✓ Reminders on</span> : null}
          </div>
        </div>
        <div className="autopilot-control-card" aria-label="Household control score">
          <div className="autopilot-ring" style={{ '--control': `${controlPercent}%` } as CSSProperties}><span><strong>{controlPercent}</strong><small>/100</small></span></div>
          <div><span>HOUSEHOLD CONTROL</span><strong>{controlPercent >= 85 ? 'Calm & ready' : controlPercent >= 60 ? 'A few actions' : 'Needs attention'}</strong><small>Based on stock, expiry, receipts and safety checks—not a financial or food-safety guarantee.</small></div>
        </div>
      </header>

      <section className="autopilot-toolbar">
        <label><span>Household</span><select value={houseId || ''} onChange={(event) => setHouseId(Number(event.target.value))}>{houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
        <button type="button" className="secondary" onClick={() => houseId && loadAutopilot(houseId)} disabled={!houseId || busy}>{busy ? 'Refreshing…' : '↻ Refresh intelligence'}</button>
        <nav className="autopilot-anchor-nav" aria-label="Autopilot sections"><a href="#today">Today</a><a href="#weekly-plan">This week</a><a href="#money">Money</a><a href="#protect">Protect</a></nav>
      </section>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section id="today" className="autopilot-metric-grid">
        <article className="autopilot-metric money"><span>💰</span><div><small>Verified savings · {autopilot?.savings_ledger.month_label || 'this month'}</small><strong>{money(autopilot?.verified_savings || 0, autopilot?.currency_code)}</strong><em>Evidence-backed only</em></div></article>
        <article className="autopilot-metric opportunity"><span>✨</span><div><small>Current opportunities</small><strong>{money(autopilot?.potential_savings || 0, autopilot?.currency_code)}</strong><em>Not counted as saved yet</em></div></article>
        <article className="autopilot-metric trip"><span>🛒</span><div><small>Next trip</small><strong>{autopilot?.active_list_items || 0} items</strong><em>{autopilot?.restock_items || 0} restock suggestions</em></div></article>
        <article className={`autopilot-metric protect ${(autopilot?.receipt_issues || 0) + (autopilot?.recall_matches || 0) ? 'attention' : ''}`}><span>🛡️</span><div><small>Protection checks</small><strong>{(autopilot?.receipt_issues || 0) + (autopilot?.recall_matches || 0)}</strong><em>receipt + recall signals</em></div></article>
      </section>

      <section className="autopilot-command-deck">
        <article className="autopilot-command primary-command">
          <div><p className="eyebrow">WHAT SHOULD I DO TODAY?</p><h2>{autopilot?.headline || 'Autopilot is building your next move'}</h2><p>{autopilot?.subheadline}</p></div>
          <div className="autopilot-command-facts">
            <span><strong>{autopilot?.expiring_items || 0}</strong><small>expiry actions</small></span>
            <span><strong>{autopilot?.restock_items || 0}</strong><small>restock actions</small></span>
            <span><strong>{autopilot?.receipt_issues || 0}</strong><small>receipt checks</small></span>
          </div>
          {autopilot?.best_next_action_href ? <Link to={autopilot.best_next_action_href} className="primary center-link full">{autopilot.best_next_action}</Link> : null}
        </article>

        <article className="autopilot-command restock-command">
          <div className="panel-title-row"><div><p className="eyebrow">PREDICTIVE RESTOCK</p><h2>Likely needed next</h2></div><span className="badge">Inventory-aware</span></div>
          <p>{assistant?.message}</p>
          <div className="autopilot-chip-cloud">
            {assistant?.suggested_items.slice(0, 6).map((item) => <span key={item.product_id}><strong>{item.product_name}</strong><small>{item.reason} · {item.requested_quantity}</small></span>)}
            {!assistant?.suggested_items.length ? <span className="autopilot-clear-chip">✓ Low-stock items are already covered.</span> : null}
          </div>
          {assistant?.suggested_items.length ? <button type="button" className="secondary full" onClick={addSuggestedItems} disabled={busy}>{assistant.active_list_id ? `Add ${assistant.suggested_items.length} to current list` : 'Create my smart list'}</button> : <Link to={`/houses/${houseId}/shopping`} className="secondary center-link full">Open shopping</Link>}
        </article>
      </section>

      <section id="weekly-plan" className="autopilot-section autopilot-week-section">
        <header className="autopilot-section-heading"><div><p className="eyebrow">LIFE-AWARE WEEKLY PLANNER + BUDGET RESCUE</p><h2>Tell us only what changed. Autopilot handles the groceries.</h2><p>Choose how many days you are planning, servings, days you are away, and an optional budget. The planner prioritizes food already at home and items that should be used soon.</p></div><span className="autopilot-feature-number">01</span></header>
        {autopilot?.planner_unlocked ? <div className="autopilot-plan-layout">
          <div className="autopilot-plan-controls">
            <div className="autopilot-control-grid">
              <label><span>Plan length</span><select value={planDays} onChange={(event) => { setPlanDays(Number(event.target.value)); setSkipDays([]); setServingOverrides({}); }}><option value={3}>3 days</option><option value={5}>5 days</option><option value={7}>7 days</option></select></label>
              <label><span>Default servings</span><input type="number" min={1} max={20} value={defaultServings} onChange={(event) => setDefaultServings(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label><span>Grocery budget <small>optional</small></span><input inputMode="decimal" placeholder="e.g. 75" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.]/g, ''))} /></label>
            </div>
            <div className="autopilot-day-editor">
              {visiblePlanDays.map((day) => {
                const skipped = skipDays.includes(day);
                return <div key={day} className={`autopilot-day-setting ${skipped ? 'skipped' : ''}`}><button type="button" onClick={() => toggleSkipDay(day)}><strong>{day.slice(0, 3)}</strong><small>{skipped ? 'Away / eating out' : 'Eating at home'}</small></button>{!skipped ? <label><span>Servings</span><input type="number" min={1} max={20} value={servingOverrides[day] || defaultServings} onChange={(event) => setServingOverrides((current) => ({ ...current, [day]: Math.max(1, Number(event.target.value) || defaultServings) }))} /></label> : null}</div>;
              })}
            </div>
            <button type="button" className="primary full autopilot-build-plan" onClick={buildHouseholdPlan} disabled={planBusy}>{planBusy ? 'Building from your household data…' : '✨ Build my week'}</button>
            <p className="autopilot-trust-note">No fake grocery prices: if an ingredient has no reliable saved price, it stays clearly marked as unpriced.</p>
          </div>

          <div className="autopilot-plan-result">
            {!plan ? <div className="autopilot-plan-placeholder"><span>🍲</span><h3>Your week will appear here</h3><p>Autopilot will use your real inventory, expiry dates and existing shopping list before asking you to buy more.</p></div> : <>
              <div className="autopilot-plan-summary"><div><small>Planned at home</small><strong>{plan.planned_days}/{plan.days_requested} days</strong></div><div><small>Known grocery cost</small><strong>{money(plan.known_grocery_cost, plan.currency_code)}</strong></div>{plan.budget != null ? <div className={(plan.known_budget_buffer || 0) >= 0 ? 'positive' : 'negative'}><small>Known budget buffer</small><strong>{money(plan.known_budget_buffer || 0, plan.currency_code)}</strong></div> : null}</div>
              <div className="autopilot-plan-days">{plan.days.map((day) => <article key={day.day_name} className={`autopilot-plan-day ${day.status}`}><header><span>{day.day_name.slice(0, 3)}</span><div><strong>{day.status === 'away' ? 'Away / eating out' : day.recipe_name || 'Open meal'}</strong><small>{day.status === 'meal' ? `${day.servings} servings` : day.reason}</small></div></header>{day.use_soon_items.length ? <p className="use-soon">⏳ Uses soon: {day.use_soon_items.join(', ')}</p> : null}{day.missing_items.length ? <p className="missing">🛒 Need: {day.missing_items.join(', ')}</p> : day.status === 'meal' ? <p className="ready">✓ Required ingredients already covered</p> : null}</article>)}</div>
              <div className="autopilot-plan-grocery"><div><strong>{plan.grocery_items.length ? `${plan.grocery_items.length} grocery item${plan.grocery_items.length === 1 ? '' : 's'} needed` : 'No missing ingredients for these matched meals'}</strong><small>{plan.message}</small></div>{plan.grocery_items.length ? <button type="button" className="primary" onClick={addPlanGroceries} disabled={planBusy}>Add plan to grocery list</button> : null}</div>
              {plan.unpriced_items.length ? <div className="autopilot-unpriced"><strong>Price still unknown</strong><span>{plan.unpriced_items.join(' · ')}</span><small>Autopilot refuses to guess these prices. A receipt, flyer or saved price will fill them later.</small></div> : null}
            </>}
          </div>
        </div> : <div className="autopilot-premium-lock autopilot-premium-lock-wide">
          <span className="autopilot-lock-icon">✨</span>
          <div><p className="eyebrow">FAMILY PLUS AUTOMATION</p><h3>Weekly Planner + Budget Rescue</h3><p>Family Plus turns your inventory, expiry dates, days at home, servings and known prices into a household plan without inventing unknown costs.</p><div className="autopilot-lock-points"><span>✓ Use-soon meal priority</span><span>✓ Away / eating-out days</span><span>✓ Budget-aware grocery gaps</span><span>✓ One-tap list creation</span></div></div>
          <Link to="/pricing" className="primary center-link">Unlock Family Plus →</Link>
        </div>}

        <div className="autopilot-meal-suggestions">
          <div className="panel-title-row"><div><p className="eyebrow">COOK FROM WHAT YOU OWN</p><h3>Strong inventory matches right now</h3></div><Link to={`/houses/${houseId}/meals`}>All meals & community recipes →</Link></div>
          <div className="autopilot-meal-grid">{assistant?.recipes.slice(0, 4).map((recipe) => <article key={recipe.name}><span className={recipe.status === 'ready' ? 'ready' : 'almost'}>{recipe.status === 'ready' ? '✓ READY' : '＋ ALMOST'}</span><strong>{recipe.name}</strong><p>{recipe.reason}</p>{recipe.use_soon_items.length ? <small>⏳ Use soon: {recipe.use_soon_items.join(', ')}</small> : null}{recipe.missing_items.length && recipe.missing_on_list.length !== recipe.missing_items.length ? <button type="button" className="secondary" disabled={Boolean(recipeBusy)} onClick={() => addRecipeMissing(recipe)}>{recipeBusy === recipe.name ? 'Adding…' : `Add ${recipe.missing_items.join(', ')}`}</button> : null}</article>)}</div>
        </div>
      </section>

      <section id="money" className="autopilot-section autopilot-money-section">
        <header className="autopilot-section-heading"><div><p className="eyebrow">HOUSEHOLD GROCERY CFO</p><h2>Don't just track spending. Decide before you spend.</h2><p>Automatic Trip Check remains inside Shopping where it belongs; Autopilot turns its price knowledge into decisions, stock-up opportunities and a defensible savings ledger.</p></div><span className="autopilot-feature-number">02</span></header>
        <div className="autopilot-money-grid">
          <article className="autopilot-trip-intel">
            <div className="autopilot-card-icon">🛒</div><p className="eyebrow">NEXT TRIP</p><h3>{assistant?.active_list_title || 'No active grocery list yet'}</h3>
            {assistant?.active_list_id ? <>{assistant.best_store_name ? <div className="autopilot-trip-best"><span>Best complete saved-price option</span><strong>{assistant.best_store_name}</strong>{assistant.best_store_total != null ? <b>{money(assistant.best_store_total, assistant.currency_code)}</b> : null}</div> : <p>Open Shopping and the Automatic Trip Check will use live Canadian prices first, then active flyers, recent receipts and saved prices.</p>}{assistant.potential_store_savings ? <div className="autopilot-save-pulse">Potential store difference <strong>{money(assistant.potential_store_savings, assistant.currency_code)}</strong></div> : null}<Link to={`/houses/${houseId}/shopping`} className="primary center-link full">Run Automatic Trip Check →</Link></> : <><p>Create a list and Autopilot will hand it to Shopping for whole-basket price intelligence.</p><Link to={`/houses/${houseId}/shopping`} className="secondary center-link full">Create grocery list</Link></>}
          </article>

          <article className="autopilot-stockup-card">
            <div className="panel-title-row"><div><p className="eyebrow">BUY 1 OR BUY MORE?</p><h3>Smart stock-up opportunities</h3></div><span className="badge">History-aware</span></div>
            {autopilot?.stock_up_unlocked ? <div className="autopilot-stockup-list">{autopilot.stock_up.slice(0, 4).map((item) => <div key={item.product_id}><div><strong>{item.product_name}</strong><small>{item.store_name || 'Saved price'} · {item.history_points} price observations</small></div><span><b>{money(item.current_price, autopilot.currency_code)}</b><small>typical {money(item.typical_price, autopilot.currency_code)}</small></span><em>-{item.discount_percent}%</em><p>{item.reason}</p><footer><strong>Consider {item.recommended_quantity}</strong><small>Potential value {money(item.potential_savings, autopilot.currency_code)} · {item.caution}</small></footer></div>)}{!autopilot.stock_up.length ? <div className="autopilot-empty-insight"><span>📉</span><strong>No high-confidence stock-up signal yet</strong><p>Autopilot waits for enough real purchase history and a meaningfully lower saved price instead of calling every sale a deal.</p></div> : null}</div> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Smart stock-up unlocks with Family Plus</strong><small>It waits for enough purchase history, compares the current saved price with your household's typical price, then suggests a conservative quantity.</small></div><Link to="/pricing">See Family Plus →</Link></div>}
          </article>

          <article className="autopilot-community-price-card">
            <div className="panel-title-row"><div><p className="eyebrow">COMMUNITY PRICE PULSE</p><h3>Let opted-in receipts strengthen local price decisions.</h3></div><span className={`badge ${autopilot?.community_price_pulse.sharing_enabled ? 'active' : ''}`}>{autopilot?.community_price_pulse.sharing_enabled ? 'Sharing on' : 'Private by default'}</span></div>
            <p>{autopilot?.community_price_pulse.message}</p>
            <div className="autopilot-community-stats"><span><strong>{autopilot?.community_price_pulse.recent_observations || 0}</strong><small>recent local observations</small></span><span><strong>{autopilot?.community_price_pulse.matched_list_items || 0}</strong><small>list items matched</small></span></div>
            <div className="autopilot-community-signals">{autopilot?.community_price_pulse.signals.slice(0, 5).map((signal) => <div key={`${signal.product_name}-${signal.store_name}`}><span><strong>{signal.product_name}</strong><small>{signal.store_name}{signal.city ? ` · ${signal.city}` : ''}</small></span><b>{money(signal.price, autopilot.currency_code)}</b><em>{signal.age_days === 0 ? 'today' : `${signal.age_days}d ago`} · {signal.observation_count} obs.</em></div>)}</div>
            <div className="autopilot-community-consent"><span>🔐</span><p><strong>Opt-in and revocable.</strong> Other users never receive your household or user identity. Only product, store, price, coarse city/country and date can enter the community signal. Turning sharing off deletes this house’s contributed observations.</p></div>
            {selectedHouse?.role === 'owner' ? <button type="button" className={autopilot?.community_price_pulse.sharing_enabled ? 'secondary full' : 'primary full'} onClick={toggleCommunityPriceSharing} disabled={communityPriceBusy}>{communityPriceBusy ? 'Updating privacy setting…' : autopilot?.community_price_pulse.sharing_enabled ? 'Stop sharing & remove my contributions' : 'Contribute future reviewed receipt prices'}</button> : <small className="autopilot-community-owner-note">Only the house owner can change this privacy setting.</small>}
          </article>
        </div>

        <article className="autopilot-ledger-card">
          <header><div><p className="eyebrow">GHM SAVINGS LEDGER</p><h3>Every dollar needs evidence.</h3><p>{autopilot?.savings_ledger.message}</p></div><div className="autopilot-ledger-totals"><span><small>Verified this month</small><strong>{money(autopilot?.savings_ledger.verified_total || 0, autopilot?.currency_code)}</strong></span><span><small>Open opportunities</small><strong>{money(autopilot?.savings_ledger.potential_total || 0, autopilot?.currency_code)}</strong></span></div></header>
          <div className="autopilot-ledger-list">{autopilot?.savings_ledger.entries.slice(0, 8).map((entry) => <div key={entry.key} className={entry.verified ? 'verified' : 'potential'}><span className="ledger-status">{entry.verified ? '✓' : '◇'}</span><div><strong>{entry.title}</strong><small>{entry.evidence}</small><em>{entry.source_label}{entry.occurred_on ? ` · ${entry.occurred_on}` : ''}</em></div><b>{entry.verified ? '+' : '~'}{money(entry.amount, autopilot.currency_code)}</b></div>)}{!autopilot?.savings_ledger.entries.length ? <div className="autopilot-empty-insight"><span>🧾</span><strong>Your proof starts with normal use</strong><p>Reviewed receipt discounts and completed shopping prices automatically become ledger evidence.</p></div> : null}</div>
          <Link to="/reports" className="secondary center-link">Open full reports & exports →</Link>
        </article>
      </section>

      <section id="protect" className="autopilot-section autopilot-protect-section">
        <header className="autopilot-section-heading"><div><p className="eyebrow">PROTECT THE HOUSEHOLD</p><h2>Check the things people normally notice too late.</h2><p>Receipt Guardian, official recall screening and Kitchen Check are deliberately conservative: they surface evidence to review rather than making unsafe or accusatory conclusions automatically.</p></div><span className="autopilot-feature-number">03</span></header>
        <div className="autopilot-protection-grid">
          <article id="receipt-guardian" className="autopilot-protection-card receipt-guardian-card">
            <header><div className="autopilot-card-icon">🧾</div><div><p className="eyebrow">RECEIPT GUARDIAN</p><h3>Did anything deserve a second look?</h3></div><span className={(autopilot?.receipt_guardian.issues.length || 0) ? 'guardian-count attention' : 'guardian-count'}>{autopilot?.receipt_guardian.issues.length || 0}</span></header>
            {autopilot?.receipt_guardian_unlocked ? <><p>{autopilot.receipt_guardian.message}</p>
            <div className="guardian-issue-list">{autopilot.receipt_guardian.issues.slice(0, 5).map((issue) => <div key={issue.key} className={issue.severity}><span>{issue.issue_type === 'possible_duplicate' ? '⧉' : issue.issue_type === 'line_math' ? '∑' : '↗'}</span><div><strong>{issue.title}</strong><small>{issue.receipt_label}{issue.product_name ? ` · ${issue.product_name}` : ''}</small><p>{issue.detail}</p></div>{issue.amount_to_review != null ? <b>{money(issue.amount_to_review, autopilot.currency_code)}<small>to review</small></b> : null}<button type="button" className="guardian-copy" onClick={() => copyReceiptInquiry(issue)}>Copy inquiry</button></div>)}</div>
            <Link to={`/houses/${houseId}/receipts`} className="secondary center-link full">Open original receipts</Link></> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Receipt Guardian unlocks with Basic Home</strong><small>It reviews recent scanned receipt lines for possible duplicates, line-math inconsistencies and unusual price jumps. Signals are always presented as items to verify—not accusations.</small></div><Link to="/pricing">See Basic Home →</Link></div>}
          </article>

          <article id="recall-guardian" className="autopilot-protection-card recall-guardian-card">
            <header><div className="autopilot-card-icon">🛡️</div><div><p className="eyebrow">FOOD RECALL GUARDIAN</p><h3>Official-alert screening for what you own</h3></div><span className={(autopilot?.recall_guardian.matches.length || 0) ? 'guardian-count danger' : 'guardian-count'}>{autopilot?.recall_guardian.matches.length || 0}</span></header>
            <p>{autopilot?.recall_guardian.message}</p>
            <div className="recall-match-list">{autopilot?.recall_guardian.matches.map((match) => <a href={match.alert_url} target="_blank" rel="noreferrer" key={`${match.product_id}-${match.alert_url}`}><span>⚠️</span><div><strong>{match.product_name}</strong><small>{match.alert_title}</small><em>{match.match_reason} · Verify UPC/lot/size</em></div><b>Official notice ↗</b></a>)}{autopilot?.recall_guardian.available && !autopilot.recall_guardian.matches.length ? <div className="autopilot-safety-clear"><span>✓</span><div><strong>No likely match found</strong><small>{autopilot.recall_guardian.checked_products} in-stock products screened against the current Government of Canada food-alert feed.</small></div></div> : null}{autopilot && !autopilot.recall_guardian.available ? <div className="autopilot-empty-insight"><span>↻</span><strong>Official feed temporarily unavailable</strong><p>Use the Government of Canada source link if you need to check immediately.</p></div> : null}</div>
            <a className="secondary center-link full" href={autopilot?.recall_guardian.source_url || 'https://recalls-rappels.canada.ca/en'} target="_blank" rel="noreferrer">Government of Canada recalls ↗</a>
          </article>

          <article className="autopilot-protection-card kitchen-check-card">
            <header><div className="autopilot-card-icon">📷</div><div><p className="eyebrow">KITCHEN CHECK · BETA</p><h3>Reconcile the fridge or pantry in a few photos</h3></div><span className="badge">Label recognition</span></header>
            {autopilot?.kitchen_check_unlocked ? <><p>Take 1–4 clear photos where package labels are visible. The current beta uses server-side OCR to confirm readable product names, brands and stored barcodes against your inventory; it never deletes an item automatically.</p>
            <input ref={kitchenInputRef} className="autopilot-camera-input" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple />
            <button className="primary full" type="button" onClick={runKitchenCheck} disabled={kitchenBusy}>{kitchenBusy ? 'Reading visible package labels…' : '📷 Run Kitchen Check'}</button>
            {kitchenCheck ? <div className="kitchen-check-result"><div className="kitchen-check-summary"><span><strong>{kitchenCheck.label_confirmed.length}</strong><small>label-confirmed</small></span><span><strong>{kitchenCheck.needs_review.length}</strong><small>not confirmed</small></span><span><strong>{kitchenCheck.images_checked}</strong><small>photos read</small></span></div>{kitchenCheck.label_confirmed.length ? <div><strong>Visible label matches</strong><p>{kitchenCheck.label_confirmed.join(' · ')}</p></div> : null}{kitchenCheck.needs_review.length ? <div><strong>Quick review list</strong><p>{kitchenCheck.needs_review.slice(0, 14).join(' · ')}</p></div> : null}<small>{kitchenCheck.message}</small></div> : null}</> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Kitchen Check Beta is a Household Pro tool</strong><small>Use fridge, freezer or pantry photos to reconcile readable package labels against expected inventory. It intentionally asks you to review uncertain items.</small></div><Link to="/pricing">See Household Pro →</Link></div>}
          </article>
        </div>
      </section>

      <section className="autopilot-connected-flow">
        <div><p className="eyebrow">ONE INTELLIGENCE · EXISTING WORKFLOWS</p><h2>Autopilot doesn't replace the app. It connects it.</h2></div>
        <nav><Link to={`/houses/${houseId}/inventory`}><span>📦</span><strong>Inventory</strong><small>What you own</small></Link><i>→</i><Link to={`/houses/${houseId}/meals`}><span>🍲</span><strong>Meals</strong><small>What to use</small></Link><i>→</i><Link to={`/houses/${houseId}/shopping`}><span>🛒</span><strong>Shopping</strong><small>What & where to buy</small></Link><i>→</i><Link to={`/houses/${houseId}/scan`}><span>🧾</span><strong>Receipts</strong><small>What actually happened</small></Link><i>→</i><Link to="/reports"><span>📈</span><strong>Ledger</strong><small>What value was proven</small></Link></nav>
      </section>

      {selectedHouse ? <p className="autopilot-footer-note">Autopilot for <strong>{selectedHouse.name}</strong> uses household data you have chosen to save in Grocery House Manager. Price, recall and receipt signals are decision support and should be verified when they affect safety, refunds or purchasing decisions.</p> : null}
    </main>
  );
}
