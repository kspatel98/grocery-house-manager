import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, BasketComparison, House, SavingsSummary, ShoppingList, WeeklyAssistant } from '../types';

export default function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<number | null>(null);
  const [assistant, setAssistant] = useState<WeeklyAssistant | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [basket, setBasket] = useState<BasketComparison | null>(null);
  const [busy, setBusy] = useState(false);
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
      if (assistantRes.data.active_list_id) {
        try {
          const { data } = await api.get<BasketComparison>(`/insights/houses/${selected}/shopping-lists/${assistantRes.data.active_list_id}/basket-comparison`, { params: { t: Date.now() } });
          setBasket(data);
        } catch {
          setBasket(null);
        }
      } else {
        setBasket(null);
      }
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
              <div className="assistant-card-heading"><span>💰</span><div><p className="eyebrow">Real recorded data</p><h2>Money saved</h2></div></div>
              {savings ? (
                <>
                  <div className="assistant-money-number">{money(savings.estimated_savings, savings.currency_code)}</div>
                  <div className="assistant-money-breakdown">
                    <span><strong>{money(savings.receipt_discounts, savings.currency_code)}</strong><small>receipt discounts</small></span>
                    <span><strong>{money(savings.lower_price_choices, savings.currency_code)}</strong><small>lower-price choices</small></span>
                    <span><strong>{money(savings.plan_monthly_cost, savings.currency_code)}</strong><small>monthly plan value</small></span>
                  </div>
                  <p className="small-muted">{savings.message}</p>
                  {savings.roi_multiple ? <div className="assistant-roi">Tracked savings are {savings.roi_multiple}× the monthly plan price.</div> : null}
                </>
              ) : <p>Save receipts and completed shopping prices to build your savings history.</p>}
              <Link to="/reports" className="secondary center-link full">Open savings report</Link>
            </article>
          </section>

          <section className="assistant-basket-hero">
            <div className="assistant-basket-copy">
              <p className="eyebrow">Whole-list comparison</p>
              <h2>{assistant.active_list_title || 'Create a list to compare the whole trip'}</h2>
              {basket?.premium_required ? (
                <><p>{basket.message}</p><Link to="/pricing" className="primary center-link">Unlock with Family Plus</Link></>
              ) : basket?.best_single_store ? (
                <>
                  <p>Based on your saved household price history, the strongest single-store estimate is:</p>
                  <div className="assistant-best-store"><span>{basket.best_single_store.store_name}</span><strong>{money(basket.best_single_store.estimated_total, basket.currency_code)}</strong><small>{basket.best_single_store.coverage_percent}% direct price coverage</small></div>
                </>
              ) : <p>{basket?.message || 'Once this list has saved price history, the assistant will compare the entire basket instead of making you search item by item.'}</p>}
            </div>
            {basket && !basket.premium_required && basket.store_options.length ? (
              <div className="assistant-store-ranking">
                {basket.store_options.slice(0, 4).map((store, index) => (
                  <div key={store.store_name} className={index === 0 ? 'winner' : ''}>
                    <span>#{index + 1} {store.store_name}</span>
                    <strong>{money(store.estimated_total, basket.currency_code)}</strong>
                    <small>{store.coverage_percent}% known • {store.missing_items.length} estimated</small>
                  </div>
                ))}
                {basket.split_store_total != null ? <div className="split-store-line"><span>Best 2-store option{basket.split_store_names.length ? ` • ${basket.split_store_names.join(' + ')}` : ''}</span><strong>{money(basket.split_store_total, basket.currency_code)}</strong><small>{basket.split_store_coverage_percent}% direct coverage • {basket.split_store_savings ? `could save another ${money(basket.split_store_savings, basket.currency_code)}` : 'single-store choice is already competitive'}</small></div> : null}
              </div>
            ) : null}
          </section>

          <section className="assistant-secondary-grid">
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

            <article className="panel">
              <p className="eyebrow">Cook from what you own</p>
              <h2>Inventory meal ideas</h2>
              <div className="assistant-recipe-list">
                {assistant.recipes.map((recipe) => (
                  <div key={recipe.name}>
                    <strong>{recipe.name}</strong>
                    <p>{recipe.reason}</p>
                    <small>Have: {recipe.matched_items.join(', ') || '—'}{recipe.missing_items.length ? ` • Optional: ${recipe.missing_items.join(', ')}` : ''}</small>
                  </div>
                ))}
                {!assistant.recipes.length ? <p className="small-muted">Add a few common groceries and meal ideas will appear from what is already in stock.</p> : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
