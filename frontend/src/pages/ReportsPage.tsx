import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, House, Product, Receipt } from '../types';

export default function ReportsPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | ''>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadHouses() {
    try {
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      setHouses(data.houses || []);
      if (!selectedHouseId && data.houses?.length) setSelectedHouseId(data.houses[0].id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadHouseReport(houseId: number) {
    try {
      setBusy(true);
      const [productsRes, receiptsRes] = await Promise.all([
        api.get<Product[]>(`/houses/${houseId}/products`, { params: { sort_by: 'name' } }),
        api.get<Receipt[]>(`/houses/${houseId}/receipts`),
      ]);
      setProducts(productsRes.data);
      setReceipts(receiptsRes.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadHouses(); }, []);
  useEffect(() => { if (selectedHouseId) loadHouseReport(Number(selectedHouseId)); }, [selectedHouseId]);

  const storeRows = useMemo(() => {
    const byStore = new Map<string, { store: string; count: number; total: number; products: string[] }>();
    for (const product of products) {
      for (const entry of product.store_prices || []) {
        const row = byStore.get(entry.store_name) || { store: entry.store_name, count: 0, total: 0, products: [] };
        row.count += 1;
        row.total += entry.price;
        row.products.push(product.name);
        byStore.set(entry.store_name, row);
      }
    }
    return Array.from(byStore.values()).sort((a, b) => b.count - a.count || a.store.localeCompare(b.store));
  }, [products]);

  const bestPriceRows = useMemo(() => {
    return products
      .map((product) => {
        const prices = [...(product.store_prices || [])].sort((a, b) => a.price - b.price);
        return { product, best: prices[0], alternatives: prices.slice(1, 4) };
      })
      .filter((row) => row.best)
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [products]);

  const totalKnownPrices = products.reduce((sum, product) => sum + (product.store_prices?.length || 0), 0);
  const lowStock = products.filter((product) => product.is_low_stock).length;
  const expiring = products.filter((product) => product.is_expiring_soon).length;

  return (
    <main className="page shell wide reports-page">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Reports & store comparison</h1>
          <p>Clear premium insights from your saved products, receipts, and store price history.</p>
        </div>
        <div className="topbar-actions">
          <select value={selectedHouseId} onChange={(e) => setSelectedHouseId(e.target.value ? Number(e.target.value) : '')}>
            {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
          </select>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {busy && <div className="hint">Loading report...</div>}

      <section className="stats-grid four">
        <div className="stat-card"><strong>{products.length}</strong><span>Products</span></div>
        <div className="stat-card"><strong>{totalKnownPrices}</strong><span>Known store prices</span></div>
        <div className="stat-card warning"><strong>{lowStock}</strong><span>Low stock</span></div>
        <div className="stat-card danger"><strong>{expiring}</strong><span>Expiring soon</span></div>
      </section>

      <div className="reports-grid">
        <section className="panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Family Plus</p>
              <h2>Best known prices by product</h2>
              <p>Based on your saved product prices and receipt entries.</p>
            </div>
          </div>
          <div className="comparison-table-wrap">
            <table className="admin-table comparison-table">
              <thead><tr><th>Product</th><th>Best store</th><th>Best price</th><th>Other saved stores</th></tr></thead>
              <tbody>
                {bestPriceRows.map((row) => (
                  <tr key={row.product.id}>
                    <td><strong>{row.product.name}</strong><small>{row.product.section_name || 'Inventory'}</small></td>
                    <td>{row.best.store_name}</td>
                    <td>{money(row.best.price)}</td>
                    <td>{row.alternatives.map((entry) => `${entry.store_name}: ${money(entry.price)}`).join(' • ') || '-'}</td>
                  </tr>
                ))}
                {!bestPriceRows.length && <tr><td colSpan={4}>No store prices yet. Add product prices or upload receipts to build comparison reports.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Monthly household view</p>
              <h2>Store activity</h2>
              <p>{receipts.length} receipt{receipts.length === 1 ? '' : 's'} saved for this house.</p>
            </div>
          </div>
          <div className="store-report-list">
            {storeRows.map((row) => (
              <div key={row.store} className="store-report-card">
                <strong>{row.store}</strong>
                <span>{row.count} saved price{row.count === 1 ? '' : 's'}</span>
                <small>Average saved price: {money(row.total / row.count)}</small>
              </div>
            ))}
            {!storeRows.length && <p className="small-muted">No store activity yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
