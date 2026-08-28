import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { House, Receipt, ReceiptLineItem } from '../types';

function receiptDateLabel(receipt: Receipt) {
  const value = receipt.receipt_date || receipt.created_at;
  if (!value) return 'Date not saved';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function uploadDateLabel(receipt: Receipt) {
  if (!receipt.created_at) return 'Upload date not available';
  const date = new Date(receipt.created_at);
  if (Number.isNaN(date.getTime())) return 'Upload date not available';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusLabel(status?: string | null) {
  if (!status) return 'Saved';
  return status.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function productRows(receipt: Receipt) {
  return (receipt.line_items || []).filter((line) => line.line_type === 'product');
}

function totalQuantity(lines: ReceiptLineItem[]) {
  return lines.reduce((sum, line) => sum + (line.quantity || 1), 0);
}

export default function ReceiptHistoryPage() {
  const { houseId } = useParams();
  const navigate = useNavigate();
  const id = Number(houseId);
  const [house, setHouse] = useState<House | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadReceipts() {
    try {
      setBusy(true);
      const [houseRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setReceipts(receiptsRes.data);
      setSelectedId((current) => current || receiptsRes.data[0]?.id || null);
      setError('');
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    } finally {
      setBusy(false);
    }
  }

  async function deleteReceipt(receipt: Receipt) {
    const store = receipt.store_name || 'this receipt';
    const confirmed = window.confirm(
      `Delete ${store}? This will remove the receipt photo, extracted rows, saved prices from this receipt, and adjust inventory quantities that were added by this receipt. This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      setDeletingId(receipt.id);
      const { data } = await api.delete<{ ok: boolean; message: string; inventory_adjusted: number; products_deleted: number; prices_deleted: number }>(`/houses/${id}/receipts/${receipt.id}`);
      setReceipts((current) => current.filter((item) => item.id !== receipt.id));
      setSelectedId((current) => {
        if (current !== receipt.id) return current;
        const next = receipts.find((item) => item.id !== receipt.id);
        return next?.id || null;
      });
      setError('');
      window.alert(data.message || 'Receipt deleted successfully.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => { loadReceipts(); }, [id]);

  const filteredReceipts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return receipts;
    return receipts.filter((receipt) => {
      const itemText = productRows(receipt).map((line) => `${line.description} ${line.normalized_name || ''} ${line.matched_product_name || ''}`).join(' ');
      return [receipt.store_name, receipt.receipt_date, receipt.payment_method, receipt.receipt_number, receipt.notes, itemText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [receipts, query]);

  const selectedReceipt = useMemo(() => {
    return filteredReceipts.find((receipt) => receipt.id === selectedId) || filteredReceipts[0] || null;
  }, [filteredReceipts, selectedId]);

  const selectedLines = selectedReceipt ? productRows(selectedReceipt) : [];
  const totalSpend = receipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
  const stores = new Set(receipts.map((receipt) => receipt.store_name).filter(Boolean));
  const rowsSaved = receipts.reduce((sum, receipt) => sum + productRows(receipt).length, 0);

  return (
    <main className="page shell wide receipt-history-page animated-page">
      <header className="topbar creative-topbar">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← Back to house</Link>
          <p className="eyebrow">Receipt history</p>
          <h1>{house?.name || 'House'} receipts</h1>
          <p>Every saved receipt, extracted item row, receipt photo, total, and price-history detail in one clean place.</p>
        </div>
        <div className="topbar-actions">
          <Link to={`/houses/${id}`} className="secondary center-link">House dashboard</Link>
          <Link to={`/houses/${id}/shopping`} className="primary center-link">Open shopping</Link>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {busy && <div className="panel muted-panel">Loading receipt history...</div>}

      <section className="stats-grid four receipt-history-stats">
        <div className="stat-card animated-card"><strong>{receipts.length}</strong><span>Saved receipts</span></div>
        <div className="stat-card animated-card"><strong>{stores.size}</strong><span>Stores tracked</span></div>
        <div className="stat-card animated-card"><strong>{rowsSaved}</strong><span>Product rows saved</span></div>
        <div className="stat-card animated-card"><strong>{money(totalSpend)}</strong><span>Total receipt spend</span></div>
      </section>

      <section className="receipt-history-layout">
        <aside className="receipt-library-panel panel">
          <div className="panel-title-row compact-title-row">
            <div>
              <h2>Saved receipts</h2>
              <p>Search by store, date, product, or payment.</p>
            </div>
          </div>
          <input className="creative-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search receipts..." />
          <div className="receipt-library-list">
            {filteredReceipts.map((receipt) => {
              const lines = productRows(receipt);
              const active = selectedReceipt?.id === receipt.id;
              return (
                <button className={`receipt-library-card ${active ? 'active' : ''}`} type="button" key={receipt.id} onClick={() => setSelectedId(receipt.id)}>
                  <span className="receipt-thumb" aria-hidden="true">
                    {receipt.image_url ? <img src={receipt.image_url} alt="" /> : <span>🧾</span>}
                  </span>
                  <span className="receipt-library-copy">
                    <strong>{receipt.store_name || 'Receipt store'}</strong>
                    <small>{receiptDateLabel(receipt)} • {receipt.total_amount ? money(receipt.total_amount) : `${lines.length} rows`}</small>
                    <em>{lines.length} product rows • uploaded {uploadDateLabel(receipt)}</em>
                  </span>
                </button>
              );
            })}
            {!filteredReceipts.length && (
              <div className="receipt-empty-state">
                <span>🧾</span>
                <strong>No receipts found</strong>
                <p>Try another search. If you haven't saved a receipt yet, scan one and your history will build automatically.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="receipt-detail-panel panel">
          {selectedReceipt ? (
            <>
              <div className="receipt-detail-hero">
                <div className="receipt-detail-photo">
                  {selectedReceipt.image_url ? <img src={selectedReceipt.image_url} alt={`${selectedReceipt.store_name || 'Receipt'} uploaded receipt`} /> : <span>🧾</span>}
                </div>
                <div className="receipt-detail-summary">
                  <p className="eyebrow">Saved receipt</p>
                  <h2>{selectedReceipt.store_name || 'Receipt store'}</h2>
                  <div className="receipt-detail-badges">
                    <span className="graphical-source-badge receipt">🧾 Receipt date: {receiptDateLabel(selectedReceipt)}</span>
                    <span className="graphical-source-badge saved">📤 Uploaded: {uploadDateLabel(selectedReceipt)}</span>
                    <span className="graphical-source-badge live">✅ {statusLabel(selectedReceipt.ocr_status)}</span>
                  </div>
                  <div className="receipt-total-card">
                    <span>Total</span>
                    <strong>{selectedReceipt.total_amount !== null && selectedReceipt.total_amount !== undefined ? money(selectedReceipt.total_amount) : 'Not saved'}</strong>
                  </div>
                  <button className="danger receipt-delete-button" type="button" disabled={deletingId === selectedReceipt.id} onClick={() => deleteReceipt(selectedReceipt)}>
                    {deletingId === selectedReceipt.id ? 'Deleting...' : 'Delete receipt'}
                  </button>
                </div>
              </div>

              <div className="receipt-detail-meta-grid">
                <span><strong>Subtotal</strong>{selectedReceipt.subtotal_amount !== null && selectedReceipt.subtotal_amount !== undefined ? money(selectedReceipt.subtotal_amount) : '-'}</span>
                <span><strong>Discount</strong>{selectedReceipt.discount_amount ? `-${money(selectedReceipt.discount_amount)}` : '-'}</span>
                <span><strong>Tax</strong>{selectedReceipt.tax_amount !== null && selectedReceipt.tax_amount !== undefined ? money(selectedReceipt.tax_amount) : '-'}</span>
                <span><strong>Payment</strong>{selectedReceipt.payment_method || '-'}</span>
                <span><strong>Receipt #</strong>{selectedReceipt.receipt_number || '-'}</span>
                <span><strong>Items</strong>{selectedLines.length} rows • {totalQuantity(selectedLines)} total qty</span>
              </div>

              {selectedReceipt.notes && (
                <div className="receipt-note-card">
                  <strong>Notes</strong>
                  <p>{selectedReceipt.notes}</p>
                </div>
              )}

              <div className="receipt-items-section">
                <div className="panel-title-row compact-title-row">
                  <div>
                    <h3>Extracted product rows</h3>
                    <p>These are the reviewed rows saved from the receipt.</p>
                  </div>
                </div>
                <div className="receipt-items-list">
                  {selectedLines.map((line) => (
                    <article className="receipt-item-card" key={line.id}>
                      <div>
                        <strong>{line.matched_product_name || line.normalized_name || line.description}</strong>
                        <small>{line.description}</small>
                      </div>
                      <div className="receipt-item-numbers">
                        <span><em>Qty</em>{line.quantity || 1} {line.line_unit || 'pcs'}</span>
                        <span><em>Unit price</em>{line.unit_price !== null && line.unit_price !== undefined ? `${money(line.unit_price)} / ${line.line_unit || 'unit'}` : '-'}</span>
                        <span><em>Total</em>{line.line_total !== null && line.line_total !== undefined ? money(line.line_total) : '-'}</span>
                        {line.discount_amount ? <span><em>Discount</em>-{money(line.discount_amount)}</span> : null}
                      </div>
                    </article>
                  ))}
                  {!selectedLines.length && <p className="small-muted">No product rows were saved for this receipt.</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="receipt-empty-state large">
              <span>🧾</span>
              <strong>No saved receipts yet</strong>
              <p>Scan your first receipt, review the extracted items, and save it. Grocery House Manager will automatically keep the receipt, store prices, and household history here.</p>
              <Link className="primary center-link" to={`/houses/${id}/scan`}>Scan my first receipt</Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
