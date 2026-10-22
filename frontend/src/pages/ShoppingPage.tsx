import FeatureUsageStrip from '../components/FeatureUsageStrip';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { BasketComparison, House, HouseMember, MarketCapabilities, Plan, Product, Section, ShoppingList, ShoppingSuggestions, Subscription, User } from '../types';
import ShoppingListPanel from '../components/ShoppingListPanel';
import GroceryPhotoScan from '../components/GroceryPhotoScan';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import { HouseMembersBar, MembersDrawer } from '../components/HouseInfoPanels';
import { money } from '../currency';
import FlyerDealModal, { type FlyerOpenDeal } from '../components/FlyerDealModal';
import { FeaturePurposeCard, FeatureWhyButton } from '../components/FeaturePurpose';
import OverlayPortal from '../components/OverlayPortal';
import { announceBackgroundResultHydrated, getBackgroundTaskResult, makeBackgroundTaskId, runBackgroundCapableTask } from '../backgroundTasks';

const SHOPPING_PRODUCT_LIMIT = 80;

export default function ShoppingPage() {
  const { houseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(houseId);
  const requestedListId = Number(searchParams.get('list') || 0);
  const [house, setHouse] = useState<House | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [groceryScanOpen, setGroceryScanOpen] = useState(false);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [listWorkspaceOpen, setListWorkspaceOpen] = useState(Boolean(requestedListId));
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [housePlan, setHousePlan] = useState<Plan | null>(null);
  const [sortBy, setSortBy] = useState('store_name');
  const [direction, setDirection] = useState('asc');
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [marketCapabilities, setMarketCapabilities] = useState<MarketCapabilities | null>(null);
  const [instacartBusy, setInstacartBusy] = useState(false);
  const [instacartMessage, setInstacartMessage] = useState('');
  const currentUser: User | null = JSON.parse(localStorage.getItem('user') || 'null');

  async function loadAll() {
    try {
      const [houseRes, sectionsRes, productsRes, listsRes, membersRes, subscriptionRes, housePlanRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, limit: SHOPPING_PRODUCT_LIMIT } }),
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Subscription>('/billing/me'),
        api.get<Plan>(`/houses/${id}/plan`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
      setProducts(productsRes.data);
      setActiveLists(listsRes.data);
      setMembers(membersRes.data);
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
        setCreatingNew(false);
        setSelectedListId(null);
        setListWorkspaceOpen(false);
        if (requestedListId) setSearchParams({}, { replace: true });
      } else if (requestedListId && listsRes.data.some((list) => list.id === requestedListId)) {
        setCreatingNew(false);
        setSelectedListId(requestedListId);
        setListWorkspaceOpen(true);
      } else if (requestedListId) {
        // A completed/cancelled list may disappear while its focused screen is open.
        // Return to the Shop library instead of silently switching the user to another list.
        setCreatingNew(false);
        setSelectedListId(listsRes.data[0].id);
        setListWorkspaceOpen(false);
        setSearchParams({}, { replace: true });
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

  useEffect(() => {
    setHouse(null);
    setProducts([]);
    setSections([]);
    setActiveLists([]);
    setMembers([]);
    setCreatingNew(false);
    setSelectedListId(null);
    setListWorkspaceOpen(false);
    setInitialLoading(true);
    setOfflineFallback(false);
    setError('');
  }, [id]);
  useEffect(() => { loadAll(); }, [id, sortBy, direction]);
  useEffect(() => {
    if (requestedListId && activeLists.some((list) => list.id === requestedListId)) {
      setSelectedListId(requestedListId);
      setCreatingNew(false);
      setListWorkspaceOpen(true);
    } else if (!requestedListId && !creatingNew) {
      setListWorkspaceOpen(false);
    }
  }, [requestedListId, activeLists, creatingNew]);
  useEffect(() => {
    let active = true;
    api.get<MarketCapabilities>('/market/capabilities').then(({ data }) => { if (active) setMarketCapabilities(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useHouseLiveRefresh(id, loadAll);

  async function openInstacartList() {
    if (!selectedList) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    try {
      setInstacartBusy(true);
      setInstacartMessage('');
      const { data } = await api.post<{ configured: boolean; url?: string | null; message: string }>(`/market/houses/${id}/shopping-lists/${selectedList.id}/instacart-link`);
      setInstacartMessage(data.message || '');
      if (data.url) {
        if (popup) popup.location.href = data.url;
        else window.location.href = data.url;
      } else if (popup) {
        popup.close();
      }
    } catch (err) {
      if (popup) popup.close();
      setInstacartMessage(errorMessage(err));
    } finally {
      setInstacartBusy(false);
    }
  }

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

  function openList(listId: number) {
    setCreatingNew(false);
    setSelectedListId(listId);
    setListWorkspaceOpen(true);
    setSearchParams({ list: String(listId) }, { replace: true });
  }

  function openNewList() {
    if (!canCreateMore) return;
    setCreatingNew(true);
    setSelectedListId(null);
    setListWorkspaceOpen(true);
    setSearchParams({}, { replace: true });
  }

  function closeListWorkspace() {
    setListWorkspaceOpen(false);
    setCreatingNew(false);
    if (!selectedListId && activeLists[0]) setSelectedListId(activeLists[0].id);
    setSearchParams({}, { replace: true });
  }

  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← Back to Home</Link>
          <div className="feature-heading-with-why-v101"><h1>{house?.name || 'House'} grocery lists</h1><FeatureWhyButton feature="shopping" label="Why?" /></div>
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

      <FeatureUsageStrip houseId={id} features={['grocery_scan','paid_provider_day','paid_provider_month']} compact />
      <HouseContextSwitcher currentHouseId={id} currentHouseName={house?.name} section="shopping" />
      <FeaturePurposeCard feature="shopping" />

      {error && <div className="error">{error}</div>}
      {initialLoading && <div className="panel muted-panel">Loading grocery lists...</div>}

      <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={() => setMembersOpen(true)} />
      {offlineFallback && <div className="offline-shopping-banner">Offline mode: showing the latest shopping list saved on this device. Changes require a connection.</div>}

      <section className="panel list-switcher-panel shopping-list-library-panel-v115">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">SHOPPING WORKSPACES</p>
            <h2>Your grocery lists</h2>
            <p>Open one list at a time in its own focused screen. Your Shop page stays clean and easy to scan.</p>
          </div>
          <div className="v137-shopping-scan-actions"><button type="button" className="secondary" onClick={() => setGroceryScanOpen(true)}>📷 Scan groceries</button><button className="primary" disabled={!canCreateMore} onClick={openNewList}>New list</button></div>
        </div>
        {!canCreateMore && <div className="hint">This house reached the owner plan's active shopping-list limit. Finish or cancel one list before creating another.</div>}
        {activeLists.length ? (
          <div className="shopping-list-library-v115">
            {activeLists.map((list) => (
              <button key={list.id} type="button" className="shopping-list-card-v115" onClick={() => openList(list.id)}>
                <span className="shopping-list-card-icon-v115" aria-hidden="true">🛒</span>
                <span className="shopping-list-card-copy-v115">
                  <small>GROCERY LIST</small>
                  <strong>{list.title}</strong>
                  <span>{list.items.length} item{list.items.length === 1 ? '' : 's'} · created {new Date(list.created_at).toLocaleDateString()}</span>
                </span>
                <b>Open →</b>
              </button>
            ))}
          </div>
        ) : !initialLoading ? (
          <div className="shopping-list-empty-v115">
            <span aria-hidden="true">📝</span>
            <div><strong>No active grocery lists yet.</strong><p>Create a focused list for your next trip.</p></div>
            <button className="primary" type="button" onClick={openNewList}>Create your first list</button>
          </div>
        ) : null}
      </section>

      {listWorkspaceOpen ? (
        <OverlayPortal>
          <div className="shopping-list-workspace-backdrop-v115" onMouseDown={(event) => { if (event.target === event.currentTarget) closeListWorkspace(); }}>
            <section className="shopping-list-workspace-v115" role="dialog" aria-modal="true" aria-label={creatingNew ? 'Create grocery list' : selectedList?.title || 'Grocery list'}>
              <header className="shopping-list-workspace-head-v115">
                <div>
                  <small>{creatingNew ? 'NEW GROCERY LIST' : 'GROCERY LIST'}</small>
                  <h2>{creatingNew ? 'Build a new list' : selectedList?.title || 'Grocery list'}</h2>
                  <p>{creatingNew ? 'Choose what the house needs, then save the list.' : `${selectedList?.items.length || 0} items · shop with one focused screen.`}</p>
                </div>
                <button type="button" className="icon-button shopping-list-workspace-close-v115" onClick={closeListWorkspace} aria-label="Close grocery list">×</button>
              </header>

              <div className="shopping-list-workspace-scroll-v115">
                {!creatingNew && selectedList ? <WholeListComparison houseId={id} selectedList={selectedList} premiumTry={subscription?.premium_try || null} /> : null}

                {marketCapabilities?.instacart_configured && selectedList && !creatingNew ? (
                  <section className="panel instacart-shopping-card-v114">
                    <div>
                      <p className="eyebrow">Optional checkout partner</p>
                      <h3>Shop this list with Instacart</h3>
                      <p>Send this GHM list to Instacart, choose a nearby retailer, then confirm live package and price availability before checkout.</p>
                    </div>
                    <button className="primary" type="button" disabled={instacartBusy} onClick={() => void openInstacartList()}>{instacartBusy ? 'Preparing…' : 'Open on Instacart →'}</button>
                    {instacartMessage ? <small className="small-muted">{instacartMessage}</small> : null}
                  </section>
                ) : null}

                <div className="shopping-list-workspace-grid-v115">
                  <div className="shopping-list-workspace-main-v115">
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
                        setListWorkspaceOpen(true);
                        setSearchParams({ list: String(list.id) }, { replace: true });
                      }}
                      onProductSearch={loadProducts}
                      onCancelCreate={closeListWorkspace}
                    />
                  </div>
                  {!creatingNew && selectedList ? (
                    <aside className="shopping-list-workspace-side-v115">
                      <SmartShoppingSuggestions houseId={id} selectedList={selectedList} premiumTry={subscription?.premium_try || null} />
                    </aside>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </OverlayPortal>
      ) : null}

      {groceryScanOpen && <GroceryPhotoScan houseId={id} sections={sections} initialMode="written_list" initialDestination="shopping" onClose={() => setGroceryScanOpen(false)} onSaved={(result) => {
        setGroceryScanOpen(false);
        void loadAll();
        if (result.list_id) openList(result.list_id);
      }} />}
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



function WholeListComparison({ houseId, selectedList, premiumTry }: { houseId: number; selectedList: ShoppingList; premiumTry?: Subscription['premium_try'] }) {
  const [comparisonSearchParams] = useSearchParams();
  const [comparison, setComparison] = useState<BasketComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandedStore, setExpandedStore] = useState<string|null>(null);
  const [showAllStores, setShowAllStores] = useState(false);
  const [userGeo, setUserGeo] = useState<{country:string;city:string}>(() => cachedLocation());
  const [postalCode, setPostalCode] = useState(() => ['canada','ca',''].includes(cachedLocation().country.trim().toLowerCase()) ? scopedPricePostal(cachedLocation()) : '');
  const listSignature = selectedList.items.map((item) => `${item.id}:${item.product_id}:${item.requested_quantity}:${item.status}:${item.product.updated_at || ''}`).join('|');
  const lastComparedSignature = useRef('');
  const [comparisonDirty, setComparisonDirty] = useState(false);

  useEffect(() => {
    let active = true;
    const loadRegion = async () => {
      try {
        const { data } = await api.get<{country?:string;city?:string}>('/auth/me');
        if (!active) return;
        const region = {country:data.country || '',city:data.city || ''};
        setUserGeo(region);
        const saved = scopedPricePostal(region);
        setPostalCode(saved);
        if (region.country && !['canada','ca'].includes(region.country.toLowerCase())) {
          setPostalCode(''); clearPricePostal();
        }
      } catch { /* Server still performs country validation. */ }
    };
    void loadRegion();
    window.addEventListener('account:refresh',loadRegion);
    return () => { active=false; window.removeEventListener('account:refresh',loadRegion); };
  }, []);
  const canadaEnabled = !userGeo.country || ['canada','ca'].includes(userGeo.country.toLowerCase());

  async function compare(forceRefresh = false, postal = postalCode, usePremiumTry = false, allowProviderRun = true) {
    if (!canadaEnabled) { setError(`Automatic trip pricing is not available in ${userGeo.country}. No attempt was used.`); return; }
    if (!navigator.onLine) {
      setError('You are offline. The saved shopping list is still available; price recommendations will refresh when you reconnect.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const normalizedPostal = postal.trim().toUpperCase();
      if (normalizedPostal) { localStorage.setItem('ghm_price_postal', normalizedPostal); localStorage.setItem('ghm_price_postal_location_scope', regionKey(userGeo)); }
      const request = async () => (await api.get<BasketComparison>(`/insights/houses/${houseId}/shopping-lists/${selectedList.id}/basket-comparison`, {
        params: {
          t: allowProviderRun ? Date.now() : undefined,
          live: true,
          provider_run: allowProviderRun,
          force_refresh: allowProviderRun && forceRefresh ? true : undefined,
          postal_code: normalizedPostal || undefined,
        },
        headers: usePremiumTry ? { 'X-GHM-Premium-Try': 'whole_list_compare' } : undefined,
        timeout: allowProviderRun ? 120000 : 25000,
      })).data;

      let data: BasketComparison;
      if (allowProviderRun) {
        const taskId = makeBackgroundTaskId(`basket-compare-${houseId}-${selectedList.id}`);
        const href = `/houses/${houseId}/shopping?list=${selectedList.id}&bgTask=${encodeURIComponent(taskId)}`;
        data = await runBackgroundCapableTask<BasketComparison>({
          id: taskId,
          kind: 'basket-comparison',
          title: `Price comparison for ${selectedList.title}`,
          message: 'GHM is refreshing missing or expired live prices. You can continue using the app.',
          href,
          task: request,
        });
      } else {
        // Opening a list never buys new provider data. It only reuses shared live/flyer
        // cache and saved household history; the user explicitly chooses when to refresh.
        data = await request();
      }
      if (usePremiumTry && !data.premium_required) window.dispatchEvent(new Event('account:refresh'));
      setComparison(data);
      lastComparedSignature.current = listSignature;
      setComparisonDirty(false);
      setDetailsOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const taskId = comparisonSearchParams.get('bgTask');
    const restored = taskId ? getBackgroundTaskResult<BasketComparison>(taskId) : null;
    if (taskId && restored) {
      setComparison(restored);
      lastComparedSignature.current = listSignature;
      setComparisonDirty(false);
      setDetailsOpen(false);
      setError('');
      window.setTimeout(() => announceBackgroundResultHydrated(taskId), 0);
      return;
    }
    if (taskId) {
      setError('Your saved comparison is still being restored. GHM will not start the search again.');
      return;
    }
    setComparison(null);
    setDetailsOpen(false);
    setError('');
    // Cache-only first paint: zero new Apify spend just because someone opened the list.
    void compare(false, canadaEnabled ? scopedPricePostal(userGeo) : '', false, false);
  }, [selectedList.id, houseId, comparisonSearchParams, canadaEnabled]);

  useEffect(() => {
    if (lastComparedSignature.current && listSignature !== lastComparedSignature.current) setComparisonDirty(true);
  }, [listSignature]);

  const winner = comparison?.best_single_store || null;
  const incompleteWinner = Boolean(winner && !winner.complete);
  const lastUpdated = comparison?.last_refreshed_at ? new Date(comparison.last_refreshed_at).toLocaleString() : '';

  return (
    <section className="whole-list-compare-hero auto-basket-comparison">
      <div className="whole-list-copy">
        <div className="auto-compare-title-row">
          <div>
            <p className="eyebrow">Family Plus • automatic trip check</p>
            <div className="feature-heading-with-why-v101"><h2>Where should I buy “{selectedList.title}”?</h2><FeatureWhyButton feature="price_compare" label="Why?" /></div>
          </div>
          <div className="v147-trip-header-controls"><FeatureUsageStrip houseId={Number(houseId)} features={['paid_provider_day','paid_provider_month']} compact /><span className={`auto-status ${busy ? 'checking' : (comparisonDirty || comparison?.quantity_review_required || comparison?.price_review_required) ? 'review' : comparison ? 'done' : 'ready'}`}><i aria-hidden="true">{busy ? '●' : (comparisonDirty || comparison?.quantity_review_required || comparison?.price_review_required) ? '!' : comparison ? '✓' : '○'}</i>{busy ? 'Checking prices…' : comparisonDirty ? 'List changed' : comparison?.quantity_review_required ? 'Needs quantity review' : comparison?.price_review_required ? 'Needs price review' : comparison ? 'Prices checked' : 'Ready to check'}</span></div>
        </div>
        {!canadaEnabled || comparison?.country_supported === false ? <div className="v147-country-warning" role="status">Automatic grocery trip pricing is not available in your selected country ({userGeo.country || 'outside Canada'}). Your shopping list still works. No paid price/flyer attempt will be charged.</div> : null}
        <p>GHM compares the whole list using shared live-price cache, current flyers and your household price history. Paid lookups run only for products whose shared result is missing or expired.</p>

        {comparison?.premium_required ? (
          <div className="basket-upgrade-line">
            <span>{comparison.message}</span>
            {premiumTry?.available ? (premiumTry.selected_feature === 'whole_list_compare' ? <button type="button" className="primary" disabled={busy} onClick={() => void compare(false, postalCode, true, true)}>{busy ? 'Comparing…' : 'Use my free Premium Try'}</button> : <Link to={`/premium-try?feature=whole_list_compare&house=${houseId}`} className="primary center-link">Choose this as my free try</Link>) : <Link to="/pricing" className="secondary center-link">See Family Plus</Link>}
          </div>
        ) : null}

        {comparison && !comparison.premium_required ? (
          <div className="basket-source-strip">
            {comparison.data_sources.length ? comparison.data_sources.map((source) => <span key={source}>✓ {source}</span>) : <span>No prices found yet</span>}
            {comparison.live_cache_reused ? <span>♻ Shared live-price cache reused</span> : null}
            {comparison.location_label ? <span>📍 {comparison.location_label}</span> : null}
            {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
          </div>
        ) : null}

        {canadaEnabled && comparison?.live_configured && !comparison.premium_required ? (
          <form className="basket-location-inline" onSubmit={(event) => { event.preventDefault(); void compare(false, postalCode, false, true); }}>
            <label>
              <span>Postal code (optional) for nearby prices</span>
              <input value={postalCode} onChange={(event) => setPostalCode(event.target.value.toUpperCase())} placeholder="L8P 1A1" maxLength={7} />
            </label>
            <button className="secondary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Use & refresh'}</button>
            {postalCode ? <button type="button" className="text-button" onClick={() => { setPostalCode(''); localStorage.removeItem('ghm_price_postal'); void compare(false, '', false, false); }}>Clear</button> : null}
          </form>
        ) : null}

        <div className="whole-list-actions">
          <button className="primary" type="button" onClick={() => compare(false, postalCode, false, true)} disabled={busy || !navigator.onLine || !canadaEnabled}>{busy ? 'Refreshing prices…' : comparisonDirty ? 'Resume price check' : 'Refresh prices'}</button>
          {comparison?.store_options.length && !comparison.quantity_review_required && !comparisonDirty ? <button className="secondary" type="button" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Collapse details' : comparison.price_review_required ? 'Review flagged prices' : 'View store details'}</button> : null}
        </div>
        {error && <div className="error compact-message">{error}</div>}
      </div>

      <div className="whole-list-result-preview" data-ghm-background-result={comparison && !busy ? 'true' : undefined}>
        {!comparison || busy ? (
          <><span>CACHE-FIRST CHECK</span><strong>{selectedList.items.length}</strong><small>{busy ? 'checking available price data…' : 'items checked without buying new provider data'}</small></>
        ) : comparisonDirty ? (
          <><span>LIST CHANGED</span><strong>Price check paused</strong><small>Finish all quantity edits, then press Resume price check. GHM will not search on every keystroke.</small></>
        ) : comparison.premium_required ? (
          <><span>PREMIUM</span><strong>Family Plus</strong><small>Automatic whole-list comparison unlocks here.</small></>
        ) : comparison.quantity_review_required ? (
          <><span>CHECK QUANTITIES</span><strong>Trip check paused</strong><small>Fix the highlighted quantities before GHM calculates or purchases fresh live-price data.</small></>
        ) : comparison.price_review_required ? (
          <><span>PRICE CHECK BLOCKED</span><strong>Unusual total detected</strong><small>GHM refused to recommend an implausibly high basket. Review the flagged store prices instead of paying for another lookup.</small></>
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
        <div className={`basket-guidance-line ${comparisonDirty || comparison.quantity_review_required || comparison.price_review_required ? 'quantity-review' : ''}`}>
          {comparisonDirty ? <><strong>Price comparison is paused while you edit.</strong><span>Make every change you need, save the item details, then press Resume price check once. No live provider query runs while you type.</span></> : <>
          <strong>{comparison.message}</strong>
          {comparison.quantity_review_required && comparison.quantity_warnings?.length ? <div className="v132-quantity-warnings">{comparison.quantity_warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}</div> : null}
          {comparison.price_review_required && comparison.price_warnings?.length ? <div className="v132-quantity-warnings">{comparison.price_warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}</div> : null}
          {comparison.recommendation_reason ? <span>{comparison.recommendation_reason}</span> : null}
          {comparison.live_configured && comparison.needs_postal_code ? <small>Tip: we are using your saved city. Add a postal code only if you want more local results.</small> : null}
          {!comparison.live_configured ? <small>Current Canadian prices are unavailable right now, so Grocery House Manager is automatically using any cached weekly flyers plus your receipt and saved prices instead.</small> : null}
          {comparison.purchase_notes?.length ? <div className="v134-purchase-notes"><strong>Retail package fit</strong>{comparison.purchase_notes.map((note) => <small key={note}>ℹ {note}</small>)}</div> : null}
          </>}
        </div>
      ) : null}

      {comparison && !comparisonDirty && detailsOpen && !comparison.premium_required && comparison.store_options.length ? (
        <div className="whole-list-results">
          {(showAllStores ? comparison.store_options : comparison.store_options.slice(0, 5)).map((store, index) => (
            <article key={store.store_name} className={`v147-store-card ${!comparison.price_review_required && store.complete && index === 0 ? 'best' : ''}`}>
              <button type="button" className="v147-store-head" onClick={() => setExpandedStore(current => current === store.store_name ? null : store.store_name)} aria-expanded={expandedStore===store.store_name}>
                <span>{!comparison.price_review_required && store.complete && index === 0 ? '★ ' : ''}{store.store_name}</span>
                <strong>{money(store.known_total, comparison.currency_code)}{store.complete ? '' : ' known'}</strong>
                <small>{store.priced_items}/{store.total_items} products • {store.source_summary} • {expandedStore===store.store_name ? 'Hide details ↑' : 'View details ↓'}</small>
              </button>
              {expandedStore === store.store_name ? <div className="v147-store-expanded">
                <p>{store.address || 'An exact store branch address was not supplied with these price records. Select a branch before travelling.'}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([store.address || store.store_name, userGeo.city, userGeo.country].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Find nearby branch on Google Maps ↗</a>
                <div className="v147-priced-items">{(store.priced_products || []).map((item, i) => <div key={`${item.name}-${i}`}><span><b>{item.name}</b><small>{item.quantity} {item.unit || ''} × {money(item.unit_price, comparison.currency_code)} · {item.source}{item.purchase_note ? ` · ${item.purchase_note}` : ''}</small></span><strong>{money(item.line_total, comparison.currency_code)}</strong></div>)}</div>
                {store.missing_items.length ? <p>Unavailable prices: {store.missing_items.join(', ')}. These are excluded from the total.</p> : null}
              </div> : null}
            </article>
          ))}
          {!showAllStores && comparison.store_options.length > 5 ? <button type="button" className="secondary v147-more-stores" onClick={() => setShowAllStores(true)}>Show {comparison.store_options.length-5} more stores</button> : null}
          {showAllStores && comparison.store_options.length > 5 ? <button type="button" className="secondary v147-more-stores" onClick={() => setShowAllStores(false)}>Show fewer stores</button> : null}
          {comparison.split_store_total != null ? (
            <div className={comparison.split_store_worth_it ? 'whole-list-split-result worth-it' : 'whole-list-split-result'}>
              <span>Two-store plan • {comparison.split_store_names.join(' + ')}</span>
              <strong>{money(comparison.split_store_total, comparison.currency_code)}</strong>
              <small>{comparison.split_store_recommendation || 'Both stores cover the grocery list with observed prices.'}</small>
              <details className="v147-split-details"><summary>View each product's recommended store</summary>{comparison.split_store_picks.map((pick,i)=><p key={i}>{pick}</p>)}</details>
              {comparison.split_store_names.length === 2 ? <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(comparison.split_store_names[0]+', '+userGeo.city+', '+userGeo.country)}&destination=${encodeURIComponent(comparison.split_store_names[1]+', '+userGeo.city+', '+userGeo.country)}&travelmode=driving`} target="_blank" rel="noreferrer">Explore a two-store route on Google Maps ↗</a> : null}
              <small>Choose the exact branches in Maps; these are retailer-name searches, not verified store addresses or driving distances.</small>
            </div>
          ) : null}
          <p className="small-muted basket-no-guess-note">Only prices we actually found are totaled. Missing prices are never filled with guesses.</p>
        </div>
      ) : null}
    </section>
  );
}

function regionKey(region:{country:string;city:string}) {
  return `${(region.country || 'Canada').trim().toLocaleLowerCase()}|${(region.city || '').trim().toLocaleLowerCase()}`;
}
function clearPricePostal() {
  localStorage.removeItem('ghm_price_postal');
  localStorage.removeItem('ghm_price_postal_location_scope');
}
function scopedPricePostal(region:{country:string;city:string}) {
  // Intentionally invalidate legacy postal values without saved location attribution.
  // A postal code for a previous city must not be reused silently in a trip search.
  const scope=localStorage.getItem('ghm_price_postal_location_scope');
  const value=localStorage.getItem('ghm_price_postal') || '';
  if(!value)return '';
  if(!scope || scope !== regionKey(region)) {clearPricePostal();return '';}
  return value;
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

function SmartShoppingSuggestions({ houseId, selectedList, premiumTry }: { houseId: number; selectedList: ShoppingList | null; premiumTry?: Subscription['premium_try'] }) {
  const initial = cachedLocation();
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country || 'Canada');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedFlyerDeal, setSelectedFlyerDeal] = useState<FlyerOpenDeal | null>(null);

  async function loadSuggestions(nextLat = lat, nextLng = lng, usePremiumTry = false) {
    if (!selectedList) return;
    try {
      setBusy(true);
      const flyerPostal = scopedPricePostal({city,country});
      const { data } = await api.get<ShoppingSuggestions>(`/market/houses/${houseId}/shopping-lists/${selectedList.id}/suggestions`, {
        params: { city: city || undefined, country: country || undefined, postal_code: flyerPostal || undefined, lat: nextLat ?? undefined, lng: nextLng ?? undefined },
        headers: usePremiumTry ? { 'X-GHM-Premium-Try': 'nearby_store_suggestions' } : undefined,
      });
      if (usePremiumTry && !data.premium_required) window.dispatchEvent(new Event('account:refresh'));
      setSuggestions(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Nearby-store/marketplace discovery can involve external providers. Do not fire it merely
    // because the user opened a list; let the user request it when it is useful.
    setSuggestions(null);
    setError('');
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
        <p>Choose a shopping list, then load nearby-store suggestions when you need them.</p>
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
        <span className="badge">On demand</span>
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

      {busy && !suggestions ? <p className="small-muted">Finding useful nearby options…</p> : !suggestions ? <p className="small-muted">Nearby-store discovery stays off until you request it, avoiding unnecessary external lookups.</p> : null}
      {suggestions ? (
        <div className="suggestion-results">
          <div className={suggestions.premium_required ? 'hint' : 'success compact-message'}>{suggestions.message}</div>
          {suggestions.premium_required && premiumTry?.available ? <div className="premium-try-invite-v102 compact">
            <span aria-hidden="true">✨</span><div><strong>Try Smart Nearby Stores once for free</strong><small>{premiumTry.selected_feature === 'nearby_store_suggestions' ? 'Your selection is ready. Run the real nearby-store workflow once.' : 'Use your one free Premium Try here instead of subscribing first.'}</small></div>
            {premiumTry.selected_feature === 'nearby_store_suggestions' ? <button className="primary" type="button" disabled={busy} onClick={() => void loadSuggestions(lat, lng, true)}>Use free try</button> : <Link className="primary center-link" to={`/premium-try?feature=nearby_store_suggestions&house=${houseId}`}>Choose this</Link>}
          </div> : null}
          {!suggestions.premium_required && suggestions.item_suggestions.some((item) => item.flyer_store && item.flyer_price != null) ? (
            <div className="shopping-flyer-match-section">
              <div className="shopping-flyer-match-head">
                <div><p className="eyebrow">Flyer deal for your list</p><h3>Weekly deals matching this grocery list</h3><p className="small-muted">These are current advertised offers for items already on this list. Package sizes and in-store availability should still be confirmed.</p></div>
                <Link className="secondary center-link" to="/market">Open full flyers</Link>
              </div>
              <div className="shopping-flyer-match-grid">
                {suggestions.item_suggestions.filter((item) => item.flyer_store && item.flyer_price != null).map((item) => (
                  <button type="button" className="shopping-flyer-match-card shopping-flyer-match-button" key={`flyer-match-${item.product_id}`} onClick={() => setSelectedFlyerDeal({
                    merchant:item.flyer_store, name:item.flyer_name || item.product_name, brand:item.flyer_brand, price:item.flyer_price, priceRaw:item.flyer_price_raw, discount:item.flyer_discount,
                    imageUrl:item.flyer_image_url, validFrom:item.flyer_valid_from, validTo:item.flyer_valid_to, sourceUrl:item.flyer_source_url, postalCode:localStorage.getItem('ghm_price_postal') || undefined,
                    storeName:item.flyer_store_name || item.flyer_store, storeAddress:item.flyer_store_address, storeMapsUrl:item.flyer_store_maps_url, requestedQuantity:item.requested_quantity,
                  })} aria-label={`Open flyer deal: ${item.flyer_name || item.product_name}`}>
                    <div className="shopping-flyer-thumb">{item.flyer_image_url ? <img src={item.flyer_image_url} alt="" loading="lazy" /> : <span>🏷️</span>}</div>
                    <div className="shopping-flyer-body">
                      <div className="shopping-flyer-badges"><span className="source-badge store-source" data-i18n-skip="true">{item.flyer_store}</span><span className="source-badge flyer-source">Weekly flyer</span></div>
                      <strong data-i18n-skip="true">{item.product_name}</strong>
                      <small data-i18n-skip="true">{item.flyer_name || item.product_name}{item.flyer_brand ? ` • ${item.flyer_brand}` : ''}</small>
                      <div className="shopping-flyer-price"><b>{money(item.flyer_price || 0, suggestions.currency_code)}</b>{item.flyer_price_raw && !String(item.flyer_price_raw).includes(String(item.flyer_price)) ? <small data-i18n-skip="true">{item.flyer_price_raw}</small> : null}</div>
                      <small>{item.flyer_valid_from ? `Valid ${new Date(item.flyer_valid_from).toLocaleDateString()}` : 'Current flyer'}{item.flyer_valid_to ? ` – ${new Date(item.flyer_valid_to).toLocaleDateString()}` : ''}</small>
                      {item.flyer_store_address ? <small className="flyer-store-address">📍 <span data-i18n-skip="true">{item.flyer_store_address}</span></small> : <small>Flyer area: <span data-i18n-skip="true">{localStorage.getItem('ghm_price_postal') || 'local area'}</span></small>}
                      {item.flyer_discount ? <small className="flyer-discount-line" data-i18n-skip="true">{item.flyer_discount}</small> : null}
                      <small className="flyer-honesty-note">Requested quantity: {item.requested_quantity}. Confirm advertised package size before buying.</small>
                      <small className="flyer-open-hint">View deal →</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
      <FlyerDealModal deal={selectedFlyerDeal} onClose={() => setSelectedFlyerDeal(null)} />
    </section>
  );
}

