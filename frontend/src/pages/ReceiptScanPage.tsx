import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import ReceiptStudio from '../components/ReceiptStudio';
import type { House, Product, Receipt, Section } from '../types';

const PRODUCT_LIMIT = 500;

export default function ReceiptScanPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const navigate = useNavigate();
  const [house, setHouse] = useState<House | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const [houseRes, sectionsRes, productsRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: 'name', direction: 'asc', limit: PRODUCT_LIMIT } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
      setProducts(productsRes.data);
      setReceipts(receiptsRes.data);
      setError('');
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  return (
    <main className="page shell wide receipt-scan-page cinematic-page">
      <header className="page-hero creative-hero scan-hero">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← {house?.name || 'House'} dashboard</Link>
          <p className="eyebrow">Smart Receipt Studio</p>
          <h1>Scan, review, and save receipt prices</h1>
          <p>
            Keep the scanning task focused on one clean page. Upload a JPG or PNG receipt, review the extracted rows, then save trusted prices into this house.
          </p>
        </div>
        <div className="hero-orb-card" aria-hidden="true">
          <span>🧾</span>
          <strong>JPG / PNG</strong>
          <small>Review required</small>
        </div>
      </header>

      <nav className="house-mini-nav" aria-label="House sections">
        <Link to={`/houses/${id}/inventory`}>📦 Inventory</Link>
        <Link to={`/houses/${id}/shopping`}>🛒 Grocery lists</Link>
        <Link to={`/houses/${id}/receipts`} >🗂️ Receipt history</Link>
        <Link to="/reports">📈 Reports</Link>
      </nav>

      {loading && <section className="panel skeleton-panel">Loading receipt scanner...</section>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && <ReceiptStudio houseId={id} products={products} sections={sections} receipts={receipts} onChange={load} />}
    </main>
  );
}
