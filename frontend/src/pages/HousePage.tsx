import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, HouseMember, Product, Receipt, ReceiptLineItem, ReceiptUploadResult, Section, ShoppingList, User } from '../types';
import ProductModal from '../components/ProductModal';
import SectionManager from '../components/SectionManager';
import { ActivityFeed, HouseMembersBar, MembersDrawer } from '../components/HouseInfoPanels';

const PRODUCT_PAGE_LIMIT = 240;

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
  const [membersOpen, setMembersOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  async function loadAll() {
    try {
      const [houseRes, sectionsRes, productsRes, listRes, membersRes, activitiesRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Section[]>(`/houses/${id}/sections`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined, limit: PRODUCT_PAGE_LIMIT } }),
        api.get<ShoppingList | null>(`/houses/${id}/shopping-lists/active`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 20 } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setSections(sectionsRes.data);
      setProducts(productsRes.data);
      setActiveList(listRes.data);
      setMembers(membersRes.data);
      setReceipts(receiptsRes.data);
      setActivities(activitiesRes.data);
      setError('');
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadProducts() {
    try {
      const { data } = await api.get<Product[]>(`/houses/${id}/products`, {
        params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined, limit: PRODUCT_PAGE_LIMIT },
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
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction, section_id: sectionFilter || undefined, search: search || undefined, limit: PRODUCT_PAGE_LIMIT } }),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 20 } }),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setActiveList(listRes.data);
      setProducts(productsRes.data);
      setActivities(activitiesRes.data);
      setReceipts(receiptsRes.data);
      setMembers(membersRes.data);
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
    const label = member.full_name || 'this member';
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
  useHouseLiveRefresh(id, loadShoppingAndActivity);
  useEffect(() => {
    const timer = window.setTimeout(() => { loadProducts(); }, 300);
    return () => window.clearTimeout(timer);
  }, [sortBy, direction, sectionFilter, search]);

  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>{house?.name || 'House'}</h1>
          <p>Shared inventory, shopping lists, receipts, store prices, members, and recent activity in one simple house dashboard.</p>
          {house?.owner_name && <small className="small-muted">Owner: {house.owner_name}{house.owner_plan_name ? ` • Owner plan: ${house.owner_plan_name}` : ''}</small>}
        </div>
        <div className="topbar-actions">
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <Link to="/profile" className="secondary center-link">Profile</Link>
          <button onClick={() => setMembersOpen(true)} className="secondary">Members ({members.length})</button>
          <button onClick={createInvite} className="secondary">Copy invite link</button>
        </div>
      </header>

      {inviteUrl && <div className="success">Invite copied: {inviteUrl}</div>}
      {error && <div className="error">{error}</div>}
      {initialLoading && <div className="panel muted-panel">Loading house dashboard...</div>}

      <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={() => setMembersOpen(true)} />

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
          <p className="small-muted inventory-result-note">Showing up to {PRODUCT_PAGE_LIMIT} products for speed. Use search or filters to find more items.</p>

          <div className="products-grid">
            {products.map((product) => (
              <article key={product.id} className="product-card">
                <ProductVisual product={product} />
                <div className="product-body">
                  <strong>{product.name}</strong>
                  <small>{product.section_name} • {product.store_name || 'Any store'}</small>
                  <div className="product-meta">
                    <span>{product.quantity} {product.unit}</span>
                    {product.price !== undefined && product.price !== null && <span>{money(product.price)}</span>}
                  </div>
                  {product.store_prices?.length ? (
                    <div className="store-price-list">
                      {product.store_prices.slice(0, 3).map((price) => (
                        <span key={price.id}>{price.store_name}: {money(price.price)}</span>
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

      <MembersDrawer
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        currentUserId={currentUser?.id}
        houseRole={house?.role}
        onRemoveMember={removeMember}
        onCreateInvite={createInvite}
        inviteUrl={inviteUrl}
      />
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

type ReviewLine = {
  id?: number;
  description: string;
  product_id: number | '';
  quantity: string;
  unit_price: string;
  line_total: string;
  discount_amount: string;
  tax_amount: string;
  line_type: string;
  is_selected: boolean;
  needs_review?: boolean;
  confidence?: number | null;
};

function lineFromReceiptItem(item: ReceiptLineItem): ReviewLine {
  return {
    id: item.id,
    description: item.description,
    product_id: item.matched_product_id || '',
    quantity: item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '',
    unit_price: item.unit_price !== null && item.unit_price !== undefined ? String(item.unit_price) : '',
    line_total: item.line_total !== null && item.line_total !== undefined ? String(item.line_total) : '',
    discount_amount: item.discount_amount !== null && item.discount_amount !== undefined ? String(item.discount_amount) : '',
    tax_amount: item.tax_amount !== null && item.tax_amount !== undefined ? String(item.tax_amount) : '',
    line_type: item.line_type || 'product',
    is_selected: item.is_selected !== false && item.line_type !== 'discount' && item.line_type !== 'tax',
    needs_review: item.needs_review,
    confidence: item.confidence,
  };
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceLabel(value?: number | null) {
  if (value === null || value === undefined) return 'Review';
  if (value >= 0.85) return 'High';
  if (value >= 0.65) return 'Medium';
  return 'Review';
}

function ReceiptPanel({ houseId, products, receipts, onChange }: { houseId: number; products: Product[]; receipts: Receipt[]; onChange: () => void | Promise<void> }) {
  const [storeName, setStoreName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [price, setPrice] = useState('');
  const [lines, setLines] = useState<{ product_id: number; product_name: string; price: number; store_name?: string }[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<ReceiptUploadResult | null>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [receiptDate, setReceiptDate] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [tax, setTax] = useState('');
  const [discount, setDiscount] = useState('');
  const [total, setTotal] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [saveScanBusy, setSaveScanBusy] = useState(false);
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

  function hydrateScan(result: ReceiptUploadResult) {
    const receipt = result.receipt;
    setStoreName(receipt.store_name || '');
    setReceiptDate(receipt.receipt_date || '');
    setReceiptNumber(receipt.receipt_number || '');
    setPaymentMethod(receipt.payment_method || '');
    setSubtotal(receipt.subtotal_amount !== null && receipt.subtotal_amount !== undefined ? String(receipt.subtotal_amount) : '');
    setTax(receipt.tax_amount !== null && receipt.tax_amount !== undefined ? String(receipt.tax_amount) : '');
    setDiscount(receipt.discount_amount !== null && receipt.discount_amount !== undefined ? String(receipt.discount_amount) : '');
    setTotal(receipt.total_amount !== null && receipt.total_amount !== undefined ? String(receipt.total_amount) : '');
    setReviewLines((receipt.line_items || []).map(lineFromReceiptItem));
  }

  async function uploadReceipt() {
    if (!receiptFile) {
      setError('Choose a receipt photo, image, or PDF first.');
      return;
    }
    const formData = new FormData();
    formData.append('file', receiptFile);
    if (storeName.trim()) formData.append('store_name', storeName.trim());
    if (notes.trim()) formData.append('notes', notes.trim());
    try {
      setUploadBusy(true);
      setUploadResult(null);
      setReviewLines([]);
      const { data } = await api.post<ReceiptUploadResult>(`/houses/${houseId}/receipts/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(data);
      hydrateScan(data);
      setReceiptFile(null);
      setError('');
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadBusy(false);
    }
  }

  function updateReviewLine(index: number, patch: Partial<ReviewLine>) {
    setReviewLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function removeReviewLine(index: number) {
    setReviewLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index));
  }

  function addReviewLine() {
    setReviewLines((prev) => [
      ...prev,
      {
        description: '',
        product_id: '',
        quantity: '1',
        unit_price: '',
        line_total: '',
        discount_amount: '',
        tax_amount: '',
        line_type: 'product',
        is_selected: true,
        needs_review: true,
      },
    ]);
  }

  async function saveReviewedReceipt() {
    if (!uploadResult?.receipt?.id) {
      setError('Scan a receipt first.');
      return;
    }
    const selectedLines = reviewLines.filter((line) => line.is_selected && line.line_type === 'product');
    if (!selectedLines.length) {
      setError('Select at least one product row before saving.');
      return;
    }
    try {
      setSaveScanBusy(true);
      const { data } = await api.post<Receipt>(`/houses/${houseId}/receipts/${uploadResult.receipt.id}/confirm`, {
        store_name: storeName || null,
        receipt_date: receiptDate || null,
        receipt_number: receiptNumber || null,
        payment_method: paymentMethod || null,
        subtotal_amount: numberOrNull(subtotal),
        tax_amount: numberOrNull(tax),
        discount_amount: numberOrNull(discount),
        total_amount: numberOrNull(total),
        notes: notes || null,
        items: reviewLines.map((line) => ({
          id: line.id || null,
          description: line.description || 'Receipt item',
          product_id: line.product_id || null,
          quantity: numberOrNull(line.quantity),
          unit_price: numberOrNull(line.unit_price),
          line_total: numberOrNull(line.line_total),
          discount_amount: numberOrNull(line.discount_amount),
          tax_amount: numberOrNull(line.tax_amount),
          line_type: line.line_type || 'product',
          is_selected: line.is_selected,
        })),
      });
      setUploadResult((prev) => prev ? { ...prev, receipt: data, message: 'Receipt reviewed and saved to price history.', scan_status: data.ocr_status } : prev);
      setReviewLines((data.line_items || []).map(lineFromReceiptItem));
      setError('');
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaveScanBusy(false);
    }
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

  const scannedProductRows = reviewLines.filter((line) => line.line_type === 'product');
  const matchedRows = scannedProductRows.filter((line) => line.product_id).length;

  return (
    <section className="panel receipt-panel premium-receipt-panel receipt-studio">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Smart receipt studio</p>
          <h2>Scan, review & save receipt prices</h2>
        </div>
        <span className="badge premium-badge">Professional scan</span>
      </div>
      <p>
        Upload a receipt photo or PDF. Grocery House Manager extracts the store, item rows, prices, discounts, taxes, and total, then lets you review everything before it updates price history.
      </p>
      <div className="receipt-flow-cards">
        <span><strong>1</strong> Upload receipt</span>
        <span><strong>2</strong> Review extracted rows</span>
        <span><strong>3</strong> Save trusted prices</span>
      </div>
      {error && <div className="error">{error}</div>}
      {uploadResult && <div className="success compact-message">{uploadResult.message}</div>}

      <div className="receipt-upload-card">
        <div>
          <h3>Upload receipt</h3>
          <p className="small-muted">Best results: flat receipt, clear light, full receipt visible, no cropped totals.</p>
        </div>
        <label>Store name, optional<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Costco, Walmart, No Frills" /></label>
        <label>Attach receipt photo or PDF<input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} /></label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you want to remember about this receipt" /></label>
        <button className="primary full" type="button" onClick={uploadReceipt} disabled={uploadBusy || !receiptFile}>{uploadBusy ? 'Scanning receipt...' : 'Scan receipt automatically'}</button>
      </div>

      {uploadResult ? (
        <div className="receipt-review-studio">
          <div className="receipt-review-header">
            <div>
              <p className="eyebrow">Review before saving</p>
              <h3>{storeName || 'Receipt store'} {total ? `• ${money(Number(total))}` : ''}</h3>
              <p className="small-muted">{scannedProductRows.length} product row(s), {matchedRows} matched to your inventory. Edit wrong rows before saving.</p>
            </div>
            <button className="secondary" type="button" onClick={addReviewLine}>Add missing row</button>
          </div>

          <div className="receipt-meta-grid">
            <label>Store<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name" /></label>
            <label>Date<input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} /></label>
            <label>Receipt #<input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="Optional" /></label>
            <label>Payment<input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Visa, Debit, Cash" /></label>
            <label>Subtotal<input type="number" min="0" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></label>
            <label>Discount<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
            <label>Tax<input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
            <label>Total<input type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
          </div>

          <div className="receipt-line-table">
            <div className="receipt-line-row receipt-line-head">
              <span>Save</span>
              <span>Receipt item</span>
              <span>Match product</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Total</span>
              <span>Discount</span>
              <span>Status</span>
            </div>
            {reviewLines.map((line, index) => (
              <div className={`receipt-line-row ${line.needs_review ? 'needs-review' : ''}`} key={`${line.id || 'new'}-${index}`}>
                <label className="inline-check"><input type="checkbox" checked={line.is_selected} onChange={(e) => updateReviewLine(index, { is_selected: e.target.checked })} /></label>
                <input value={line.description} onChange={(e) => updateReviewLine(index, { description: e.target.value })} placeholder="Product name" />
                <select value={line.product_id} onChange={(e) => updateReviewLine(index, { product_id: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">No match</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={line.quantity} onChange={(e) => updateReviewLine(index, { quantity: e.target.value })} />
                <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateReviewLine(index, { unit_price: e.target.value })} />
                <input type="number" min="0" step="0.01" value={line.line_total} onChange={(e) => updateReviewLine(index, { line_total: e.target.value })} />
                <input type="number" min="0" step="0.01" value={line.discount_amount} onChange={(e) => updateReviewLine(index, { discount_amount: e.target.value })} />
                <div className="receipt-line-status">
                  <span className={line.needs_review || !line.product_id ? 'badge warn' : 'badge ok'}>{!line.product_id ? 'Match' : confidenceLabel(line.confidence)}</span>
                  <button className="ghost tiny" type="button" onClick={() => removeReviewLine(index)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          <button className="primary full" type="button" onClick={saveReviewedReceipt} disabled={saveScanBusy || !reviewLines.length}>{saveScanBusy ? 'Saving reviewed receipt...' : 'Save reviewed receipt to price history'}</button>
        </div>
      ) : null}

      <div className="receipt-manual-block">
        <h3>Manual price entry</h3>
        <p className="small-muted">Use this when you do not want to scan or when the receipt is too damaged.</p>
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
              <span key={`${line.product_id}-${index}`}>{line.product_name} • {line.store_name || storeName || 'Store'} • {money(line.price)}</span>
            ))}
          </div>
        )}
        <button className="secondary full" onClick={saveReceipt} disabled={!lines.length}>Save manual receipt prices</button>
      </div>
      {receipts.length > 0 && (
        <div className="receipt-history-preview">
          <strong>Latest receipt</strong>
          <span>{receipts[0].store_name || 'Store'} • {receipts[0].total_amount ? money(receipts[0].total_amount) : new Date(receipts[0].created_at).toLocaleDateString()} • {receipts[0].ocr_status?.split('_').join(' ')}</span>
        </div>
      )}
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
