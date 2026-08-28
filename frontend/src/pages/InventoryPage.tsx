import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import ProductModal from '../components/ProductModal';
import SectionManager from '../components/SectionManager';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import type { House, Product, Section } from '../types';

const PRODUCT_PAGE_LIMIT = 240;

export default function InventoryPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const navigate = useNavigate();
  const [house, setHouse] = useState<House | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sortBy, setSortBy] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<number | ''>('');
  const [productModal, setProductModal] = useState<{ mode: 'create' | 'edit'; product?: Product; sectionId?: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadShell() {
    try {
      const [houseRes, sectionsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    }
  }

  async function loadProducts() {
    try {
      const { data } = await api.get<Product[]>(`/houses/${id}/products`, {
        params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined, limit: PRODUCT_PAGE_LIMIT },
      });
      setProducts(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    await loadShell();
    await loadProducts();
  }

  async function removeProduct(productId: number) {
    if (!confirm('Delete this product from inventory?')) return;
    try {
      await api.delete(`/houses/${id}/products/${productId}`);
      loadProducts();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    setHouse(null);
    setSections([]);
    setProducts([]);
    setSearch('');
    setSectionFilter('');
    setError('');
    setLoading(true);
    loadAll();
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { loadProducts(); }, 300);
    return () => window.clearTimeout(timer);
  }, [sortBy, direction, sectionFilter, search]);

  const outOfStock = useMemo(() => products.filter((p) => p.is_out_of_stock || p.quantity <= 0).length, [products]);
  const lowStock = useMemo(() => products.filter((p) => p.is_low_stock && !(p.is_out_of_stock || p.quantity <= 0)).length, [products]);
  const expired = useMemo(() => products.filter((p) => p.is_expired).length, [products]);

  return (
    <main className="page shell wide inventory-page cinematic-page">
      <header className="page-hero creative-hero inventory-hero">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← {house?.name || 'Home'}</Link>
          <p className="eyebrow">What’s at home</p>
          <h1>Your grocery inventory</h1>
          <p>Keep a simple picture of what you already have. Add everyday groceries first; low-stock, expiry, meal, and shopping suggestions will build automatically.</p>
        </div>
        <button className="primary glow-action" onClick={() => setProductModal({ mode: 'create' })}>+ Add product</button>
      </header>

      <HouseContextSwitcher currentHouseId={id} currentHouseName={house?.name} section="inventory" />

      <nav className="house-mini-nav" aria-label="House sections">
        <Link to={`/houses/${id}/shopping`}>🛒 Grocery lists</Link>
        <Link to={`/houses/${id}/scan`}>🧾 Scan receipt</Link>
        <Link to={`/houses/${id}/receipts`}>🗂️ Receipt history</Link>
        <Link to="/market">🏷️ Prices</Link>
      </nav>

      {error && <div className="error">{error}</div>}
      <section className="stats-grid four stats-ribbon">
        <div className="stat-card"><strong>{products.length}</strong><span>Visible products</span></div>
        <div className="stat-card danger"><strong>{outOfStock}</strong><span>Out of stock</span></div>
        <div className="stat-card warning"><strong>{lowStock}</strong><span>Low stock</span></div>
        <div className="stat-card danger"><strong>{expired}</strong><span>Expired</span></div>
      </section>

      <section className="panel inventory-control-panel">
        <div className="inventory-header">
          <div>
            <h2>Inventory sections</h2>
            <p>Use sections to keep grocery items easy to find.</p>
          </div>
        </div>
        <SectionManager houseId={id} sections={sections} onChange={loadAll} />
      </section>

      <section className="panel inventory-control-panel">
        <div className="inventory-header">
          <div>
            <h2>Products</h2>
            <p>Showing up to {PRODUCT_PAGE_LIMIT} products for speed. Search to find more items quickly.</p>
          </div>
        </div>
        <div className="filters creative-filters">
          <input placeholder="Search product..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadProducts()} />
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Product name</option>
            <option value="store_name">Store name</option>
            <option value="price">Price</option>
            <option value="quantity">Quantity</option>
            <option value="expiry_date">Expiry date</option>
            <option value="created_at">Newest</option>
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button onClick={loadProducts} className="secondary">Search</button>
        </div>
      </section>

      {loading && <section className="panel skeleton-panel">Loading inventory...</section>}
      {!loading && products.length === 0 && !search && !sectionFilter ? (
        <section className="guided-empty-state inventory-first-empty">
          <span aria-hidden="true">🥛</span>
          <div><p className="eyebrow">Start with what you already have</p><h2>Add your first grocery</h2><p>Try milk, eggs, rice, bread, or anything your household buys often. Add five everyday items and the guided setup will move you to Shopping automatically.</p></div>
          <button type="button" className="primary" onClick={() => setProductModal({ mode: 'create' })}>Add first grocery</button>
        </section>
      ) : null}
      {!loading && products.length > 0 && products.length < 5 && !search && !sectionFilter ? (
        <div className="starter-inventory-progress"><span>Quick start</span><strong>{products.length}/5 groceries added</strong><small>Add {5 - products.length} more everyday item{5 - products.length === 1 ? '' : 's'} and the guide will move to your first shopping list.</small></div>
      ) : null}
      <div className="products-grid animated-card-grid">
        {products.map((product) => (
          <article key={product.id} className="product-card elevated-card">
            <ProductVisual product={product} />
            <div className="product-body">
              <strong>{product.name}</strong>
              <small>{product.section_name} • {product.store_name || 'Any store'}</small>
              <div className="product-meta">
                <span>{product.quantity} {product.unit}</span>
                {product.price !== undefined && product.price !== null && <span>{money(product.price)} / {product.unit || 'unit'}</span>}
              </div>
              {product.store_prices?.length ? (
                <div className="store-price-list">
                  {product.store_prices.slice(0, 3).map((price) => (
                    <span key={price.id}>{price.store_name}: {money(price.price)} / {product.unit || 'unit'}</span>
                  ))}
                </div>
              ) : null}
              <div className="badges graphical-badges">
                {(product.is_out_of_stock || product.quantity <= 0) && <span className="badge danger">Out of stock</span>}
                {product.is_expired && <span className="badge danger">Expired</span>}
                {product.is_low_stock && !(product.is_out_of_stock || product.quantity <= 0) && <span className="badge warning">Low stock</span>}
                {product.is_expiring_soon && !product.is_expired && <span className="badge danger">Expiring soon</span>}
              </div>
              {product.notes && <p className="notes">{product.notes}</p>}
            </div>
            <div className="card-actions">
              <button onClick={() => setProductModal({ mode: 'edit', product })}>Edit</button>
              <button onClick={() => removeProduct(product.id)}>Remove</button>
            </div>
          </article>
        ))}
      </div>

      {productModal && (
        <ProductModal
          houseId={id}
          sections={sections}
          modal={productModal}
          onClose={() => setProductModal(null)}
          onSaved={() => { setProductModal(null); window.dispatchEvent(new Event('account:refresh')); loadAll(); }}
        />
      )}
    </main>
  );
}

function ProductVisual({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(product.image_url && !failed);
  return (
    <div className={`product-media ${hasImage ? 'has-image' : 'icon-only'}`}>
      {hasImage ? (
        <img
          src={product.image_url}
          alt={`${product.name} product image`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="product-media-emoji" aria-hidden="true">{product.icon || '🛒'}</span>
      )}
    </div>
  );
}
