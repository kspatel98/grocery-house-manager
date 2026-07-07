import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, House, LivePriceCompareResponse, MarketCapabilities, ProductLookupResponse } from '../types';

const retailerLabels: Record<string, string> = {
  loblaws: 'Loblaws',
  superstore: 'Real Canadian Superstore',
  nofrills: 'No Frills',
  saveonfoods: 'Save-On-Foods',
  pricesmart: 'PriceSmart Foods',
  tnt: 'T&T Supermarket',
};

export default function MarketPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | ''>('');
  const [capabilities, setCapabilities] = useState<MarketCapabilities | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lookup, setLookup] = useState<ProductLookupResponse | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [itemsText, setItemsText] = useState('milk\neggs\nbread');
  const [location, setLocation] = useState('Hamilton, ON');
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [compare, setCompare] = useState<LivePriceCompareResponse | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const [{ data: boot }, { data: caps }] = await Promise.all([
        api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } }),
        api.get<MarketCapabilities>('/market/capabilities'),
      ]);
      const nextHouses = Array.isArray(boot.houses) ? boot.houses : [];
      setHouses(nextHouses);
      setCapabilities(caps);
      if (!selectedHouseId && nextHouses[0]) setSelectedHouseId(nextHouses[0].id);
      localStorage.setItem('account_profile_cache', JSON.stringify(boot.user));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { load(); }, []);

  const activeRetailers = useMemo(
    () => capabilities?.supported_retailers?.length ? capabilities.supported_retailers : ['loblaws', 'superstore', 'nofrills', 'saveonfoods', 'pricesmart', 'tnt'],
    [capabilities],
  );

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
      setError('');
      const { data } = await api.get<ProductLookupResponse>(`/market/houses/${selectedHouseId}/product-lookup`, {
        params: { query: productSearch.trim() || undefined, barcode: barcode.trim() || undefined },
      });
      setLookup(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLookupBusy(false);
    }
  }

  async function runCompare(forceRefresh = false) {
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
        location: location.trim() || undefined,
        retailers: selectedRetailers,
        force_refresh: forceRefresh,
      });
      setCompare(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCompareBusy(false);
    }
  }

  return (
    <main className="page shell wide market-page">
      <header className="topbar market-hero-bar">
        <div>
          <p className="eyebrow">Market tools</p>
          <h1>Find product details and compare grocery prices</h1>
          <p>
            Search product details, compare supported Canadian grocery prices, and use your household price history to shop smarter. Prices are latest available estimates and may vary by location, loyalty offers, and availability.
          </p>
        </div>
        <div className="topbar-actions">
          <Link to="/pricing" className="secondary center-link">Plan access</Link>
          <button className="secondary" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="panel market-access-panel">
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
        {capabilities && <PlanAccessPreview configured={capabilities.apify_configured} />}
      </section>

      <div className="market-layout-grid">
        <section className="panel market-tool-card">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Basic Home+</p>
              <h2>Product lookup</h2>
            </div>
            <span className="badge access-basic">Basic Home+</span>
          </div>
          <p>Search by barcode or product name to quickly collect product name, brand, image, category, and nutrition grade before adding inventory.</p>
          <form onSubmit={runLookup} className="market-lookup-form">
            <label>Barcode<input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Example: 3017624010701" /></label>
            <label>Product name<input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Example: milk, rice, cereal" /></label>
            <button className="primary" disabled={lookupBusy || !selectedHouseId}>{lookupBusy ? 'Searching...' : 'Search product'}</button>
          </form>
          {lookup && (
            <div className={lookup.premium_required ? 'hint' : 'market-results'}>
              <p>{lookup.message}</p>
              {lookup.results.map((item) => (
                <div className="product-lookup-result" key={`${item.barcode}-${item.name}`}>
                  {item.image_url && <img src={item.image_url} alt="" />}
                  <div>
                    <strong>{item.name}</strong>
                    <small>{[item.brand, item.quantity, item.barcode].filter(Boolean).join(' • ')}</small>
                    <small>{item.categories?.slice(0, 4).join(', ') || 'No category'}{item.nutrition_grade ? ` • Nutri-Score ${item.nutrition_grade.toUpperCase()}` : ''}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel market-tool-card live-price-card">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Family Plus+</p>
              <h2>Canadian price comparison</h2>
            </div>
            <span className="badge access-family">Family Plus+</span>
          </div>
          <p>Compare a small basket across supported Canadian retailers. Saved results are reused for a short time so the page stays fast.</p>
          <label>Location or postal code<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hamilton, ON or L8P" /></label>
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
            <div className={compare.premium_required || !compare.configured ? 'hint' : 'market-results'}>
              <p>{compare.message}</p>
              {compare.results.length > 0 && <PriceComparisonTable data={compare} />}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PlanAccessPreview({ configured }: { configured: boolean }) {
  return (
    <div className="market-plan-access-preview">
      <div className="market-access-chip unlocked">
        <strong>Basic Home+</strong>
        <span>Product lookup</span>
      </div>
      <div className="market-access-chip family">
        <strong>Family Plus+</strong>
        <span>Canadian price comparison</span>
      </div>
      <div className="market-access-chip pro">
        <strong>Household Pro</strong>
        <span>Nearby store suggestions</span>
      </div>
      {!configured && <div className="market-access-chip locked"><strong>Live prices</strong><span>Waiting for setup</span></div>}
    </div>
  );
}

function PriceComparisonTable({ data }: { data: LivePriceCompareResponse }) {
  return (
    <div className="market-table-wrap">
      <table className="market-price-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Store</th>
            <th>Matched product</th>
            <th>Price</th>
            <th>Unit</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((row, index) => {
            const effectivePrice = row.sale_price ?? row.price;
            return (
              <tr key={`${row.item}-${row.retailer}-${index}`}>
                <td>{row.item}</td>
                <td>{row.banner || row.store_name || row.retailer || 'Store'}</td>
                <td>{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">{row.matched_product_name || 'Open product'}</a> : row.matched_product_name || '—'}</td>
                <td>{effectivePrice != null ? money(effectivePrice, data.currency_code) : '—'}{row.is_on_sale ? ' sale' : ''}</td>
                <td>{row.unit_price || row.package_size || '—'}</td>
                <td>{row.match_confidence || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
