import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { Product, Section, ShoppingItemStatus, ShoppingList, ShoppingListItem } from '../types';
import { normalizeText, smartProductIcon, smartProductUnit, smartSectionId } from '../smartCategory';

type Selection = Record<number, { selected: boolean; requested_quantity: number; message: string; bought_price?: number | null; bought_store_name?: string }>;
type ItemUpdates = {
  requested_quantity?: number;
  bought_quantity?: number;
  message?: string | null;
  status?: ShoppingItemStatus;
  bought_price?: number | null;
  bought_store_name?: string | null;
};

type ShoppingListPanelProps = {
  houseId: number;
  products: Product[];
  sections: Section[];
  activeList: ShoppingList | null;
  onChange: () => void | Promise<void>;
  onListCreated?: (list: ShoppingList) => void;
  onListUpdated?: (list: ShoppingList) => void;
  onProductSearch?: (query: string) => void | Promise<void>;
};

function formatShortDate(timestamp: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function suggestedPrice(product: Product) {
  const prices = product.store_prices || [];
  if (!prices.length) return null;
  const now = Date.now();
  const maxAgeMs = 21 * 24 * 60 * 60 * 1000;
  const withTime = prices.map((entry) => ({ ...entry, time: new Date(entry.recorded_at).getTime() || 0 }));
  const recentReceipt = withTime
    .filter((entry) => entry.source?.startsWith('receipt') && entry.time && now - entry.time <= maxAgeMs)
    .sort((a, b) => a.price - b.price || b.time - a.time)[0];
  const live = withTime
    .filter((entry) => entry.source?.includes('live') || entry.source?.includes('apify'))
    .sort((a, b) => a.price - b.price || b.time - a.time)[0];
  const bestSaved = [...withTime].sort((a, b) => a.price - b.price || b.time - a.time)[0];
  const chosen = recentReceipt || live || bestSaved;
  if (!chosen) return null;
  let label = 'Saved price';
  let icon = '🏷️';
  if (chosen.source?.startsWith('receipt') && chosen.time && now - chosen.time <= maxAgeMs) {
    label = 'Receipt price';
    icon = '🧾';
  }
  if (chosen.source?.includes('live') || chosen.source?.includes('apify')) {
    label = 'Live compare';
    icon = '⚡';
  }
  const days = chosen.time ? Math.max(Math.floor((now - chosen.time) / (24 * 60 * 60 * 1000)), 0) : null;
  const dateLabel = chosen.time ? formatShortDate(chosen.time) : '';
  return { store: chosen.store_name, price: chosen.price, label, icon, days, dateLabel };
}

function SuggestedPriceBadge({ suggestion, unit, prefix = 'Suggested' }: { suggestion: ReturnType<typeof suggestedPrice>; unit: string; prefix?: string }) {
  if (!suggestion) return <span className="store-suggestion-badge muted">No recent price yet</span>;
  const dateText = suggestion.label === 'Receipt price' && suggestion.dateLabel ? ` • ${suggestion.dateLabel}` : '';
  const daysText = suggestion.label === 'Receipt price' && suggestion.days !== null ? ` • ${suggestion.days}d old` : '';
  return (
    <span className={`store-suggestion-badge graphical-source-badge ${suggestion.label === 'Live compare' ? 'live' : suggestion.label === 'Receipt price' ? 'receipt' : 'saved'}`}>
      <strong>{suggestion.icon} {prefix}: {suggestion.store}</strong>
      <span>{money(suggestion.price)} / {unit || 'unit'}</span>
      <em>{suggestion.label}{dateText}{daysText}</em>
    </span>
  );
}

function stockBadge(product: Product) {
  if (product.is_out_of_stock || product.quantity <= 0) return <span className="mini-status out">Out of stock</span>;
  if (product.is_expired) return <span className="mini-status expired">Expired</span>;
  if (product.is_low_stock) return <span className="mini-status low">Low stock</span>;
  return null;
}

export default function ShoppingListPanel({ houseId, products, sections, activeList, onChange, onListCreated, onListUpdated, onProductSearch }: ShoppingListPanelProps) {
  const [selection, setSelection] = useState<Selection>({});
  const [title, setTitle] = useState('Grocery List');
  const [editedTitle, setEditedTitle] = useState(activeList?.title || 'Grocery List');
  const [showAddMore, setShowAddMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completedListTitle, setCompletedListTitle] = useState('');
  const [listView, setListView] = useState<'to_buy' | 'in_cart'>('to_buy');

  const selectedItems = useMemo(() => Object.entries(selection).filter(([, value]) => value.selected), [selection]);
  const existingProductIds = useMemo(() => new Set(activeList?.items.map((item) => item.product_id) || []), [activeList]);
  const productsNotInList = activeList ? products.filter((product) => !existingProductIds.has(product.id)) : products;

  useEffect(() => {
    if (activeList?.title) setEditedTitle(activeList.title);
  }, [activeList?.id, activeList?.title]);

  function selectProduct(product: Product, selected = true) {
    setSelection((prev) => ({
      ...prev,
      [product.id]: {
        selected,
        requested_quantity: prev[product.id]?.requested_quantity || 1,
        message: prev[product.id]?.message || '',
        bought_price: prev[product.id]?.bought_price ?? product.price ?? null,
        bought_store_name: prev[product.id]?.bought_store_name || product.store_name || '',
      },
    }));
  }

  function toggleProduct(product: Product) {
    setSelection((prev) => ({
      ...prev,
      [product.id]: prev[product.id]
        ? { ...prev[product.id], selected: !prev[product.id].selected }
        : { selected: true, requested_quantity: 1, message: '', bought_price: product.price ?? null, bought_store_name: product.store_name || '' },
    }));
  }

  function updateSelection(productId: number, key: 'requested_quantity' | 'message' | 'bought_price' | 'bought_store_name', value: string) {
    setSelection((prev) => ({
      ...prev,
      [productId]: {
        selected: true,
        requested_quantity: prev[productId]?.requested_quantity || 1,
        message: prev[productId]?.message || '',
        bought_price: prev[productId]?.bought_price ?? null,
        bought_store_name: prev[productId]?.bought_store_name || '',
        [key]: key === 'requested_quantity' ? (value === '' ? 1 : Number(value)) : key === 'bought_price' ? (value === '' ? null : Number(value)) : value,
      },
    }));
  }

  function selectionPayload() {
    return selectedItems.map(([productId, item]) => ({
      product_id: Number(productId),
      requested_quantity: item.requested_quantity || 1,
      bought_quantity: item.requested_quantity || 1,
      bought_price: item.bought_price ?? null,
      bought_store_name: item.bought_store_name || null,
      message: item.message || null,
    }));
  }

  async function createList() {
    try {
      setBusy(true);
      const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists`, { title, items: selectionPayload() });
      setSelection({});
      setTitle('Grocery List');
      setError('');
      window.dispatchEvent(new Event('account:refresh'));
      onListCreated?.(data);
      onListUpdated?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addMoreProducts() {
    if (!activeList) return;
    try {
      setBusy(true);
      const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${activeList.id}/items`, { items: selectionPayload() });
      setSelection({});
      setShowAddMore(false);
      setError('');
      onListUpdated?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!activeList) return;
    try {
      setBusy(true);
      const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${activeList.id}/edit`, { title: editedTitle });
      setError('');
      onListUpdated?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateItem(item: ShoppingListItem, updates: ItemUpdates) {
    if (!activeList) return;
    try {
      setBusy(true);
      const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${activeList.id}/items/${item.id}/edit`, updates);
      setError('');
      onListUpdated?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateItemStatus(item: ShoppingListItem, status: ShoppingItemStatus) {
    if (!activeList) return;
    try {
      setBusy(true);
      const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${activeList.id}/items/${item.id}/status`, { status });
      setError('');
      onListUpdated?.(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ShoppingListItem) {
    if (!activeList) return;
    if (!confirm(`Remove ${item.product.name} from this grocery list?`)) return;
    try {
      setBusy(true);
      await api.delete(`/houses/${houseId}/shopping-lists/${activeList.id}/items/${item.id}`);
      setError('');
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelList() {
    if (!activeList) return;
    if (!confirm('Cancel this grocery list? This will not update inventory.')) return;
    try {
      setBusy(true);
      await api.delete(`/houses/${houseId}/shopping-lists/${activeList.id}`);
      setSelection({});
      setShowAddMore(false);
      setError('');
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function shoppingDone() {
    if (!activeList) return;
    if (!confirm('Shopping done? This will add all cart quantities to the real inventory.')) return;
    try {
      setBusy(true);
      const finishedTitle = activeList.title;
      await api.post(`/houses/${houseId}/shopping-lists/${activeList.id}/done`, { confirm: true });
      setError('');
      setCompletedListTitle(finishedTitle);
      window.dispatchEvent(new CustomEvent('ghm:success-moment', { detail: { type: 'shopping', message: 'Your shopping trip is complete and the inventory is updated.' } }));
      window.dispatchEvent(new Event('account:refresh'));
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const toBuy = activeList?.items.filter((item) => item.status === 'to_buy') || [];
  const inCart = activeList?.items.filter((item) => item.status === 'in_cart') || [];

  return (
    <section className="panel shopping-panel polished-shopping-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Shopping flow</p>
          <h2>Grocery list</h2>
          <p>Add what you need, move items into the cart as you shop, then tap Shopping done. Your inventory updates automatically.</p>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {busy && <div className="hint">Saving change...</div>}
      {completedListTitle ? (
        <div className="shopping-complete-next" role="status">
          <span aria-hidden="true">✓</span>
          <div><p className="eyebrow">Shopping complete</p><strong>{completedListTitle} updated your inventory</strong><small>If you have the receipt, scan it now and Grocery House Manager can save the real prices and spending history automatically.</small></div>
          <Link to={`/houses/${houseId}/scan`} className="primary center-link">Scan receipt</Link>
          <button type="button" className="ghost-button" onClick={() => setCompletedListTitle('')}>Not now</button>
        </div>
      ) : null}

      {!activeList && (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="List title" />
          <ProductPicker houseId={houseId} sections={sections} products={products} selection={selection} onToggle={toggleProduct} onUpdate={updateSelection} onSearch={onProductSearch} onCreated={selectProduct} />
          <button className="primary full" disabled={!selectedItems.length || busy} onClick={createList}>Create grocery list</button>
        </>
      )}

      {activeList && (
        <div className="shopping-list">
          <div className="list-title-editor">
            <input value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} placeholder="List title" />
            <button className="secondary" onClick={saveTitle} disabled={busy || editedTitle === activeList.title}>Save</button>
          </div>

          <div className="list-actions">
            <button className="secondary" onClick={() => setShowAddMore((value) => !value)}>{showAddMore ? 'Hide add products' : 'Add more products'}</button>
            <button className="secondary danger-button" onClick={cancelList}>Cancel list</button>
          </div>

          {showAddMore && (
            <div className="add-more-box">
              <h4>Add more products</h4>
              {productsNotInList.length ? (
                <>
                  <ProductPicker houseId={houseId} sections={sections} products={productsNotInList} selection={selection} onToggle={toggleProduct} onUpdate={updateSelection} onSearch={onProductSearch} onCreated={selectProduct} />
                  <button className="primary full" disabled={!selectedItems.length || busy} onClick={addMoreProducts}>Add selected products</button>
                </>
              ) : (
                <>
                  <p className="small-muted">Every visible inventory product is already on this list. Search or create a new product below.</p>
                  <ProductPicker houseId={houseId} sections={sections} products={[]} selection={selection} onToggle={toggleProduct} onUpdate={updateSelection} onSearch={onProductSearch} onCreated={selectProduct} />
                  <button className="primary full" disabled={!selectedItems.length || busy} onClick={addMoreProducts}>Add selected products</button>
                </>
              )}
            </div>
          )}

          <section className="shopping-glance-v106">
            <div><small>TO BUY</small><strong>{toBuy.length}</strong><span>remaining</span></div>
            <div><small>IN CART</small><strong>{inCart.length}</strong><span>ready to finish</span></div>
            <div><small>TOTAL</small><strong>{activeList.items.length}</strong><span>on this trip</span></div>
          </section>
          <div className="shopping-stage-tabs-v106" role="tablist" aria-label="Shopping list stage">
            <button type="button" role="tab" aria-selected={listView === 'to_buy'} className={listView === 'to_buy' ? 'active' : ''} onClick={() => setListView('to_buy')}><span>🛒</span><strong>To buy</strong><small>{toBuy.length}</small></button>
            <button type="button" role="tab" aria-selected={listView === 'in_cart'} className={listView === 'in_cart' ? 'active' : ''} onClick={() => setListView('in_cart')}><span>✓</span><strong>In cart</strong><small>{inCart.length}</small></button>
          </div>
          <CategoryGroup title={listView === 'to_buy' ? 'Still needed' : 'In your cart'} items={listView === 'to_buy' ? toBuy : inCart} onUpdate={updateItem} onStatusChange={updateItemStatus} onRemove={removeItem} />
          {listView === 'in_cart' ? <div className="shopping-finish-bar-v106"><div><strong>{inCart.length ? `${inCart.length} item${inCart.length === 1 ? '' : 's'} ready` : 'Your cart is empty'}</strong><small>Only cart items update inventory when you finish.</small></div><button className="primary done" disabled={!inCart.length || busy} onClick={shoppingDone}>Shopping done</button></div> : null}
        </div>
      )}
    </section>
  );
}

function ProductPicker({ houseId, sections, products, selection, onToggle, onUpdate, onSearch, onCreated }: { houseId: number; sections: Section[]; products: Product[]; selection: Selection; onToggle: (product: Product) => void; onUpdate: (productId: number, key: 'requested_quantity' | 'message' | 'bought_price' | 'bought_store_name', value: string) => void; onSearch?: (query: string) => void | Promise<void>; onCreated: (product: Product, selected?: boolean) => void }) {
  const [pickerSearch, setPickerSearch] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('pcs');
  const [newProductQuantity, setNewProductQuantity] = useState('0');
  const [newProductSectionId, setNewProductSectionId] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!onSearch) return;
    const timer = window.setTimeout(() => { onSearch(pickerSearch.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [pickerSearch, onSearch]);

  useEffect(() => {
    if (newProductName.trim()) setNewProductSectionId(smartSectionId(newProductName, sections));
  }, [newProductName, sections]);

  const visibleProducts = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    const filtered = query
      ? products.filter((product) => [product.name, product.store_name, product.section_name, product.brand, product.barcode].filter(Boolean).join(' ').toLowerCase().includes(query))
      : products;
    return filtered.slice(0, 80);
  }, [products, pickerSearch]);

  async function createInventoryProduct() {
    const name = newProductName.trim();
    if (!name) {
      setMessage('Enter product name first.');
      return;
    }
    try {
      setCreating(true);
      setMessage('');
      const { data: matches } = await api.get<Product[]>(`/houses/${houseId}/products`, { params: { search: name, limit: 10 } });
      const exact = matches.find((product) => normalizeText(product.name) === normalizeText(name));
      if (exact) {
        onCreated(exact, true);
        setMessage(`${exact.name} already exists. It was selected instead of creating a duplicate.`);
        return;
      }
      const sectionId = newProductSectionId || smartSectionId(name, sections) || sections[0]?.id;
      if (!sectionId) {
        setMessage('Create a section first, then add this product.');
        return;
      }
      const { data } = await api.post<Product>(`/houses/${houseId}/sections/${sectionId}/products`, {
        name,
        quantity: Number(newProductQuantity) || 0,
        unit: newProductUnit || smartProductUnit(name),
        icon: sections.find((section) => section.id === sectionId)?.icon || smartProductIcon(name),
      });
      onCreated(data, true);
      await onSearch?.(name);
      setNewProductName('');
      setNewProductQuantity('0');
      setNewProductUnit('pcs');
      setMessage(`${data.name} was created, added to inventory, and selected for this list.`);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="product-picker-wrap">
      <div className="product-picker-toolbar">
        <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search entire inventory..." />
        <small>{visibleProducts.length} shown{products.length > visibleProducts.length ? ` of ${products.length}` : ''}</small>
      </div>
      <p className="small-muted">Search by product, brand, store, or barcode. You can also create a product here if it is not in inventory yet.</p>
      <div className="product-picker">
        {visibleProducts.map((product) => {
          const selected = selection[product.id]?.selected;
          const suggestion = suggestedPrice(product);
          return (
            <div key={product.id} className={`pick-row ${selected ? 'selected' : ''}`}>
              <label>
                <input type="checkbox" checked={!!selected} onChange={() => onToggle(product)} />
                <span>
                  {product.icon || '🛒'} {product.name}
                  <small className="picker-product-meta">{product.section_name || 'Inventory'} • Inventory: {product.quantity} {product.unit}{product.price !== undefined && product.price !== null ? ` • ${money(product.price)} / ${product.unit || 'unit'}` : ''}</small>
                </span>
              </label>
              <div className="shopping-suggestion-badges">
                {stockBadge(product)}
                {suggestion && <SuggestedPriceBadge suggestion={suggestion} unit={product.unit || 'unit'} />}
              </div>
              {selected && (
                <div className="pick-extra">
                  <input type="number" min="0.01" step="0.01" value={selection[product.id]?.requested_quantity || 1} onChange={(e) => onUpdate(product.id, 'requested_quantity', e.target.value)} />
                  <input placeholder="Store for this trip" value={selection[product.id]?.bought_store_name || ''} onChange={(e) => onUpdate(product.id, 'bought_store_name', e.target.value)} />
                  <input type="number" min="0" step="0.01" placeholder="Expected price" value={selection[product.id]?.bought_price ?? ''} onChange={(e) => onUpdate(product.id, 'bought_price', e.target.value)} />
                  <input placeholder="Message e.g. buy 2% milk" value={selection[product.id]?.message || ''} onChange={(e) => onUpdate(product.id, 'message', e.target.value)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="quick-create-product-card">
        <div>
          <strong>Product not in inventory?</strong>
          <small>Create it here and add it to this grocery list right away. We check existing inventory first to prevent duplicates.</small>
        </div>
        <div className="quick-create-grid">
          <input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="New product name" />
          <select value={newProductSectionId} onChange={(e) => setNewProductSectionId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Auto category</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.icon ? `${section.icon} ` : ''}{section.name}</option>)}
          </select>
          <input value={newProductUnit} onChange={(e) => setNewProductUnit(e.target.value)} placeholder="Unit e.g. pcs/kg" />
          <input type="number" min="0" step="0.001" value={newProductQuantity} onChange={(e) => setNewProductQuantity(e.target.value)} placeholder="Inventory qty" />
          <button className="secondary" type="button" onClick={createInventoryProduct} disabled={creating}>{creating ? 'Creating...' : 'Create + select'}</button>
        </div>
        {message && <div className={message.includes('created') || message.includes('selected') ? 'success compact-message' : 'hint compact-message'}>{message}</div>}
      </div>
    </div>
  );
}

function CategoryGroup({ title, items, onUpdate, onStatusChange, onRemove }: { title: string; items: ShoppingListItem[]; onUpdate: (item: ShoppingListItem, updates: ItemUpdates) => void; onStatusChange: (item: ShoppingListItem, status: ShoppingItemStatus) => void; onRemove: (item: ShoppingListItem) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const key = item.product.section_name || 'Other';
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  useEffect(() => {
    if (!groups.length) { setOpenCategory(null); return; }
    if (!openCategory || !groups.some(([category]) => category === openCategory)) setOpenCategory(groups[0][0]);
  }, [groups, openCategory]);

  return (
    <div className="shopping-tag category-shopping-tag">
      <div className="shopping-category-summary-v106"><div><h4>{title}</h4><small>{items.length} item{items.length === 1 ? '' : 's'} · open one section at a time</small></div>{groups.length > 1 ? <span>{groups.length} sections</span> : null}</div>
      {!items.length && <p className="small-muted">No items here.</p>}
      {groups.map(([category, categoryItems]) => { const open = openCategory === category; return (
        <section key={category} className={`shopping-category-section ${open ? 'open' : ''}`}>
          <button className="category-toggle" type="button" aria-expanded={open} onClick={() => { if (!open) setOpenCategory(category); }}>
            <span>{open ? '▾' : '›'} {category}</span>
            <small>{categoryItems.length} item{categoryItems.length === 1 ? '' : 's'}</small>
          </button>
          {open && categoryItems.map((item) => <ShoppingRow key={item.id} item={item} onUpdate={onUpdate} onStatusChange={onStatusChange} onRemove={onRemove} />)}
        </section>
      ); })}
    </div>
  );
}

function ShoppingRow({ item, onUpdate, onStatusChange, onRemove }: { item: ShoppingListItem; onUpdate: (item: ShoppingListItem, updates: ItemUpdates) => void; onStatusChange: (item: ShoppingListItem, status: ShoppingItemStatus) => void; onRemove: (item: ShoppingListItem) => void }) {
  const suggestion = suggestedPrice(item.product);
  const [expanded, setExpanded] = useState(false);
  const requested = Number(item.requested_quantity || 1);
  function adjust(delta: number) {
    onUpdate(item, { requested_quantity: Math.max(0.01, Math.round((requested + delta) * 100) / 100) });
  }
  return (
    <article className={`shopping-compact-row-v106 ${expanded ? 'expanded' : ''} ${item.status === 'in_cart' ? 'in-cart' : ''}`}>
      <div className="shopping-compact-main-v106">
        <label className="shopping-check-v106" title={item.status === 'in_cart' ? 'Move back to To buy' : 'Add to cart'}>
          <input type="checkbox" checked={item.status === 'in_cart'} onChange={(e) => onStatusChange(item, e.target.checked ? 'in_cart' : 'to_buy')} />
          <span aria-hidden="true">✓</span>
        </label>
        <span className="shopping-product-icon-v106" aria-hidden="true">{item.product.icon || '🛒'}</span>
        <div className="shopping-compact-copy-v106">
          <strong>{item.product.name}</strong>
          <small>{item.message || item.bought_store_name || item.product.store_name || item.product.section_name || 'Shopping item'}</small>
          <div className="shopping-compact-meta-v106">
            {stockBadge(item.product)}
            {suggestion ? <span className="shopping-price-chip-v106">{suggestion.icon} {money(suggestion.price)} · {suggestion.store}</span> : null}
          </div>
        </div>
        <div className="shopping-qty-v106" aria-label={`Requested quantity ${requested}`}>
          <button type="button" onClick={() => adjust(-1)} aria-label="Decrease quantity">−</button><strong>{requested}</strong><small>{item.product.unit || 'pcs'}</small><button type="button" onClick={() => adjust(1)} aria-label="Increase quantity">+</button>
        </div>
        <button type="button" className="shopping-details-toggle-v106" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Done' : 'Details'}</button>
      </div>
      {expanded ? <div className="shopping-row-details-v106">
        <div className="shopping-row-detail-head-v106"><div><small>CURRENT INVENTORY</small><strong>{item.product.quantity} {item.product.unit}</strong></div><SuggestedPriceBadge suggestion={suggestion} unit={item.product.unit || 'unit'} /></div>
        <div className="cart-grid shopping-detail-grid-v106">
          <label>Need<input type="number" min="0.01" step="0.01" value={item.requested_quantity} onChange={(e) => onUpdate(item, { requested_quantity: Number(e.target.value) })} /></label>
          <label>Bought<input type="number" min="0.01" step="0.01" value={item.bought_quantity} onChange={(e) => onUpdate(item, { bought_quantity: Number(e.target.value) })} /></label>
          <label>Store<input value={item.bought_store_name || ''} onChange={(e) => onUpdate(item, { bought_store_name: e.target.value || null })} /></label>
          <label>Price<input type="number" min="0" step="0.01" value={item.bought_price ?? ''} onChange={(e) => onUpdate(item, { bought_price: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        </div>
        <label className="shopping-note-v106">Item note<textarea value={item.message || ''} placeholder="2% milk, specific brand, size…" onChange={(e) => onUpdate(item, { message: e.target.value })} /></label>
        <div className="shopping-row-detail-footer-v106"><small>Trip store: {item.bought_store_name || item.product.store_name || 'Not set'}</small><button className="secondary small-button" onClick={() => onRemove(item)}>Remove item</button></div>
      </div> : null}
    </article>
  );
}
