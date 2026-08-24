import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, BasketComparison, House, HouseMember, LivePriceCompareResponse, Plan, Product, Section, ShoppingList, ShoppingSuggestions, Subscription, User } from '../types';
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
          <Link to={`/houses/${id}`} className="breadcrumb">← Back to inventory</Link>
          <h1>{house?.name || 'House'} grocery lists</h1>
          <p>Create multiple shopping lists, check products into cart, then finish shopping to update inventory.</p>
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
  const [expanded, setExpanded] = useState(false);

  async function compare() {
    try {
      setBusy(true);
      setError('');
      const { data } = await api.get<BasketComparison>(`/insights/houses/${houseId}/shopping-lists/${selectedList.id}/basket-comparison`, { params: { t: Date.now() } });
      setComparison(data);
      setExpanded(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setComparison(null);
    setExpanded(false);
    setError('');
  }, [selectedList.id]);

  return (
    <section className="whole-list-compare-hero">
      <div className="whole-list-copy">
        <p className="eyebrow">Family Plus • whole-list intelligence</p>
        <h2>Compare the entire “{selectedList.title}” trip in one tap.</h2>
        <p>Instead of checking milk, eggs, rice, and every other item separately, Grocery House Manager uses your saved household price history to estimate the strongest single-store basket and, when useful, a practical two-store option.</p>
        <div className="whole-list-actions">
          <button className="primary" type="button" onClick={compare} disabled={busy || !navigator.onLine}>{busy ? 'Comparing your basket…' : 'Compare my shopping list'}</button>
          {comparison ? <button className="secondary" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide results' : 'Show results'}</button> : null}
        </div>
        {error && <div className="error compact-message">{error}</div>}
      </div>
      <div className="whole-list-result-preview">
        {!comparison ? (
          <><span>ONE TAP</span><strong>{selectedList.items.length}</strong><small>items compared together</small></>
        ) : comparison.premium_required ? (
          <><span>PREMIUM</span><strong>Family Plus</strong><small>{comparison.message}</small><Link to="/pricing" className="secondary center-link">See plans</Link></>
        ) : comparison.best_single_store ? (
          <><span>BEST SINGLE STORE</span><strong>{comparison.best_single_store.store_name}</strong><em>{money(comparison.best_single_store.estimated_total, comparison.currency_code)}</em><small>{comparison.best_single_store.coverage_percent}% direct saved-price coverage</small></>
        ) : (
          <><span>PRICE HISTORY</span><strong>Build coverage</strong><small>{comparison.message}</small></>
        )}
      </div>
      {comparison && expanded && !comparison.premium_required ? (
        <div className="whole-list-results">
          {comparison.store_options.slice(0, 5).map((store, index) => (
            <div key={store.store_name} className={index === 0 ? 'best' : ''}>
              <span>{index === 0 ? '★ ' : ''}{store.store_name}</span>
              <strong>{money(store.estimated_total, comparison.currency_code)}</strong>
              <small>{store.coverage_percent}% direct coverage • {store.missing_items.length} estimated item{store.missing_items.length === 1 ? '' : 's'}</small>
            </div>
          ))}
          {comparison.split_store_total != null ? (
            <div className="whole-list-split-result">
              <span>Best 2-store option{comparison.split_store_names?.length ? ` • ${comparison.split_store_names.join(' + ')}` : ''}</span>
              <strong>{money(comparison.split_store_total, comparison.currency_code)}</strong>
              <small>{comparison.split_store_coverage_percent}% direct coverage • {comparison.split_store_savings ? `potential extra saving ${money(comparison.split_store_savings, comparison.currency_code)}` : 'a single store is already competitive'}</small>
            </div>
          ) : null}
          <p className="small-muted">Estimates are based on saved prices; missing store-specific rows are filled conservatively from the best known household price and are clearly counted in coverage.</p>
        </div>
      ) : null}
    </section>
  );
}

function cachedLocation() {
  try {
    const cached = localStorage.getItem('account_profile_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { city: parsed?.city || '', country: parsed?.country || '' };
    }
  } catch {
    // ignore malformed cache
  }
  return { city: '', country: '' };
}

function SmartShoppingSuggestions({ houseId, selectedList }: { houseId: number; selectedList: ShoppingList | null }) {
  const initial = cachedLocation();
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country || 'Canada');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [postalCode, setPostalCode] = useState('');
  const [suggestions, setSuggestions] = useState<ShoppingSuggestions | null>(null);
  const [livePrices, setLivePrices] = useState<LivePriceCompareResponse | null>(null);
  const [livePricesOpen, setLivePricesOpen] = useState(false);
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



  async function submitLiveCompare(options: { forceRefresh?: boolean; postal?: string; lat?: number; lng?: number; useProfileCity?: boolean }) {
    if (!selectedList) return;
    try {
      setBusy(true);
      setError('');
      const productIds = selectedList.items.map((item) => item.product_id);
      const { data } = await api.post<LivePriceCompareResponse>(`/market/houses/${houseId}/price-compare`, {
        product_ids: productIds,
        postal_code: options.postal || undefined,
        lat: options.lat,
        lng: options.lng,
        city: options.useProfileCity ? city || undefined : undefined,
        force_refresh: options.forceRefresh || false,
      });
      setLivePrices(data);
      setLivePricesOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function compareCurrentList(forceRefresh = false) {
    if (!selectedList) return;
    const typedPostal = postalCode.trim();
    if (typedPostal) {
      await submitLiveCompare({ postal: typedPostal, forceRefresh });
      return;
    }
    if (!navigator.geolocation) {
      await submitLiveCompare({ useProfileCity: true, forceRefresh });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        submitLiveCompare({ lat: position.coords.latitude, lng: position.coords.longitude, forceRefresh });
      },
      () => {
        setBusy(false);
        submitLiveCompare({ useProfileCity: true, forceRefresh });
      },
      { enableHighAccuracy: false, timeout: 9000 },
    );
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location access is not supported on this device. Enter city manually.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLng = position.coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        loadSuggestions(nextLat, nextLng);
      },
      () => {
        setBusy(false);
        setError('Location permission was not allowed. Enter your city manually and search again.');
      },
      { enableHighAccuracy: false, timeout: 9000 },
    );
  }

  if (!selectedList) {
    return (
      <section className="panel smart-suggestions-panel">
        <p className="eyebrow">Household Pro</p>
        <h2>Smart store suggestions</h2>
        <p>Create or choose a shopping list to see best known prices and nearby grocery stores.</p>
      </section>
    );
  }

  return (
    <section className="panel smart-suggestions-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Household Pro</p>
          <h2>Smart store suggestions</h2>
        </div>
        <span className="badge">Prices + nearby stores</span>
      </div>
      <p>Get store suggestions using your saved receipt/product prices plus nearby grocery locations. Live product prices depend on available retailer data.</p>
      {error && <div className="error">{error}</div>}
      <div className="form-row compact-location-row">
        <label>Postal code for live prices<input value={postalCode} onChange={(e) => setPostalCode(e.target.value.toUpperCase())} placeholder="Example: L8P 1A1" /></label>
        <label>City for nearby stores<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamilton" /></label>
        <label>Country<input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" /></label>
      </div>
      <p className="small-muted location-note">For live prices, postal code gives the best result. If it is blank, the app asks for current location; if denied, it uses your profile city.</p>
      <div className="location-actions">
        <button className="secondary" type="button" onClick={useCurrentLocation} disabled={busy}>Use my location</button>
        <button className="secondary" type="button" onClick={() => loadSuggestions()} disabled={busy}>{busy ? 'Checking...' : 'Get suggestions'}</button>
        <button className="primary" type="button" onClick={() => compareCurrentList(false)} disabled={busy}>Compare live prices</button>
      </div>

      {livePrices && livePricesOpen && (
        <div className="modal-backdrop live-price-modal-backdrop" onClick={() => setLivePricesOpen(false)}>
          <section className="modal live-price-modal" role="dialog" aria-modal="true" aria-label="Live price comparison" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <div>
                <p className="eyebrow">Live comparison</p>
                <h2>All available price sources</h2>
                <p>{livePrices.message}</p>
                {livePrices.failure_reason && <p className="small-muted"><strong>Reason:</strong> {livePrices.failure_reason}</p>}
              </div>
              <button type="button" onClick={() => setLivePricesOpen(false)} aria-label="Close live price comparison">×</button>
            </div>
            <div className={livePrices.premium_required || !livePrices.configured ? 'hint' : 'live-price-scroll-list'}>
              {livePrices.results.length > 0 ? livePrices.results.map((row, index) => (
                <a key={`${row.item}-${row.retailer}-${index}`} href={row.source_url || '#'} target="_blank" rel="noreferrer" className="store-result-card live-price-result-card">
                  <span>{row.item} • {row.banner || row.store_name || row.retailer || 'Store'}</span>
                  <small>
                    {(row.sale_price ?? row.price) != null ? money(row.sale_price ?? row.price, livePrices.currency_code) : 'Price unavailable'}
                    {row.unit_price ? ` • ${row.unit_price}` : ''}
                    {row.store_address ? ` • ${row.store_address}` : ''}
                    {row.match_confidence ? ` • confidence: ${row.match_confidence}` : ''}
                    {row.confidence_explanation ? ` • ${row.confidence_explanation}` : ''}
                    {row.scraped_at ? ` • updated ${new Date(row.scraped_at).toLocaleDateString()}` : ''}
                  </small>
                </a>
              )) : <p className="small-muted">No live price rows were returned. Saved receipt suggestions still work.</p>}
            </div>
            <button className="secondary full" type="button" onClick={() => compareCurrentList(true)} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh live comparison'}</button>
          </section>
        </div>
      )}

      {suggestions && (
        <div className="suggestion-results">
          <div className={suggestions.premium_required ? 'hint' : 'success compact-message'}>{suggestions.message}</div>
          {suggestions.item_suggestions.length > 0 && (
            <div className="suggestion-list">
              <strong>Best known prices</strong>
              {suggestions.item_suggestions.slice(0, 8).map((item) => (
                <div key={item.product_id} className="suggestion-row">
                  <span>{item.product_name}</span>
                  <small>
                    {item.best_known_store
                      ? `${item.best_known_store} • ${money(item.best_known_price, suggestions.currency_code)}`
                      : 'No saved price yet'}
                    {item.best_known_source ? ` • ${item.best_known_source}` : ''}
                    {item.freshness_label ? ` • ${item.freshness_label}` : ''}
                    {item.savings_vs_current ? ` • save ${money(item.savings_vs_current, suggestions.currency_code)}` : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
          {suggestions.nearby_stores.length > 0 && (
            <div className="nearby-store-list">
              <strong>Nearby grocery stores {suggestions.location_label ? `near ${suggestions.location_label}` : ''}</strong>
              {suggestions.nearby_stores.slice(0, 6).map((store, index) => (
                <a key={`${store.name}-${index}`} href={store.maps_url || '#'} target="_blank" rel="noreferrer" className="store-result-card">
                  <span>{store.name}</span>
                  <small>{store.address || 'Open in maps'}{store.rating ? ` • ${store.rating}★ (${store.user_ratings_total || 0})` : ''}</small>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
