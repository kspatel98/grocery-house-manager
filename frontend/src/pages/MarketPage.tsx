import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, FlyerDealsResponse, House, LivePriceCompareResponse, MarketCapabilities, ProductLookupResult, ProductLookupResponse, Section, User } from '../types';
import { smartProductIcon, smartProductUnit, smartSectionId } from '../smartCategory';

const retailerLabels: Record<string, string> = {
  loblaws: 'Loblaws',
  superstore: 'Real Canadian Superstore',
  nofrills: 'No Frills',
  saveon: 'Save-On-Foods',
  pricesmart: 'PriceSmart Foods',
  tnt: 'T&T Supermarket',
};


const featuredFlyerMerchants = [
  'No Frills',
  'Walmart',
  'FreshCo',
  'Food Basics',
  'Fortinos',
  'Real Canadian Superstore',
  'Loblaws',
  'Metro',
  'Sobeys',
  'Costco',
];

function statusLabel(connected: boolean) {
  return connected ? 'Connected' : 'Not connected';
}

function storeSourceLabel(source: string) {
  if (source === 'walmart_ca') return 'Walmart Canada';
  if (source.includes('internet')) return 'Official web result';
  if (source === 'open_food_facts') return 'Universal product database';
  if (source.endsWith('_website')) {
    return source.replace('_website', '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return source.replace(/_/g, ' ');
}

export default function MarketPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | ''>('');
  const [user, setUser] = useState<User | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [capabilities, setCapabilities] = useState<MarketCapabilities | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [lookup, setLookup] = useState<ProductLookupResponse | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [addBusyKey, setAddBusyKey] = useState('');
  const [addFeedback, setAddFeedback] = useState('');
  const [itemsText, setItemsText] = useState('milk\neggs\nbread');
  const [postalCode, setPostalCode] = useState(() => localStorage.getItem('ghm_price_postal') || '');
  const [flyerQuery, setFlyerQuery] = useState('');
  const [flyers, setFlyers] = useState<FlyerDealsResponse | null>(null);
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [locationNote, setLocationNote] = useState('Postal code gives the most accurate Canadian store prices.');
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedFlyerMerchants, setSelectedFlyerMerchants] = useState<string[]>([]);
  const [compare, setCompare] = useState<LivePriceCompareResponse | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [error, setError] = useState('');
  const compareResultsRef = useRef<HTMLDivElement | null>(null);
  const lookupResultsRef = useRef<HTMLDivElement | null>(null);
  const flyerResultsRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError('');
      const [{ data: boot }, { data: caps }] = await Promise.all([
        api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } }),
        api.get<MarketCapabilities>('/market/capabilities'),
      ]);
      const nextHouses = Array.isArray(boot.houses) ? boot.houses : [];
      setHouses(nextHouses);
      setUser(boot.user);
      setCapabilities(caps);
      if (!selectedHouseId && nextHouses[0]) setSelectedHouseId(nextHouses[0].id);
      localStorage.setItem('account_profile_cache', JSON.stringify(boot.user));
      localStorage.setItem('account_is_admin', boot.is_admin ? 'true' : 'false');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadSections(houseId: number | '') {
    if (!houseId) {
      setSections([]);
      return;
    }
    try {
      const { data } = await api.get<Section[]>(`/houses/${houseId}/sections`);
      setSections(Array.isArray(data) ? data : []);
    } catch {
      setSections([]);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { loadSections(selectedHouseId); }, [selectedHouseId]);
  useEffect(() => {
    if (compare) setTimeout(() => compareResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [compare]);
  useEffect(() => {
    if (lookup) setTimeout(() => lookupResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [lookup]);
  useEffect(() => {
    if (flyers) setTimeout(() => flyerResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [flyers]);

  const activeRetailers = useMemo(
    () => capabilities?.supported_retailers?.length ? capabilities.supported_retailers : ['loblaws', 'superstore', 'nofrills', 'saveon', 'pricesmart', 'tnt'],
    [capabilities],
  );
  const liveConnected = Boolean(capabilities?.apify_configured);

  function toggleRetailer(retailer: string) {
    setSelectedRetailers((current) => current.includes(retailer) ? current.filter((item) => item !== retailer) : [...current, retailer]);
  }

  function toggleFlyerMerchant(merchant: string) {
    setSelectedFlyerMerchants((current) => current.includes(merchant) ? current.filter((item) => item !== merchant) : [...current, merchant]);
  }

  async function runLookup(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedHouseId) {
      setError('Choose a house first. Plan access is based on the house owner\'s plan.');
      return;
    }
    if (!productSearch.trim() && !barcode.trim()) return;
    try {
      setLookupBusy(true);
      setLookup(null);
      setAddFeedback('');
      setError('');
      const { data } = await api.get<ProductLookupResponse>(`/market/houses/${selectedHouseId}/product-lookup`, {
        params: {
          query: productSearch.trim() || undefined,
          barcode: barcode.trim() || undefined,
          store_name: storeName.trim() || undefined,
        },
      });
      setLookup(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLookupBusy(false);
    }
  }

  async function addLookupToInventory(item: ProductLookupResult) {
    if (!selectedHouseId) return;
    if (!sections.length) {
      setAddFeedback('Create at least one inventory section first, then add this product.');
      return;
    }
    const key = `${item.source}-${item.barcode || item.name}`;
    const sectionId = smartSectionId(item.name, sections, item.categories || []);
    if (!sectionId) {
      setAddFeedback('Create at least one inventory section first, then add this product.');
      return;
    }
    try {
      setAddBusyKey(key);
      setAddFeedback('');
      await api.post(`/houses/${selectedHouseId}/sections/${sectionId}/products`, {
        name: item.name,
        image_url: item.image_url || null,
        icon: smartProductIcon(item.name, '🛒', item.categories || []),
        quantity: 0,
        unit: smartProductUnit(item.name, 'pcs', item.categories || []),
        price: item.price ?? null,
        store_name: item.store_name && item.store_name !== 'Universal product database' ? item.store_name : null,
        brand: item.brand || null,
        barcode: item.barcode || null,
        low_stock_threshold: 1,
        notes: item.product_url ? `Added from product lookup. Product page: ${item.product_url}` : 'Added from product lookup.',
      });
      setAddFeedback(`${item.name} added to inventory. You can edit quantity, unit, category, expiry, and price anytime.`);
    } catch (err) {
      setAddFeedback(errorMessage(err));
    } finally {
      setAddBusyKey('');
    }
  }

  async function submitCompare(params: { postal?: string; lat?: number; lng?: number; city?: string; country?: string; forceRefresh?: boolean }) {
    if (!selectedHouseId) {
      setError('Choose a house first. Plan access is based on the house owner\'s plan.');
      return;
    }
    const items = itemsText.split('\n').map((item) => item.trim()).filter(Boolean);
    if (!items.length) {
      setError('Enter at least one grocery item to compare.');
      return;
    }
    try {
      setCompareBusy(true);
      setCompare(null);
      setError('');
      const { data } = await api.post<LivePriceCompareResponse>(`/market/houses/${selectedHouseId}/price-compare`, {
        items,
        postal_code: params.postal || undefined,
        lat: params.lat,
        lng: params.lng,
        city: params.city,
        province: params.country === 'Canada' ? undefined : params.country,
        retailers: selectedRetailers,
        force_refresh: params.forceRefresh || false,
      });
      setCompare(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCompareBusy(false);
    }
  }

  async function runCompare(forceRefresh = false) {
    const typedPostal = postalCode.trim();
    if (typedPostal) {
      localStorage.setItem('ghm_price_postal', typedPostal.toUpperCase());
      setLocationNote('Using your postal code for local Canadian price results. This device will reuse it automatically for whole-list comparison.');
      await submitCompare({ postal: typedPostal, forceRefresh });
      return;
    }
    if (navigator.geolocation) {
      setLocationNote('Postal code is blank, so we are asking for your current area. You can deny and we will use your profile city.');
      setCompareBusy(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCompareBusy(false);
          setLocationNote('Using your current area. Add a postal code anytime for better accuracy.');
          submitCompare({ lat: position.coords.latitude, lng: position.coords.longitude, forceRefresh });
        },
        () => {
          setCompareBusy(false);
          const profileCity = user?.city || '';
          const profileCountry = user?.country || 'Canada';
          setLocationNote(profileCity ? `Location permission was denied. Using your profile city: ${profileCity}.` : 'Location permission was denied. Add a postal code for local results.');
          submitCompare({ city: profileCity, country: profileCountry, forceRefresh });
        },
        { enableHighAccuracy: false, timeout: 9000 },
      );
      return;
    }
    setLocationNote('This device does not support location access. Using your profile city.');
    await submitCompare({ city: user?.city || '', country: user?.country || 'Canada', forceRefresh });
  }

  async function loadFlyers(forceRefresh = false) {
    if (!selectedHouseId) {
      setError('Choose a house first.');
      return;
    }
    const typedPostal = postalCode.trim().toUpperCase();
    if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(typedPostal)) {
      setError('Enter a complete Canadian postal code, for example L8P 1A1, to load local weekly flyers.');
      return;
    }
    try {
      setFlyerBusy(true);
      setError('');
      localStorage.setItem('ghm_price_postal', typedPostal);
      const { data } = await api.get<FlyerDealsResponse>(`/market/houses/${selectedHouseId}/flyers`, {
        params: {
          postal_code: typedPostal,
          query: flyerQuery.trim() || undefined,
          merchants: selectedFlyerMerchants.length ? selectedFlyerMerchants.join(',') : undefined,
          force_refresh: forceRefresh || undefined,
          t: Date.now(),
        },
      });
      setFlyers(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFlyerBusy(false);
    }
  }

  return (
    <main className="page shell wide market-page market-page-v47">
      <header className="topbar market-hero-bar market-hero-v47">
        <div>
          <p className="eyebrow">Find & compare</p>
          <h1>Find products and compare grocery prices</h1>
          <p>
            Find a grocery product or compare Canadian prices. Grocery House Manager uses the best available source automatically and falls back to prices you have already saved when needed.
          </p>
        </div>
        <div className="market-status-stack">
          <span className={liveConnected ? 'market-status-pill connected' : 'market-status-pill offline'}>
            <span className="status-dot" /> Live prices: {statusLabel(liveConnected)}
          </span>
          <Link to="/pricing" className="secondary center-link">Plan access</Link>
          <button className="secondary" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="panel market-access-panel animated-card-lift">
        <div className="panel-title-row">
          <div>
            <h2>Choose your Grocery Home</h2>
            <p>Pick the Home whose groceries you want to search or compare.</p>
          </div>
          <select value={selectedHouseId} onChange={(e) => setSelectedHouseId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose a house</option>
            {houses.map((house) => <option key={house.id} value={house.id}>{house.name} • {house.role}</option>)}
          </select>
        </div>
        {!houses.length && <div className="guided-inline-empty"><span aria-hidden="true">🏡</span><div><strong>Create or join a Grocery Home first</strong><small>Once you have a Home, prices can connect directly to its inventory and shopping lists.</small></div><Link to="/houses" className="primary center-link">Start setup</Link></div>}
        {capabilities && <PlanAccessPreview connected={liveConnected} />}
      </section>

      <section className="panel weekly-flyer-panel animated-card-lift">
        <div className="panel-title-row flyer-title-row">
          <div>
            <p className="eyebrow">Family Plus • weekly savings</p>
            <h2>Weekly flyers near your Grocery Home</h2>
            <p>Pull structured sale prices for your postal code, cache them for your area, and reuse them in whole-list shopping comparisons.</p>
          </div>
          <span className={capabilities?.flyer_configured ? 'market-status-pill connected' : 'market-status-pill offline'}>
            <span className="status-dot" /> Flyers: {capabilities?.flyer_configured ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="flyer-search-grid">
          <label>Canadian postal code<input value={postalCode} onChange={(e) => setPostalCode(e.target.value.toUpperCase())} placeholder="L8P 1A1" maxLength={7} /></label>
          <label>Find an item in this week’s flyers<input value={flyerQuery} onChange={(e) => setFlyerQuery(e.target.value)} placeholder="Milk, atta, tomatoes, paneer…" /></label>
        </div>
        <div>
          <small className="small-muted">Optional store filter. Leave every store unselected to let the flyer provider use its local grocery-store set.</small>
          <div className="retailer-chip-grid flyer-retailer-chips">
            {featuredFlyerMerchants.map((merchant) => (
              <button key={`flyer-${merchant}`} type="button" className={selectedFlyerMerchants.includes(merchant) ? 'retailer-chip active' : 'retailer-chip'} onClick={() => toggleFlyerMerchant(merchant)}>
                {merchant}
              </button>
            ))}
          </div>
        </div>
        <div className="market-button-row">
          <button className="primary" type="button" disabled={flyerBusy || !selectedHouseId} onClick={() => void loadFlyers(false)}>{flyerBusy ? 'Loading flyers…' : 'Find weekly deals'}</button>
          <button className="secondary" type="button" disabled={flyerBusy || !selectedHouseId} onClick={() => void loadFlyers(true)}>Refresh flyer data</button>
        </div>
        {flyers ? (
          <div ref={flyerResultsRef} className={flyers.premium_required || !flyers.configured ? 'hint flyer-results-wrap' : 'flyer-results-wrap'}>
            <div className="compare-summary-card">
              <span className={flyers.configured ? 'market-status-pill connected' : 'market-status-pill offline'}><span className="status-dot" /> {flyers.cached ? 'Cached local flyers' : 'Fresh local flyers'}</span>
              {flyers.postal_code ? <span className="source-badge location-source">📍 {flyers.postal_code}</span> : null}
              {flyers.fetched_at ? <span className="source-badge flyer-source">Updated {new Date(flyers.fetched_at).toLocaleString()}</span> : null}
            </div>
            <p>{flyers.message}</p>
            {flyers.deals.length ? (
              <div className="flyer-deal-grid">
                {flyers.deals.slice(0, 60).map((deal, index) => (
                  <article className="flyer-deal-card" key={`${deal.merchant}-${deal.item_id || deal.name}-${index}`}>
                    <div className="flyer-deal-image">{deal.image_url ? <img src={deal.image_url} alt="" loading="lazy" /> : <span>🛒</span>}</div>
                    <div className="flyer-deal-content">
                      <div className="flyer-deal-badges">
                        <span className="source-badge store-source">{deal.merchant}</span>
                        {deal.change_type === 'price_drop' ? <span className="source-badge flyer-drop">↓ Price drop</span> : null}
                        {deal.is_multi_product_bundle ? <span className="source-badge flyer-bundle">Bundle offer</span> : null}
                      </div>
                      <strong>{deal.name}</strong>
                      {deal.brand ? <small>{deal.brand}</small> : null}
                      <div className="flyer-price-row">
                        <b>{deal.price != null ? money(deal.price, 'CAD') : deal.price_raw || 'See flyer'}</b>
                        {deal.previous_price != null && deal.price != null && deal.previous_price > deal.price ? <small>was {money(deal.previous_price, 'CAD')}</small> : null}
                      </div>
                      <small>{deal.valid_from ? `Valid ${new Date(deal.valid_from).toLocaleDateString()}` : 'Current flyer'}{deal.valid_to ? ` – ${new Date(deal.valid_to).toLocaleDateString()}` : ''}</small>
                      {deal.is_multi_product_bundle ? <small className="flyer-honesty-note">Shown as an offer only; excluded from exact basket pricing.</small> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="market-layout-grid">
        <section className="panel market-tool-card lookup-card-v47 animated-card-lift">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Basic Home+</p>
              <h2>Product lookup</h2>
            </div>
            <span className="badge access-basic">Basic Home+</span>
          </div>
          <p>Search a product by barcode, store item number, or name. Add a store name like Costco or Walmart to search official store pages first; blank store searches the universal product database.</p>
          <form onSubmit={runLookup} className="market-lookup-form market-form-v47">
            <label>Barcode or store item number<input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Example: UPC, Walmart item #, or store product #" /></label>
            <label>Product name<input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Example: milk, rice, cereal" /></label>
            <label>Store name optional<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Example: Costco, Walmart, No Frills. Blank = universal search" /></label>
            <button className="primary" disabled={lookupBusy || !selectedHouseId}>{lookupBusy ? 'Searching...' : 'Search product'}</button>
          </form>
          {addFeedback && <div className={addFeedback.includes('added') ? 'success compact-message' : 'hint'}>{addFeedback}</div>}
          {lookup && (
            <div ref={lookupResultsRef} className={lookup.premium_required ? 'hint' : 'market-results lookup-results-grid'}>
              <div className="lookup-status-panel-v50">
                {lookup.lookup_status && <span className={lookup.results.length ? 'market-status-pill connected' : 'market-status-pill offline'}><span className="status-dot" /> {lookup.lookup_status}</span>}
                <p>{lookup.message}</p>
              </div>
              {lookup.results.map((item) => {
                const key = `${item.source}-${item.barcode || item.name}`;
                return (
                  <div className="product-lookup-result lookup-result-card-v47" key={key}>
                    {item.image_url ? <img src={item.image_url} alt="" /> : <div className="lookup-image-placeholder">🛒</div>}
                    <div className="lookup-result-body">
                      <div className="lookup-badges">
                        <span className="source-badge product-source">{storeSourceLabel(item.source)}</span>
                        {item.store_name && <span className="source-badge store-source">{item.store_name}</span>}
                      </div>
                      <strong>{item.name}</strong>
                      <small>{[item.brand, item.quantity, item.barcode].filter(Boolean).join(' • ') || 'Review details before saving'}</small>
                      <small>{item.categories?.slice(0, 4).join(', ') || 'Category can be edited later'}{item.nutrition_grade ? ` • Nutri-Score ${item.nutrition_grade.toUpperCase()}` : ''}</small>
                      {item.lookup_note && <small className="lookup-note-v49">{item.lookup_note}</small>}
                      {item.price != null && <small>Found price: {money(item.price, 'CAD')}</small>}
                      <div className="lookup-actions-row">
                        {item.product_url && <a className="secondary center-link" href={item.product_url} target="_blank" rel="noreferrer">{item.found === false ? 'Open store search' : 'Open product'}</a>}
                        {item.found === false ? (
                          <span className="hint tiny-hint">Confirm details on the store page first.</span>
                        ) : (
                          <button className="primary" type="button" disabled={addBusyKey === key || !selectedHouseId} onClick={() => addLookupToInventory(item)}>
                            {addBusyKey === key ? 'Adding...' : 'Add to inventory'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel market-tool-card live-price-card live-price-v47 animated-card-lift">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Family Plus+</p>
              <h2>Canadian price comparison</h2>
            </div>
            <span className="badge access-family">Family Plus+</span>
          </div>
          <p>Use a Canadian postal code for best results. If left blank, the app asks for location access. If denied, it uses your saved profile city.</p>
          <label>Postal code<input value={postalCode} onChange={(e) => setPostalCode(e.target.value.toUpperCase())} placeholder="Example: L8P 1A1" /></label>
          <p className="small-muted location-note">{locationNote}</p>
          <label>Items, one per line<textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={5} /></label>
          <div className="retailer-chip-grid">
            {activeRetailers.map((retailer) => (
              <button key={retailer} type="button" className={selectedRetailers.includes(retailer) ? 'retailer-chip active' : 'retailer-chip'} onClick={() => toggleRetailer(retailer)}>
                {retailerLabels[retailer] || retailer}
              </button>
            ))}
          </div>
          <div className="market-button-row">
            <button className="primary" disabled={compareBusy || !selectedHouseId} onClick={() => runCompare(false)}>{compareBusy ? 'Comparing...' : 'Compare prices'}</button>
            <button className="secondary" disabled={compareBusy || !selectedHouseId} onClick={() => runCompare(true)}>Refresh live</button>
          </div>
          {compare && (
            <div ref={compareResultsRef} className={compare.premium_required || (!compare.configured && !compare.results.length) ? 'hint' : 'market-results'}>
              <div className="compare-summary-card">
                <span className={compare.connection_status === 'connected' ? 'market-status-pill connected' : 'market-status-pill offline'}>
                  <span className="status-dot" /> {compare.connection_status === 'connected' ? 'Connected' : 'Not connected'}
                </span>
                {compare.location_label && <span className="source-badge location-source">📍 {compare.location_label}</span>}
                {compare.used_fallback && <span className="source-badge fallback-source">Saved prices shown</span>}
              </div>
              <p>{compare.message}</p>
              {compare.failure_reason && <div className="hint compact-message"><strong>What happened:</strong> {compare.failure_reason}</div>}
              {compare.results.length > 0 && <PriceComparisonTable data={compare} />}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PlanAccessPreview({ connected }: { connected: boolean }) {
  return (
    <div className="market-plan-access-preview">
      <div className="market-access-chip unlocked">
        <strong>Basic Home+</strong>
        <span>Product lookup + add to inventory</span>
      </div>
      <div className="market-access-chip family">
        <strong>Family Plus+</strong>
        <span>Canadian price comparison</span>
      </div>
      <div className={connected ? 'market-access-chip pro connected' : 'market-access-chip pro offline'}>
        <strong>{connected ? 'Current prices ready' : 'Current prices unavailable'}</strong>
        <span>{connected ? 'Ready to check prices near you' : 'Receipt and saved prices still work automatically'}</span>
      </div>
    </div>
  );
}

function sourceBadge(rowSource: string) {
  if (rowSource === 'recent_receipt') return '🧾 Recent receipt';
  if (rowSource === 'saved_price') return '🏷️ Saved price';
  if (rowSource === 'apify_canada') return '⚡ Live compare';
  return rowSource.replace(/_/g, ' ');
}

function PriceComparisonTable({ data }: { data: LivePriceCompareResponse }) {
  return (
    <div className="market-table-wrap market-table-v47">
      <table className="market-price-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Store</th>
            <th>Address</th>
            <th>Matched product</th>
            <th>Price</th>
            <th>Unit</th>
            <th>Confidence</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((row, index) => {
            const effectivePrice = row.sale_price ?? row.price;
            const storeLabel = row.banner || row.store_name || row.retailer || 'Store';
            return (
              <tr key={`${row.item}-${row.retailer}-${index}`}>
                <td data-label="Item">{row.item}</td>
                <td data-label="Store">{storeLabel}</td>
                <td data-label="Address">{row.store_address || (row.store_url ? <a href={row.store_url} target="_blank" rel="noreferrer">Open store</a> : 'Address not provided')}</td>
                <td data-label="Matched product">{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">{row.matched_product_name || 'Open product'}</a> : row.matched_product_name || '—'}</td>
                <td data-label="Price">{effectivePrice != null ? money(effectivePrice, data.currency_code) : '—'}{row.is_on_sale ? ' sale' : ''}</td>
                <td data-label="Unit">{row.unit_price || row.package_size || '—'}</td>
                <td data-label="Confidence">
                  <span className="confidence-pill">{row.match_confidence || 'Review'}</span>
                  {row.confidence_explanation && <small>{row.confidence_explanation}</small>}
                </td>
                <td data-label="Source"><span className="source-badge live-source">{sourceBadge(row.raw_source)}</span>{row.scraped_at ? <small>{new Date(row.scraped_at).toLocaleDateString()}</small> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
