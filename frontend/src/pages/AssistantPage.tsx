import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, House, RecipeMissingAddResponse, SavingsSummary, ShoppingList, WeeklyAssistant, WeeklyAssistantRecipe } from '../types';

export default function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<number | null>(null);
  const [assistant, setAssistant] = useState<WeeklyAssistant | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
    const urgent = brief.out_of_stock.length + brief.low_stock.length + brief.expiring_soon.length;
    if (!urgent) return;
    const key = `ghm_smart_reminder_${selected}`;
    const lastShown = Number(localStorage.getItem(key) || 0);
    if (Date.now() - lastShown < 20 * 60 * 60 * 1000) return;
    const body = `${urgent} item${urgent === 1 ? '' : 's'} need attention in ${brief.house_name}. Open your weekly brief to prepare the next trip.`;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('Grocery House Manager', {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `ghm-household-${selected}`,
          data: { url: `/assistant?house=${selected}` },
        });
      } else {
        new Notification('Grocery House Manager', { body, icon: '/icon-192.png' });
      }
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Reminders are optional; never block the assistant if the browser refuses one.
    }
  }

  async function enableReminders() {
    if (typeof Notification === 'undefined') {
      setReminderPermission('unsupported');
      setMessage('This browser does not support web-app notifications. The weekly brief still works normally.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setReminderPermission(permission);
      if (permission === 'granted') {
        localStorage.setItem('ghm_smart_reminders', '1');
        setMessage('Smart household reminders are enabled on this device.');
        if (houseId && assistant) await maybeShowHouseholdReminder(houseId, assistant);
      } else if (permission === 'denied') {
        localStorage.removeItem('ghm_smart_reminders');
        setMessage('Notifications are blocked for this site. You can change that later in your browser or phone settings.');
      }
    } catch {
      setMessage('This browser could not enable notifications. The weekly brief still works normally.');
    }
  }

  async function loadAssistant(selected: number) {
    try {
      setBusy(true);
      setError('');
      const [assistantRes, savingsRes] = await Promise.all([
        api.get<WeeklyAssistant>(`/insights/houses/${selected}/weekly-assistant`, { params: { t: Date.now() } }),
        api.get<SavingsSummary>(`/insights/houses/${selected}/savings`, { params: { t: Date.now() } }),
      ]);
      setAssistant(assistantRes.data);
      setSavings(savingsRes.data);
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
    loadAssistant(houseId);
  }, [houseId]);

  const selectedHouse = houses.find((row) => row.id === houseId) || null;
  const attentionCount = (assistant?.low_stock.length || 0) + (assistant?.out_of_stock.length || 0) + (assistant?.expiring_soon.length || 0);
  const statusLabel = useMemo(() => {
    if (!assistant) return 'Building your household brief';
    if (assistant.out_of_stock.length) return 'A few essentials need attention';
    if (assistant.expiring_soon.length) return 'Use-soon items are waiting';
    if (assistant.low_stock.length) return 'Your next trip can be prepared';
    return 'Your household looks organized';
  }, [assistant]);

  const todayFocus = useMemo(() => {
    if (!assistant || !houseId) return null;
    if (assistant.expired.length) return {
      icon: '⚠️',
      label: 'FIRST PRIORITY',
      title: `Review ${assistant.expired.length} expired item${assistant.expired.length === 1 ? '' : 's'}`,
      copy: `${assistant.expired.slice(0, 3).join(', ')}${assistant.expired.length > 3 ? ' and more' : ''} should be checked before use.`,
      action: 'inventory' as const,
      cta: 'Review inventory',
    };
    if (assistant.expiring_soon.length) return {
      icon: '⏳',
      label: 'USE WHAT YOU OWN',
      title: `Use ${assistant.expiring_soon.length} item${assistant.expiring_soon.length === 1 ? '' : 's'} soon`,
      copy: `${assistant.expiring_soon.slice(0, 3).join(', ')}${assistant.expiring_soon.length > 3 ? ' and more' : ''}. Meal ideas below prioritize ingredients that should be used soon.`,
      action: 'meals' as const,
      cta: 'See meal ideas',
    };
    if (assistant.suggested_items.length) return {
      icon: '🛒',
      label: 'PREPARE YOUR NEXT TRIP',
      title: `${assistant.suggested_items.length} item${assistant.suggested_items.length === 1 ? '' : 's'} likely need restocking`,
      copy: 'Add them to your current list automatically instead of checking inventory one item at a time.',
      action: 'suggestions' as const,
      cta: assistant.active_list_id ? 'Add to shopping list' : 'Create my shopping list',
    };
    if (assistant.active_list_items) return {
      icon: '✓',
      label: 'READY WHEN YOU ARE',
      title: `${assistant.active_list_items} item${assistant.active_list_items === 1 ? '' : 's'} ready for your next shop`,
      copy: 'Open Shopping for the one-handed checklist and automatic trip-price recommendation.',
      action: 'shopping' as const,
      cta: 'Start shopping',
    };
    const readyMeal = assistant.recipes.find((recipe) => recipe.status === 'ready');
    if (readyMeal) return {
      icon: '🍽️',
      label: 'ALL CLEAR',
      title: `You can make ${readyMeal.name} from what you own`,
      copy: 'Nothing urgent needs attention. Use what you already have before adding more groceries.',
      action: 'meals' as const,
      cta: 'See meal idea',
    };
    return {
      icon: '✨',
      label: 'ALL CLEAR',
      title: 'Your Grocery Home looks organized',
      copy: 'Nothing urgent stands out right now. Keep using the app normally and this brief will update automatically.',
      action: 'inventory' as const,
      cta: 'Review inventory',
    };
  }, [assistant, houseId]);

  async function addSuggestedItems() {
    if (!houseId || !assistant?.suggested_items.length) return;
    try {
      setBusy(true);
      setMessage('');
      const items = assistant.suggested_items.map((item) => ({
        product_id: item.product_id,
        requested_quantity: item.requested_quantity || 1,
        bought_quantity: item.requested_quantity || 1,
        message: `Smart assistant: ${item.reason}`,
      }));
      let updated: ShoppingList;
      if (assistant.active_list_id) {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${assistant.active_list_id}/items`, { items });
        updated = data;
        setMessage(`${items.length} suggested item${items.length === 1 ? '' : 's'} added to ${updated.title}.`);
      } else {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists`, { title: 'Smart weekly shopping', items });
        updated = data;
        setMessage(`Created ${updated.title} with ${items.length} suggested item${items.length === 1 ? '' : 's'}.`);
      }
      await loadAssistant(houseId);
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
      await loadAssistant(houseId);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRecipeBusy('');
    }
  }

  return (
    <main className="page shell wide assistant-page cinematic-page">
      <header className="assistant-hero">
        <div>
          <p className="eyebrow">Smart Weekly Grocery Assistant</p>
          <h1>Know what you have, what you need, and where your money is going.</h1>
          <p>{statusLabel}. This page turns your real inventory, shopping lists, receipts, expiry dates, and saved prices into one simple weekly brief.</p>
          <div className="assistant-hero-actions">
            {houseId ? <Link to={`/houses/${houseId}/shopping`} className="primary center-link">Open shopping list</Link> : null}
            {houseId ? <Link to={`/houses/${houseId}/inventory`} className="secondary center-link">Review inventory</Link> : null}
            {reminderPermission === 'default' ? <button type="button" className="assistant-reminder-button" onClick={enableReminders}>🔔 Enable device reminders</button> : null}
            {reminderPermission === 'granted' ? <span className="assistant-reminder-status">✓ Device reminders on</span> : null}
            {reminderPermission === 'denied' ? <span className="assistant-reminder-status muted">Notifications blocked in browser settings</span> : null}
          </div>
        </div>
        <div className="assistant-score-card">
          <span>THIS WEEK</span>
          <strong>{attentionCount}</strong>
          <small>items need attention</small>
          <em>{savings ? `${money(savings.estimated_savings, savings.currency_code)} estimated savings tracked` : 'Savings build from real data'}</em>
        </div>
      </header>

      <section className="assistant-house-switcher">
        <label>
          Household
          <select value={houseId || ''} onChange={(event) => setHouseId(Number(event.target.value))} disabled={!houses.length}>
            {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => houseId && loadAssistant(houseId)} disabled={!houseId || busy}>{busy ? 'Refreshing…' : 'Refresh brief'}</button>
      </section>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {!houses.length && !error ? <section className="panel empty-state"><h2>Create your first free house</h2><p>The assistant becomes useful as soon as you add a few groceries.</p><Link to="/houses" className="primary center-link">Start setup</Link></section> : null}

      {assistant && selectedHouse ? (
        <>
          {todayFocus ? (
            <section className="assistant-today-focus" aria-label="What should I do today?">
              <span className="assistant-today-icon" aria-hidden="true">{todayFocus.icon}</span>
              <div>
                <p className="eyebrow">What should I do today? • {todayFocus.label}</p>
                <h2>{todayFocus.title}</h2>
                <p>{todayFocus.copy}</p>
              </div>
              {todayFocus.action === 'suggestions' ? (
                <button type="button" className="primary" disabled={busy} onClick={addSuggestedItems}>{busy ? 'Updating…' : todayFocus.cta}</button>
              ) : todayFocus.action === 'meals' ? (
                <a href="#meal-ideas" className="primary center-link">{todayFocus.cta}</a>
              ) : todayFocus.action === 'shopping' ? (
                <Link to={`/houses/${houseId}/shopping`} className="primary center-link">{todayFocus.cta}</Link>
              ) : (
                <Link to={`/houses/${houseId}/inventory`} className="primary center-link">{todayFocus.cta}</Link>
              )}
            </section>
          ) : null}

          <section className="assistant-command-grid">
            <article className="assistant-command-card needs-card">
              <div className="assistant-card-heading"><span>🛒</span><div><p className="eyebrow">Next trip</p><h2>Likely needed</h2></div></div>
              <p>{assistant.message}</p>
              <div className="assistant-chip-cloud">
                {assistant.suggested_items.map((item) => <span key={item.product_id} className="assistant-chip"><strong>{item.product_name}</strong><small>{item.reason}</small></span>)}
                {!assistant.suggested_items.length ? <span className="assistant-empty-line">Nothing new needs to be added right now.</span> : null}
              </div>
              {assistant.suggested_items.length ? <button type="button" className="primary full" disabled={busy} onClick={addSuggestedItems}>{assistant.active_list_id ? `Add ${assistant.suggested_items.length} to ${assistant.active_list_title || 'current list'}` : 'Create smart shopping list'}</button> : null}
            </article>

            <article className="assistant-command-card use-soon-card">
              <div className="assistant-card-heading"><span>⏳</span><div><p className="eyebrow">Waste prevention</p><h2>Use soon</h2></div></div>
              <div className="attention-list">
                {assistant.expiring_soon.map((name) => <span key={name}><strong>{name}</strong><small>Expiring within 5 days</small></span>)}
                {assistant.expired.map((name) => <span className="danger-row" key={name}><strong>{name}</strong><small>Expired — review before using</small></span>)}
                {!assistant.expiring_soon.length && !assistant.expired.length ? <p className="small-muted">No dated inventory needs urgent attention.</p> : null}
              </div>
              <Link to={`/houses/${houseId}/inventory`} className="secondary center-link full">Review dates</Link>
            </article>

            <article className="assistant-command-card savings-card">
              <div className="assistant-card-heading"><span>💰</span><div><p className="eyebrow">From your receipts & shopping</p><h2>Money saved</h2></div></div>
              {savings ? (
                <>
                  <div className="assistant-money-number">{money(savings.estimated_savings, savings.currency_code)}</div>
                  <div className="assistant-money-breakdown">
                    <span><strong>{money(savings.receipt_discounts, savings.currency_code)}</strong><small>receipt discounts</small></span>
                    <span><strong>{money(savings.lower_price_choices, savings.currency_code)}</strong><small>cheaper choices you made</small></span>
                    <span><strong>{money(savings.plan_monthly_cost, savings.currency_code)}</strong><small>monthly plan value</small></span>
                  </div>
                  <p className="small-muted">{savings.message}</p>
                  {savings.roi_multiple ? <div className="assistant-roi">Tracked savings are {savings.roi_multiple}× the monthly plan price.</div> : null}
                </>
              ) : <p>Save receipts and completed shopping prices to build your savings history.</p>}
              <Link to="/reports" className="secondary center-link full">Open savings report</Link>
            </article>
          </section>

          <section className="assistant-next-trip-strip">
            <div>
              <p className="eyebrow">Your next grocery trip</p>
              <h2>{assistant.active_list_title || 'Create a list and let the app prepare the trip'}</h2>
              {assistant.active_list_id ? (
                assistant.best_store_name ? (
                  <p><strong>{assistant.best_store_name}</strong> is the best store we know from your saved shopping data right now. Open the list and Grocery House Manager will automatically check current Canadian prices first, then recent receipts and older saved prices when needed.</p>
                ) : (
                  <p>Your list is ready. Open it and the full price check will run automatically — no extra setup step and no duplicate comparison panel here.</p>
                )
              ) : <p>Once you create a list, this assistant will hand it off to the shopping page for automatic store comparison.</p>}
            </div>
            {assistant.active_list_id ? <Link to={`/houses/${houseId}/shopping`} className="primary center-link">Open trip recommendation →</Link> : <Link to={`/houses/${houseId}/shopping`} className="secondary center-link">Create shopping list</Link>}
          </section>

          <section className="assistant-secondary-grid" id="meal-ideas">
            <article className="panel">
              <p className="eyebrow">Inventory pulse</p>
              <h2>What needs attention</h2>
              <div className="inventory-pulse-grid">
                <span><strong>{assistant.out_of_stock.length}</strong><small>out of stock</small></span>
                <span><strong>{assistant.low_stock.length}</strong><small>low stock</small></span>
                <span><strong>{assistant.expiring_soon.length}</strong><small>expiring soon</small></span>
                <span><strong>{assistant.active_list_items}</strong><small>list items</small></span>
              </div>
              {assistant.long_held.length ? (
                <div className="assistant-long-held">
                  <strong>In stock 60+ days since last recorded purchase</strong>
                  <p>{assistant.long_held.join(', ')}</p>
                  <small>This does not mean the food is unsafe or unused; it is simply a prompt to review older inventory.</small>
                </div>
              ) : null}
            </article>

            <article className="panel meal-ideas-panel">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">Cook from what you own</p>
                  <h2>Meal ideas from groceries already at home</h2>
                </div>
                <span className="badge">Automatic matching</span>
              </div>
              <p className="small-muted">No setup needed. Grocery House Manager understands common grocery names automatically, avoids expired items, and prioritizes foods that should be used soon.</p>
              <div className="assistant-recipe-list upgraded-recipes">
                {assistant.recipes.map((recipe) => (
                  <div key={recipe.name} className={`meal-idea-card ${recipe.status}`}>
                    <div className="meal-idea-heading">
                      <span className={recipe.status === 'ready' ? 'meal-status ready' : 'meal-status almost'}>{recipe.status === 'ready' ? '✓ CAN MAKE NOW' : '＋ ALMOST READY'}</span>
                      <strong>{recipe.name}</strong>
                    </div>
                    <p>{recipe.reason}</p>
                    {recipe.matched_items.length ? <small><b>Using:</b> {recipe.matched_items.slice(0, 7).join(', ')}</small> : null}
                    {recipe.use_soon_items.length ? <small className="use-soon-recipe-note">⏳ Helps use soon: {recipe.use_soon_items.join(', ')}</small> : null}
                    {recipe.missing_items.length ? (
                      <div className="meal-missing-action">
                        <span>Missing: <strong>{recipe.missing_items.join(', ')}</strong></span>
                        {recipe.missing_on_list.length === recipe.missing_items.length ? (
                          <span className="meal-on-list">✓ Already on {assistant.active_list_title || 'shopping list'}</span>
                        ) : (
                          <button type="button" className="secondary" disabled={Boolean(recipeBusy)} onClick={() => addRecipeMissing(recipe)}>{recipeBusy === recipe.name ? 'Adding…' : `Add to ${assistant.active_list_title || 'shopping list'}`}</button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!assistant.recipes.length ? (
                  <div className="meal-empty-help">
                    <strong>No strong meal match yet</strong>
                    <p>You do not need to configure anything. Keep adding or scanning normal grocery names and suggestions will appear automatically when the inventory contains a usable combination.</p>
                    <Link to={`/houses/${houseId}/inventory`} className="secondary center-link">Review inventory</Link>
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
