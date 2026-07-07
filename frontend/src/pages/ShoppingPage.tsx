import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, HouseMember, LivePriceCompareResponse, Plan, Product, ShoppingList, ShoppingSuggestions, Subscription } from '../types';
import ShoppingListPanel from '../components/ShoppingListPanel';
import { ActivityFeed, MembersPanel } from '../components/HouseInfoPanels';
import { money } from '../currency';

export default function ShoppingPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const [house, setHouse] = useState<House | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
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

  async function loadAll() {
    try {
      const [houseRes, productsRes, listsRes, membersRes, activitiesRes, subscriptionRes, housePlanRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction } }),
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 40 } }),
        api.get<Subscription>('/billing/me'),
        api.get<Plan>(`/houses/${id}/plan`),
      ]);
      setHouse(houseRes.data);
      setProducts(productsRes.data);
      setActiveLists(listsRes.data);
      setMembers(membersRes.data);
      setActivities(activitiesRes.data);
      setSubscription(subscriptionRes.data);
      setHousePlan(housePlanRes.data);
      setError('');

      if (!listsRes.data.length) {
        setCreatingNew(true);
        setSelectedListId(null);
      } else if (!creatingNew && (!selectedListId || !listsRes.data.some((list) => list.id === selectedListId))) {
        setSelectedListId(listsRes.data[0].id);
      }
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
            activeList={activeListForPanel}
            onChange={loadAll}
            onListCreated={(list) => {
              setCreatingNew(false);
              setSelectedListId(list.id);
            }}
          />
        </section>
        <aside className="shopping-side-column">
          <SmartShoppingSuggestions houseId={id} selectedList={selectedList} />
          <MembersPanel members={members} />
          <ActivityFeed activities={activities} onRefresh={loadAll} />
        </aside>
      </div>
    </main>
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
  const [suggestions, setSuggestions] = useState<ShoppingSuggestions | null>(null);
  const [livePrices, setLivePrices] = useState<LivePriceCompareResponse | null>(null);
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



  async function compareCurrentList(forceRefresh = false) {
    if (!selectedList) return;
    try {
      setBusy(true);
      setError('');
      const productIds = selectedList.items.map((item) => item.product_id);
      const location = city && country ? `${city}, ${country}` : city || country || 'Canada';
      const { data } = await api.post<LivePriceCompareResponse>(`/market/houses/${houseId}/price-compare`, {
        product_ids: productIds,
        location,
        force_refresh: forceRefresh,
      });
      setLivePrices(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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
        <label>City<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamilton" /></label>
        <label>Country<input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" /></label>
      </div>
      <div className="location-actions">
        <button className="secondary" type="button" onClick={useCurrentLocation} disabled={busy}>Use my location</button>
        <button className="secondary" type="button" onClick={() => loadSuggestions()} disabled={busy}>{busy ? 'Checking...' : 'Get suggestions'}</button>
        <button className="primary" type="button" onClick={() => compareCurrentList(false)} disabled={busy}>Compare live prices</button>
      </div>

      {livePrices && (
        <div className={livePrices.premium_required || !livePrices.configured ? 'hint' : 'suggestion-results live-price-summary'}>
          <div className="compact-message">{livePrices.message}</div>
          {livePrices.results.slice(0, 8).map((row, index) => (
            <a key={`${row.item}-${row.retailer}-${index}`} href={row.source_url || '#'} target="_blank" rel="noreferrer" className="store-result-card">
              <span>{row.item} • {row.banner || row.store_name || row.retailer || 'Store'}</span>
              <small>
                {(row.sale_price ?? row.price) != null ? money(row.sale_price ?? row.price, livePrices.currency_code) : 'Price unavailable'}
                {row.unit_price ? ` • ${row.unit_price}` : ''}
                {row.match_confidence ? ` • ${row.match_confidence}` : ''}
              </small>
            </a>
          ))}
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
