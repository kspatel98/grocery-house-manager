import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, BasketComparison, House, HouseMember, Plan, Product, Section, ShoppingList, ShoppingSuggestions, Subscription, User } from '../types';
import ShoppingListPanel from '../components/ShoppingListPanel';
import { ActivityFeed, HouseMembersBar, MembersDrawer } from '../components/HouseInfoPanels';
import { money } from '../currency';

const SHOPPING_PRODUCT_LIMIT = 80;

export default function ShoppingPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const [house, setHouse] = useState<House | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [housePlan, setHousePlan] = useState<Plan | null>(null);
  const [sortBy, setSortBy] = useState('store_name');
  const [direction, setDirection] = useState('asc');
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [offlineFallback, setOfflineFallback] = useState(false);
  const currentUser: User | null = JSON.parse(localStorage.getItem('user') || 'null');

  async function loadAll() {
    try {
      const [houseRes, sectionsRes, productsRes, listsRes, membersRes, activitiesRes, subscriptionRes, housePlanRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, limit: SHOPPING_PRODUCT_LIMIT } }),
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 20 } }),
        api.get<Subscription>('/billing/me'),
        api.get<Plan>(`/houses/${id}/plan`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
      setProducts(productsRes.data);
      setActiveLists(listsRes.data);
      setMembers(membersRes.data);
      setActivities(activitiesRes.data);
      setSubscription(subscriptionRes.data);
      setHousePlan(housePlanRes.data);
      setOfflineFallback(false);
      localStorage.setItem(`ghm_offline_shopping_${id}`, JSON.stringify({
        saved_at: new Date().toISOString(),
        house: houseRes.data,
        sections: sectionsRes.data,
        products: productsRes.data,
        lists: listsRes.data,
      }));
      setError('');

      if (!listsRes.data.length) {
        setCreatingNew(true);
        setSelectedListId(null);
      } else if (!creatingNew && (!selectedListId || !listsRes.data.some((list) => list.id === selectedListId))) {
        setSelectedListId(listsRes.data[0].id);
      }
    } catch (err) {
      if (!navigator.onLine) {
        try {
          const cached = JSON.parse(localStorage.getItem(`ghm_offline_shopping_${id}`) || 'null');
          if (cached?.house && Array.isArray(cached?.lists)) {
            setHouse(cached.house);
            setSections(cached.sections || []);
            setProducts(cached.products || []);
            setActiveLists(cached.lists || []);
            setOfflineFallback(true);
            setError('');
          } else {
            setError('You are offline and no shopping-list snapshot has been saved on this device yet.');
          }
        } catch {
          setError('You are offline and the saved shopping-list snapshot could not be opened.');
        }
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadProducts(query = '') {
    try {
      const { data } = await api.get<Product[]>(`/houses/${id}/products`, {
        params: { sort_by: sortBy, direction, search: query || undefined, limit: SHOPPING_PRODUCT_LIMIT },
      });
      setProducts(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function createInvite() {
    try {
      const { data } = await api.post(`/houses/${id}/invite`);
      setInviteUrl(data.join_url);
      await navigator.clipboard?.writeText(data.join_url);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { loadAll(); }, [id, sortBy, direction]);
  useHouseLiveRefresh(id, loadAll);

  const selectedList = useMemo(
    () => activeLists.find((list) => list.id === selectedListId) || activeLists[0] || null,
    [activeLists, selectedListId]
  );
  const listLimit = housePlan?.limits.active_lists_per_house ?? subscription?.limits.active_lists_per_house ?? 0;
  const canCreateMore = !listLimit || activeLists.length < listLimit;
  const activeListForPanel = creatingNew ? null : selectedList;

  function replaceActiveList(nextList: ShoppingList) {
    setActiveLists((current) => {
      const exists = current.some((list) => list.id === nextList.id);
      const next = exists ? current.map((list) => (list.id === nextList.id ? nextList : list)) : [nextList, ...current];
      return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    setSelectedListId(nextList.id);
  }

  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← Back to Home</Link>
          <h1>{house?.name || 'House'} grocery lists</h1>
          <p>Use this as your in-store checklist. Add what you need, check items into the cart, then finish shopping to update your Home automatically.</p>
        </div>
        <div className="shopping-topbar-actions">
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <button onClick={() => setMembersOpen(true)} className="secondary">Members ({members.length})</button>
          <Link to="/profile" className="secondary center-link">Profile</Link>
          <div className="shopping-sort-controls">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="store_name">Store name</option>
              <option value="name">Product name</option>
              <option value="price">Price</option>
              <option value="quantity">Quantity</option>
              <option value="expiry_date">Expiry date</option>
              <option value="created_at">Newest</option>
            </select>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {initialLoading && <div className="panel muted-panel">Loading grocery lists...</div>}

      <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={() => setMembersOpen(true)} />
      {offlineFallback && <div className="offline-shopping-banner">Offline mode: showing the latest shopping list saved on this device. Changes require a connection.</div>}

      {!creatingNew && selectedList ? <WholeListComparison houseId={id} selectedList={selectedList} /> : null}

      <div className="shopping-page-layout">
        <section className="shopping-main-column">
          <section className="panel list-switcher-panel">
            <div className="panel-title-row">
              <div>
                <h2>Active shopping lists</h2>
                <p>
                  {activeLists.length} active list{activeLists.length === 1 ? '' : 's'}
                  {housePlan ? ` / ${housePlan.limits.active_lists_per_house} allowed by owner plan (${housePlan.name})` : ''}
                </p>
              </div>
              <button
                className="primary"
                disabled={!canCreateMore}
                onClick={() => { setCreatingNew(true); setSelectedListId(null); }}
              >
                New list
              </button>
            </div>
            {!canCreateMore && <div className="hint">This house reached the owner plan's active shopping-list limit. Finish/cancel one, or ask the owner to upgrade.</div>}
            <div className="list-tabs">
              {activeLists.map((list) => (
                <button
                  key={list.id}
                  className={!creatingNew && (selectedListId === list.id || (!selectedListId && selectedList?.id === list.id)) ? 'list-tab active' : 'list-tab'}
                  onClick={() => { setCreatingNew(false); setSelectedListId(list.id); }}
                >
                  <strong>{list.title}</strong>
                  <small>{list.items.length} item{list.items.length === 1 ? '' : 's'}</small>
                </button>
              ))}
              {creatingNew && <button className="list-tab active"><strong>New grocery list</strong><small>Select products below</small></button>}
            </div>
          </section>

          <ShoppingListPanel
            houseId={id}
            products={products}
            sections={sections}
            activeList={activeListForPanel}
            onChange={loadAll}
            onListUpdated={replaceActiveList}
            onListCreated={(list) => {
              setCreatingNew(false);
              setSelectedListId(list.id);
            }}
            onProductSearch={loadProducts}
          />
        </section>
        <aside className="shopping-side-column">
          <SmartShoppingSuggestions houseId={id} selectedList={selectedList} />
          <ActivityFeed activities={activities} onRefresh={loadAll} />
        </aside>
      </div>

      <MembersDrawer
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        currentUserId={currentUser?.id}
        houseRole={house?.role}
        onCreateInvite={createInvite}
        inviteUrl={inviteUrl}
      />
    </main>
  );
}



function WholeListComparison({ houseId, selectedList }: { houseId: number; selectedList: ShoppingList }) {
  const [comparison, setComparison] = useState<BasketComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [postalCode, setPostalCode] = useState(() => localStorage.getItem('ghm_price_postal') || '');
  const listSignature = selectedList.items.map((item) => `${item.id}:${item.product_id}:${item.requested_quantity}:${item.status}:${item.product.updated_at || ''}`).join('|');

  async function compare(forceRefresh = false, postal = postalCode) {
    if (!navigator.onLine) {
      setError('You are offline. The saved shopping list is still available; price recommendations will refresh when you reconnect.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const normalizedPostal = postal.trim().toUpperCase();
      if (normalizedPostal) localStorage.setItem('ghm_price_postal', normalizedPostal);
      const { data } = await api.get<BasketComparison>(`/insights/houses/${houseId}/shopping-lists/${selectedList.id}/basket-comparison`, {
        params: {
          t: Date.now(),
          live: true,
          force_refresh: forceRefresh || undefined,
          postal_code: normalizedPostal || undefined,
        },
      });
      setComparison(data);
      setDetailsOpen(Boolean(data.store_options.length));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setComparison(null);
    setDetailsOpen(false);
    setError('');
    void compare(false, localStorage.getItem('ghm_price_postal') || '');
  }, [selectedList.id, houseId, listSignature]);

  const winner = comparison?.best_single_store || null;
  const incompleteWinner = Boolean(winner && !winner.complete);
  const lastUpdated = comparison?.last_refreshed_at ? new Date(comparison.last_refreshed_at).toLocaleString() : '';

  return (
    <section className="whole-list-compare-hero auto-basket-comparison">
      <div className="whole-list-copy">
        <div className="auto-compare-title-row">
          <div>
            <p className="eyebrow">Family Plus • automatic trip check</p>
            <h2>Where should I buy “{selectedList.title}”?</h2>
          </div>
          <span className={busy ? 'auto-status checking' : 'auto-status'}>{busy ? '● Checking prices…' : comparison ? '✓ Checked automatically' : 'Ready'}</span>
        </div>
        <p>Prices are checked automatically: current Canadian prices first, then your recent receipts, then older prices you have saved. If a price cannot be found, we say so instead of guessing.</p>

        {comparison?.premium_required ? (
          <div className="basket-upgrade-line"><span>{comparison.message}</span><Link to="/pricing" className="secondary center-link">See Family Plus</Link></div>
        ) : null}

        {comparison && !comparison.premium_required ? (
          <div className="basket-source-strip">
            {comparison.data_sources.length ? comparison.data_sources.map((source) => <span key={source}>✓ {source}</span>) : <span>No prices found yet</span>}
            {comparison.location_label ? <span>📍 {comparison.location_label}</span> : null}
            {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
          </div>
        ) : null}

        {comparison?.live_configured && !comparison.premium_required ? (
          <form className="basket-location-inline" onSubmit={(event) => { event.preventDefault(); void compare(true, postalCode); }}>
            <label>
              <span>Postal code (optional) for nearby prices</span>
              <input value={postalCode} onChange={(event) => setPostalCode(event.target.value.toUpperCase())} placeholder="L8P 1A1" maxLength={7} />
            </label>
            <button className="secondary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Use & refresh'}</button>
            {postalCode ? <button type="button" className="text-button" onClick={() => { setPostalCode(''); localStorage.removeItem('ghm_price_postal'); void compare(true, ''); }}>Clear</button> : null}
          </form>
        ) : null}

        <div className="whole-list-actions">
          <button className="primary" type="button" onClick={() => compare(true)} disabled={busy || !navigator.onLine}>{busy ? 'Refreshing prices…' : 'Refresh prices'}</button>
          {comparison?.store_options.length ? <button className="secondary" type="button" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Collapse details' : 'View store details'}</button> : null}
        </div>
        {error && <div className="error compact-message">{error}</div>}
      </div>

      <div className="whole-list-result-preview">
        {!comparison || busy ? (
          <><span>AUTOMATIC CHECK</span><strong>{selectedList.items.length}</strong><small>{busy ? 'checking live + household prices…' : 'items checked together'}</small></>
        ) : comparison.premium_required ? (
          <><span>PREMIUM</span><strong>Family Plus</strong><small>Automatic whole-list comparison unlocks here.</small></>
        ) : winner && winner.complete ? (
          <><span>BEST ONE-STORE TRIP</span><strong>{winner.store_name}</strong><em>{money(winner.known_total, comparison.currency_code)}</em><small>{winner.priced_items}/{winner.total_items} items found • {winner.source_summary}</small></>
        ) : comparison.split_store_total != null && comparison.split_store_names.length ? (
          <><span>COMPLETE 2-STORE PLAN</span><strong>{comparison.split_store_names.join(' + ')}</strong><em>{money(comparison.split_store_total, comparison.currency_code)}</em><small>All {comparison.total_items} items have real prices across these two stores</small></>
        ) : winner ? (
          <><span>BEST PRICE FOUND SO FAR</span><strong>{winner.store_name}</strong><em>{money(winner.known_total, comparison.currency_code)} known</em><small>{winner.priced_items}/{winner.total_items} items found — this is not the full basket total</small></>
        ) : (
          <><span>NO PRICE MATCH YET</span><strong>Nothing to set up</strong><small>The app will reuse receipt and live price data automatically as it becomes available.</small></>
        )}
      </div>

      {comparison && !comparison.premium_required ? (
        <div className="basket-guidance-line">
          <strong>{comparison.message}</strong>
          {comparison.recommendation_reason ? <span>{comparison.recommendation_reason}</span> : null}
          {comparison.live_configured && comparison.needs_postal_code ? <small>Tip: we are using your saved city. Add a postal code only if you want more local results.</small> : null}
          {!comparison.live_configured ? <small>Current Canadian prices are unavailable right now, so Grocery House Manager is automatically using your receipt and saved prices instead.</small> : null}
        </div>
      ) : null}

      {comparison && detailsOpen && !comparison.premium_required && comparison.store_options.length ? (
        <div className="whole-list-results">
          {comparison.store_options.slice(0, 6).map((store, index) => (
            <div key={store.store_name} className={store.complete && index === 0 ? 'best' : ''}>
              <span>{store.complete && index === 0 ? '★ ' : ''}{store.store_name}</span>
              <strong>{money(store.known_total, comparison.currency_code)}{store.complete ? '' : ' known'}</strong>
              <small>{store.priced_items}/{store.total_items} items found • {store.source_summary}</small>
              {!store.complete ? <small className="basket-missing-line">Missing: {store.missing_items.slice(0, 4).join(', ')}{store.missing_items.length > 4 ? ` +${store.missing_items.length - 4} more` : ''}</small> : null}
            </div>
          ))}
          {comparison.split_store_total != null ? (
            <div className={comparison.split_store_worth_it ? 'whole-list-split-result worth-it' : 'whole-list-split-result'}>
              <span>Two-store check{comparison.split_store_names?.length ? ` • ${comparison.split_store_names.join(' + ')}` : ''}</span>
              <strong>{money(comparison.split_store_total, comparison.currency_code)}</strong>
              <small>{comparison.split_store_recommendation || 'Every item has a real saved or current price in this two-store combination.'}</small>
            </div>
          ) : null}
          <p className="small-muted basket-no-guess-note">Only prices we actually found are totaled. Missing prices are never filled with guesses.</p>
        </div>
      ) : null}
    </section>
  );
}

function cachedLocation() {
  for (const key of ['account_profile_cache', 'user']) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) continue;
      const parsed = JSON.parse(cached);
      if (parsed?.city || parsed?.country) return { city: parsed?.city || '', country: parsed?.country || '' };
    } catch {
      // ignore malformed cache and try the next local profile source
    }
  }
  return { city: '', country: '' };
}

function SmartShoppingSuggestions({ houseId, selectedList }: { houseId: number; selectedList: ShoppingList | null }) {
  const initial = cachedLocation();
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country || 'Canada');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadSuggestions(nextLat = lat, nextLng = lng) {
    if (!selectedList) return;
    try {
      setBusy(true);
      const { data } = await api.get<ShoppingSuggestions>(`/market/houses/${houseId}/shopping-lists/${selectedList.id}/suggestions`, {
        params: { city: city || undefined, country: country || undefined, lat: nextLat ?? undefined, lng: nextLng ?? undefined },
      });
      setSuggestions(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setSuggestions(null);
    setError('');
    if (selectedList) void loadSuggestions(null, null);
  }, [selectedList?.id]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location access is not supported on this device. Your saved profile city can still be used.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLng = position.coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        void loadSuggestions(nextLat, nextLng);
      },
      () => {
        setBusy(false);
        setError('Location permission was not allowed. Nearby stores will continue using your saved profile city.');
      },
      { enableHighAccuracy: false, timeout: 9000 },
    );
  }

  if (!selectedList) {
    return (
      <section className="panel smart-suggestions-panel">
        <p className="eyebrow">Household Pro</p>
        <h2>Nearby store options</h2>
        <p>Choose a shopping list and nearby-store suggestions will load automatically.</p>
      </section>
    );
  }

  return (
    <section className="panel smart-suggestions-panel simplified-store-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Household Pro • nearby convenience</p>
          <h2>Stores around your trip</h2>
        </div>
        <span className="badge">Auto-loaded</span>
      </div>
      <p>The full basket price decision is handled above. This panel stays focused on nearby grocery locations so you do not have to run the same comparison twice.</p>
      {error && <div className="error">{error}</div>}
      <div className="form-row compact-location-row">
        <label>City<input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Hamilton" /></label>
        <label>Country<input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Canada" /></label>
      </div>
      <div className="location-actions">
        <button className="secondary" type="button" onClick={useCurrentLocation} disabled={busy}>Use my location</button>
        <button className="secondary" type="button" onClick={() => loadSuggestions()} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh nearby stores'}</button>
      </div>

      {busy && !suggestions ? <p className="small-muted">Finding useful nearby options automatically…</p> : null}
      {suggestions ? (
        <div className="suggestion-results">
          <div className={suggestions.premium_required ? 'hint' : 'success compact-message'}>{suggestions.message}</div>
          {suggestions.nearby_stores.length > 0 ? (
            <div className="nearby-store-list">
              <strong>Nearby grocery stores {suggestions.location_label ? `near ${suggestions.location_label}` : ''}</strong>
              {suggestions.nearby_stores.slice(0, 6).map((store, index) => (
                <a key={`${store.name}-${index}`} href={store.maps_url || '#'} target="_blank" rel="noreferrer" className="store-result-card">
                  <span>{store.name}</span>
                  <small>{store.address || 'Open in maps'}{store.rating ? ` • ${store.rating}★ (${store.user_ratings_total || 0})` : ''}</small>
                </a>
              ))}
            </div>
          ) : !suggestions.premium_required ? <p className="small-muted">No nearby store results were returned for this area.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

