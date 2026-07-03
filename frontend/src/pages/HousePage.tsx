import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, HouseMember, Product, Receipt, Section, ShoppingList, User } from '../types';
import ProductModal from '../components/ProductModal';
import SectionManager from '../components/SectionManager';
import { ActivityFeed, MembersPanel } from '../components/HouseInfoPanels';

export default function HousePage() {
  const { houseId } = useParams();
  const navigate = useNavigate();
  const id = Number(houseId);
  const currentUser: User | null = JSON.parse(localStorage.getItem('user') || 'null');
  const [house, setHouse] = useState<House | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [sortBy, setSortBy] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<number | ''>('');
  const [productModal, setProductModal] = useState<{ mode: 'create' | 'edit'; product?: Product; sectionId?: number } | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    try {
      const [houseRes, sectionsRes, productsRes, listRes, membersRes, activitiesRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined } }),
        api.get<ShoppingList | null>(`/houses/${id}/shopping-lists/active`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 30 } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
      setProducts(productsRes.data);
      setActiveList(listRes.data);
      setMembers(membersRes.data);
      setReceipts(receiptsRes.data);
      setActivities(activitiesRes.data);
      setReceipts(receiptsRes.data);
      setError('');
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    }
  }

  async function loadProducts() {
    try {
      const { data } = await api.get<Product[]>(`/houses/${id}/products`, {
        params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined },
      });
      setProducts(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadShoppingAndActivity() {
    try {
      const [listRes, productsRes, activitiesRes, membersRes, receiptsRes] = await Promise.all([
        api.get<ShoppingList | null>(`/houses/${id}/shopping-lists/active`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined } }),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 30 } }),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setActiveList(listRes.data);
      setProducts(productsRes.data);
      setActivities(activitiesRes.data);
      setReceipts(receiptsRes.data);
      setMembers(membersRes.data);
      setReceipts(receiptsRes.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function createInvite() {
    try {
      const { data } = await api.post(`/houses/${id}/invite`);
      setInviteUrl(data.join_url);
      await navigator.clipboard?.writeText(data.join_url);
      loadShoppingAndActivity();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeProduct(productId: number) {
    if (!confirm('Delete this product from inventory?')) return;
    try {
      await api.delete(`/houses/${id}/products/${productId}`);
      loadShoppingAndActivity();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function leaveHouse() {
    if (!confirm('Leave this house? You will lose access until someone sends you a new invite link.')) return;
    try {
      await api.post(`/houses/${id}/leave`);
      navigate('/houses');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteHouse() {
    if (!confirm('Delete this house permanently? This removes all sections, products, grocery lists, and activities.')) return;
    try {
      await api.delete(`/houses/${id}`);
      navigate('/houses');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeMember(member: HouseMember) {
    const label = member.full_name || member.email;
    if (!confirm(`Kick ${label} out of this house? They will lose access immediately.`)) return;
    try {
      await api.delete(`/houses/${id}/members/${member.id}`);
      await loadShoppingAndActivity();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const lowStockProducts = useMemo(() => products.filter((p) => p.is_low_stock), [products]);
  const expiringProducts = useMemo(() => products.filter((p) => p.is_expiring_soon), [products]);

  useEffect(() => { loadAll(); }, [id]);
  useHouseLiveRefresh(id, loadAll);
  useEffect(() => { loadProducts(); }, [sortBy, direction, sectionFilter]);

  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>{house?.name || 'House'}</h1>
          <p>Shared grocery inventory, house members, activity notifications, and shopping list. House capacity follows the owner's plan.</p>
          {house?.owner_name && <small className="small-muted">Owner: {house.owner_name}{house.owner_plan_name ? ` • Owner plan: ${house.owner_plan_name}` : ''}</small>}
        </div>
        <div className="topbar-actions">
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <Link to="/profile" className="secondary center-link">Profile</Link>
          <button onClick={createInvite} className="secondary">Copy invite link</button>
        </div>
      </header>

      {inviteUrl && <div className="success">Invite copied: {inviteUrl}</div>}
      {error && <div className="error">{error}</div>}

      <section className="stats-grid four">
        <div className="stat-card"><strong>{products.length}</strong><span>Total products</span></div>
        <div className="stat-card warning"><strong>{lowStockProducts.length}</strong><span>Low stock</span></div>
        <div className="stat-card danger"><strong>{expiringProducts.length}</strong><span>Expiring soon</span></div>
        <div className="stat-card"><strong>{members.length}</strong><span>House members</span></div>
      </section>

      <div className="two-column">
        <section>
          <SectionManager houseId={id} sections={sections} onChange={loadAll} />
          <div className="panel inventory-header">
            <div>
              <h2>Inventory</h2>
              <p>Add, edit, remove, filter, and sort your grocery products.</p>
            </div>
            <button className="primary" onClick={() => setProductModal({ mode: 'create', sectionId: sections[0]?.id })}>Add product</button>
          </div>

          <div className="filters">
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

          <div className="products-grid">
            {products.map((product) => (
              <article key={product.id} className="product-card">
                <div className="product-media">
                  {product.image_url ? <img src={product.image_url} alt="" /> : <span>{product.icon || '🛒'}</span>}
                </div>
                <div className="product-body">
                  <strong>{product.name}</strong>
                  <small>{product.section_name} • {product.store_name || 'Any store'}</small>
                  <div className="product-meta">
                    <span>{product.quantity} {product.unit}</span>
                    {product.price !== undefined && product.price !== null && <span>${product.price.toFixed(2)}</span>}
                  </div>
                  {product.store_prices?.length ? (
                    <div className="store-price-list">
                      {product.store_prices.slice(0, 3).map((price) => (
                        <span key={price.id}>{price.store_name}: ${price.price.toFixed(2)}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="badges">
                    {product.is_low_stock && <span className="badge warning">Low stock</span>}
                    {product.is_expiring_soon && <span className="badge danger">Expiring soon</span>}
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
        </section>

        <aside>
          <ShoppingSummaryCard houseId={id} activeList={activeList} />
          <ReceiptPanel houseId={id} products={products} receipts={receipts} onChange={loadShoppingAndActivity} />
          <HouseActionsPanel house={house} memberCount={members.length} onLeave={leaveHouse} onDelete={deleteHouse} />
          <MembersPanel members={members} currentUserId={currentUser?.id} houseRole={house?.role} onRemoveMember={removeMember} />
          <ActivityFeed activities={activities} onRefresh={loadShoppingAndActivity} />
        </aside>
      </div>

      {productModal && (
        <ProductModal
          houseId={id}
          sections={sections}
          modal={productModal}
          onClose={() => setProductModal(null)}
          onSaved={() => { setProductModal(null); loadShoppingAndActivity(); }}
        />
      )}
    </main>
  );
}




function ReceiptPanel({ houseId, products, receipts, onChange }: { houseId: number; products: Product[]; receipts: Receipt[]; onChange: () => void | Promise<void> }) {
  const [storeName, setStoreName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [price, setPrice] = useState('');
  const [lines, setLines] = useState<{ product_id: number; product_name: string; price: number; store_name?: string }[]>([]);
  const [error, setError] = useState('');

  function addLine() {
    const product = products.find((p) => p.id === Number(selectedProductId));
    const parsedPrice = Number(price);
    if (!product || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Choose a product and enter a valid price.');
      return;
    }
    setLines((prev) => [...prev, { product_id: product.id, product_name: product.name, price: parsedPrice, store_name: storeName || product.store_name }]);
    setSelectedProductId('');
    setPrice('');
    setError('');
  }

  async function saveReceipt() {
    if (!lines.length) {
      setError('Add at least one product price from the receipt.');
      return;
    }
    try {
      await api.post(`/houses/${houseId}/receipts`, {
        store_name: storeName || null,
        image_url: imageUrl || null,
        notes: notes || null,
        items: lines.map((line) => ({ product_id: line.product_id, price: line.price, store_name: line.store_name || storeName || null })),
      });
      setStoreName('');
      setImageUrl('');
      setNotes('');
      setLines([]);
      setError('');
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="panel receipt-panel">
      <h2>Receipts & price updates</h2>
      <p>Upload receipt details to keep product prices updated by store. One product can keep prices for multiple stores.</p>
      {error && <div className="error">{error}</div>}
      <label>Store name<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Costco, Walmart, No Frills" /></label>
      <label>Receipt image URL<input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Optional image URL" /></label>
      <div className="receipt-line-builder">
        <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Select product</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" />
        <button className="secondary" type="button" onClick={addLine}>Add</button>
      </div>
      {lines.length > 0 && (
        <div className="receipt-lines">
          {lines.map((line, index) => (
            <span key={`${line.product_id}-${index}`}>{line.product_name} • {line.store_name || storeName || 'Store'} • ${line.price.toFixed(2)}</span>
          ))}
        </div>
      )}
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt notes" /></label>
      <button className="primary full" onClick={saveReceipt} disabled={!lines.length}>Save receipt prices</button>
      {receipts.length > 0 && <small className="small-muted">Latest receipt: {receipts[0].store_name || 'Store'} • {new Date(receipts[0].created_at).toLocaleDateString()}</small>}
    </section>
  );
}

function HouseActionsPanel({ house, memberCount, onLeave, onDelete }: { house: House | null; memberCount: number; onLeave: () => void; onDelete: () => void }) {
  if (!house) return null;
  const isOwner = house.role === 'owner';
  const canDelete = isOwner && memberCount === 1;

  return (
    <section className="panel danger-zone">
      <h2>House access</h2>
      {isOwner ? (
        <>
          <p>You are the owner. You can kick other members out, but you can delete the house only when you are the only member left.</p>
          <button className="danger full" onClick={onDelete} disabled={!canDelete}>
            Delete house
          </button>
          {!canDelete && <small className="small-muted">Remove all other members first. Current members: {memberCount}</small>}
        </>
      ) : (
        <>
          <p>You are a member. You can leave this house, but only the owner can remove other users or delete the house.</p>
          <button className="danger full" onClick={onLeave}>Leave house</button>
        </>
      )}
    </section>
  );
}

function ShoppingSummaryCard({ houseId, activeList }: { houseId: number; activeList: ShoppingList | null }) {
  const toBuy = activeList?.items.filter((item) => item.status === 'to_buy').length || 0;
  const inCart = activeList?.items.filter((item) => item.status === 'in_cart').length || 0;

  return (
    <section className="panel shopping-summary-card">
      <div className="panel-title-row">
        <div>
          <h2>Grocery shopping</h2>
          <p>Open the full shopping page to create or manage multiple lists.</p>
        </div>
      </div>
      {activeList ? (
        <div className="summary-list-card">
          <strong>{activeList.title}</strong>
          <small>{toBuy} products to buy • {inCart} added in cart</small>
        </div>
      ) : (
        <p className="small-muted">No active grocery list yet.</p>
      )}
      <Link className="primary full center-link" to={`/houses/${houseId}/shopping`}>
        Open grocery lists
      </Link>
    </section>
  );
}
