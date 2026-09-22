import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { AccountBootstrap, House, Product, Receipt, SavingsLedger, SavingsSummary } from '../types';

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}


export default function ReportsPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | ''>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [ledger, setLedger] = useState<SavingsLedger | null>(null);

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
      const [productsRes, receiptsRes, savingsRes, ledgerRes] = await Promise.all([
        api.get<Product[]>(`/houses/${houseId}/products`, { params: { sort_by: 'name' } }),
        api.get<Receipt[]>(`/houses/${houseId}/receipts`),
        api.get<SavingsSummary>(`/insights/houses/${houseId}/savings`, { params: { t: Date.now() } }),
        api.get<SavingsLedger>(`/insights/houses/${houseId}/savings-ledger`, { params: { t: Date.now() } }),
      ]);
      setProducts(productsRes.data);
      setReceipts(receiptsRes.data);
      setSavings(savingsRes.data);
      setLedger(ledgerRes.data);
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
  const trackedSpend = receipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
  const selectedHouse = houses.find((house) => house.id === Number(selectedHouseId));

  function exportBestPrices() {
    const rows = [
      ['Product', 'Section', 'Best store', 'Best price', 'Unit', 'Other saved stores'],
      ...bestPriceRows.map((row) => [
        row.product.name,
        row.product.section_name || 'Inventory',
        row.best.store_name,
        row.best.price,
        row.product.unit || 'unit',
        row.alternatives.map((entry) => `${entry.store_name}: ${money(entry.price)} / ${row.product.unit || 'unit'}`).join(' | '),
      ]),
    ];
    downloadCsv(`grocery-house-manager-best-prices-${selectedHouse?.name || 'house'}.csv`, rows);
  }

  function exportReceiptInsights() {
    const rows = [
      ['Store', 'Date', 'Subtotal', 'Discount', 'Tax', 'Total', 'Status'],
      ...receipts.map((receipt) => [
        receipt.store_name || 'Store',
        receipt.receipt_date || receipt.created_at.slice(0, 10),
        receipt.subtotal_amount ?? '',
        receipt.discount_amount ?? '',
        receipt.tax_amount ?? '',
        receipt.total_amount ?? '',
        receipt.ocr_status,
      ]),
    ];
    downloadCsv(`grocery-house-manager-receipts-${selectedHouse?.name || 'house'}.csv`, rows);
  }

  return (
    <main className="page shell wide reports-page">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Savings Ledger & reports</h1>
          <p>See what Grocery House Manager can actually prove, what savings opportunities are still open, and the store/receipt evidence behind the numbers.</p>
        </div>
        <div className="topbar-actions report-actions">
          <select value={selectedHouseId} onChange={(e) => setSelectedHouseId(e.target.value ? Number(e.target.value) : '')}>
            {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
          </select>
          <button className="secondary" type="button" onClick={exportBestPrices} disabled={!bestPriceRows.length}>Export price CSV</button>
          <button className="primary" type="button" onClick={exportReceiptInsights} disabled={!receipts.length}>Export receipt insights</button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {busy && <div className="hint">Loading your household summary…</div>}

      {!busy && !houses.length && !error ? (
        <section className="guided-empty-state">
          <span aria-hidden="true">🏡</span>
          <div><p className="eyebrow">Start here</p><h2>Create your Grocery Home first</h2><p>Reports appear automatically after you add groceries and save reviewed receipts. There is nothing to configure here.</p></div>
          <Link to="/houses" className="primary center-link">Create my Home</Link>
        </section>
      ) : null}

      {!busy && selectedHouseId && products.length === 0 && receipts.length === 0 ? (
        <section className="guided-empty-state">
          <span aria-hidden="true">🧾</span>
          <div><p className="eyebrow">Your reports will build automatically</p><h2>Scan your first receipt</h2><p>Review and save one receipt and Grocery House Manager will start building spending, store, price, and savings history for you.</p></div>
          <div className="guided-empty-actions"><Link to={`/houses/${selectedHouseId}/scan`} className="primary center-link">Scan a receipt</Link><Link to={`/houses/${selectedHouseId}/inventory`} className="secondary center-link">Add groceries instead</Link></div>
        </section>
      ) : null}

      <section className="stats-grid four">
        <div className="stat-card"><strong>{products.length}</strong><span>Products</span></div>
        <div className="stat-card"><strong>{totalKnownPrices}</strong><span>Prices remembered</span></div>
        <div className="stat-card savings-stat-card"><strong>{money(savings?.estimated_savings || 0, savings?.currency_code)}</strong><span>Estimated savings this month</span></div>
        <div className="stat-card warning"><strong>{lowStock + expiring}</strong><span>Need attention</span></div>
      </section>

      <section className="savings-proof-panel">
        <div>
          <p className="eyebrow">Did the subscription pay for itself?</p>
          <h2>{savings && savings.estimated_savings > 0 ? `${money(savings.estimated_savings, savings.currency_code)} estimated savings in ${savings.month_label}` : 'Your savings summary builds automatically'}</h2>
          <p>{savings?.message || 'Scan reviewed receipts and shop normally. Grocery House Manager will build this summary automatically from real prices and discounts.'}</p>
        </div>
        <div className="savings-proof-grid">
          <span><strong>{money(savings?.receipt_discounts || 0, savings?.currency_code)}</strong><small>receipt discounts</small></span>
          <span><strong>{money(savings?.lower_price_choices || 0, savings?.currency_code)}</strong><small>cheaper choices you made</small></span>
          <span><strong>{money(savings?.plan_monthly_cost || 0, savings?.currency_code)}</strong><small>monthly plan price</small></span>
          <span className={(savings?.savings_after_plan_cost || 0) >= 0 ? 'positive' : ''}><strong>{money(savings?.savings_after_plan_cost || 0, savings?.currency_code)}</strong><small>savings after plan price</small></span>
        </div>
        {savings?.roi_multiple ? <div className="savings-roi-banner">Tracked savings are {savings.roi_multiple}× the monthly subscription price.</div> : null}
      </section>

      <section className="v91-report-ledger">
        <div className="v91-report-ledger-head">
          <div><p className="eyebrow">GHM SAVINGS LEDGER</p><h2>Verified value and opportunities are kept separate.</h2><p>{ledger?.message || 'The ledger builds from reviewed receipts, completed shopping prices and current household opportunities.'}</p></div>
          <div className="v91-report-ledger-kpis"><span><small>Verified</small><strong>{money(ledger?.verified_total || 0, ledger?.currency_code)}</strong></span><span><small>Open opportunities</small><strong>{money(ledger?.potential_total || 0, ledger?.currency_code)}</strong></span><span className={(ledger?.verified_after_plan_cost || 0) >= 0 ? 'positive' : 'negative'}><small>After plan cost</small><strong>{money(ledger?.verified_after_plan_cost || 0, ledger?.currency_code)}</strong></span></div>
        </div>
        <div className="v91-report-ledger-list">
          {ledger?.entries.slice(0, 12).map((entry) => <div key={entry.key} className={entry.verified ? 'verified' : 'potential'}><span>{entry.verified ? '✓' : '◇'}</span><div><strong>{entry.title}</strong><small>{entry.evidence}</small><em>{entry.source_label}{entry.occurred_on ? ` · ${entry.occurred_on}` : ''}</em></div><b>{entry.verified ? '+' : '~'}{money(entry.amount, ledger.currency_code)}</b></div>)}
          {!ledger?.entries.length ? <p className="small-muted">No ledger entries yet. Normal receipt scanning and completed shopping trips will create evidence automatically.</p> : null}
        </div>
        <Link to={`/assistant?house=${selectedHouseId}#money`} className="secondary center-link">Open Autopilot money decisions →</Link>
      </section>

      <section className="report-highlight-card">
        <strong>Export-ready personal insights</strong>
        <span>Download your saved receipt history and best-known store prices as CSV files. Use them for budgeting, grocery planning, or your own spreadsheet analysis.</span>
      </section>

      <div className="reports-grid">
        <section className="panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Family Plus</p>
              <h2>Best known prices by product</h2>
              <p>Built from prices found in your reviewed receipts and shopping history.</p>
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
                    <td>{money(row.best.price)} / {row.product.unit || 'unit'}</td>
                    <td>{row.alternatives.map((entry) => `${entry.store_name}: ${money(entry.price)} / ${row.product.unit || 'unit'}`).join(' • ') || '-'}</td>
                  </tr>
                ))}
                {!bestPriceRows.length && <tr><td colSpan={4}>No prices remembered yet. Scan a receipt or save a product price and this table will fill in automatically.</td></tr>}
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
            {!storeRows.length && <p className="small-muted">No store history yet. Scan your first receipt and your store summary will appear here automatically.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
