import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import ReceiptStudio from '../components/ReceiptStudio';
import type { House, Product, Receipt, Section, ShoppingList } from '../types';

const PRODUCT_LIMIT = 500;

export default function ReceiptScanPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialShoppingListId = Number(searchParams.get('shoppingListId') || 0) || null;
  const [house, setHouse] = useState<House | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const [houseRes, sectionsRes, productsRes, receiptsRes, listsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: 'name', direction: 'asc', limit: PRODUCT_LIMIT } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`, { params: { include_done: true } }),
      ]);
      setHouse(houseRes.data); setSections(sectionsRes.data); setProducts(productsRes.data); setReceipts(receiptsRes.data); setShoppingLists(listsRes.data); setError('');
    } catch (err) {
      const message = errorMessage(err); setError(message); if (message.includes('not a member')) navigate('/houses');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);
  useHouseLiveRefresh(id, load);

  return (
    <main className="page shell wide receipt-scan-page v85-receipt-page">
      <header className="v85-page-titlebar">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← {house?.name || 'House'} dashboard</Link>
          <p className="eyebrow">SMART RECEIPT WORKSPACE</p>
          <h1>Scan receipt</h1>
          <p>Turn one grocery receipt into organized inventory, shopping verification, saved prices and an optional shared expense.</p>
        </div>
        <nav aria-label="Receipt shortcuts">
          <Link to={`/houses/${id}/shopping`}>🛒 Shopping</Link>
          <Link to={`/houses/${id}/receipts`}>🗂️ History</Link>
          <Link to={`/houses/${id}/expenses`}>💸 Expenses</Link>
        </nav>
      </header>
      {loading && <section className="panel skeleton-panel">Loading receipt scanner…</section>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && <ReceiptStudio houseId={id} products={products} sections={sections} receipts={receipts} shoppingLists={shoppingLists} initialShoppingListId={initialShoppingListId} onChange={load} />}
    </main>
  );
}
