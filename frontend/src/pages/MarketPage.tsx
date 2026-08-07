import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, House, LivePriceCompareResponse, MarketCapabilities, ProductLookupResult, ProductLookupResponse, Section, User } from '../types';
import { smartProductIcon, smartProductUnit, smartSectionId } from '../smartCategory';

const retailerLabels: Record<string, string> = {
  loblaws: 'Loblaws',
  superstore: 'Real Canadian Superstore',
  nofrills: 'No Frills',
  saveon: 'Save-On-Foods',
  pricesmart: 'PriceSmart Foods',
  tnt: 'T&T Supermarket',
};

function statusLabel(connected: boolean) {
  return connected ? 'Connected' : 'Not connected';
}

function storeSourceLabel(source: string) {
  if (source === 'walmart_ca') return 'Walmart Canada';
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
  const [postalCode, setPostalCode] = useState('');
  const [locationNote, setLocationNote] = useState('Postal code gives the most accurate Canadian store prices.');
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [compare, setCompare] = useState<LivePriceCompareResponse | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [error, setError] = useState('');
  const compareResultsRef = useRef<HTMLDivElement | null>(null);
  const lookupResultsRef = useRef<HTMLDivElement | null>(null);

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

  const activeRetailers = useMemo(
    () => capabilities?.supported_retailers?.length ? capabilities.supported_retailers : ['loblaws', 'superstore', 'nofrills', 'saveon', 'pricesmart', 'tnt'],
    [capabilities],
  );
  const liveConnected = Boolean(capabilities?.apify_configured);

  function toggleRetailer(retailer: string) {
    setSelectedRetailers((current) => current.includes(retailer) ? current.filter((item) => item !== retailer) : [...current, retailer]);
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
      setLocationNote('Using your postal code for local Canadian price results.');
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

  return (
    <main className="page shell wide market-page market-page-v47">
      <header className="topbar market-hero-bar market-hero-v47">
        <div>
          <p className="eyebrow">Prices + product finder</p>
          <h1>Find products and compare grocery prices</h1>
          <p>
            Search product details, add products to inventory, and compare Canadian grocery prices with a clear connection status and saved-price fallback.
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
            <h2>Choose house</h2>
            <p>Feature access is based on the selected house owner&apos;s plan.</p>
          </div>
          <select value={selectedHouseId} onChange={(e) => setSelectedHouseId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose a house</option>
            {houses.map((house) => <option key={house.id} value={house.id}>{house.name} • {house.role}</option>)}
          </select>
        </div>
        {!houses.length && <div className="hint">Create or join a house first, then come back to use market tools.</div>}
        {capabilities && <PlanAccessPreview connected={liveConnected} />}
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
          <p>Search the universal database, or enter a store name like Walmart, No Frills, Superstore, Loblaws, Save-On-Foods, Metro, Food Basics, FreshCo, or Costco for a best-effort store website lookup.</p>
          <form onSubmit={runLookup} className="market-lookup-form market-form-v47">
            <label>Barcode or store item number<input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Example: UPC, Walmart item #, or store product #" /></label>
            <label>Product name<input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Example: milk, rice, cereal" /></label>
            <label>Store name optional<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Example: Walmart, No Frills, Metro. Blank = universal search" /></label>
            <button className="primary" disabled={lookupBusy || !selectedHouseId}>{lookupBusy ? 'Searching...' : 'Search product'}</button>
          </form>
          {addFeedback && <div className={addFeedback.includes('added') ? 'success compact-message' : 'hint'}>{addFeedback}</div>}
          {lookup && (
            <div ref={lookupResultsRef} className={lookup.premium_required ? 'hint' : 'market-results lookup-results-grid'}>
              <p>{lookup.message}</p>
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
                      {item.price != null && <small>Found price: {money(item.price, 'CAD')}</small>}
                      <div className="lookup-actions-row">
                        {item.product_url && <a className="secondary center-link" href={item.product_url} target="_blank" rel="noreferrer">Open product</a>}
                        <button className="primary" type="button" disabled={addBusyKey === key || !selectedHouseId} onClick={() => addLookupToInventory(item)}>
                          {addBusyKey === key ? 'Adding...' : 'Add to inventory'}
                        </button>
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
              {compare.failure_reason && <div className="hint compact-message"><strong>Reason:</strong> {compare.failure_reason}</div>}
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
        <strong>{connected ? 'Live connected' : 'Live not connected'}</strong>
        <span>{connected ? 'Ready for postal-code search' : 'Needs Apify token in backend .env'}</span>
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
