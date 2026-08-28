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

          <CategoryGroup title="Products to buy" items={toBuy} onUpdate={updateItem} onStatusChange={updateItemStatus} onRemove={removeItem} />
          <CategoryGroup title="Added in cart" items={inCart} onUpdate={updateItem} onStatusChange={updateItemStatus} onRemove={removeItem} />
          <button className="primary full done" disabled={!inCart.length || busy} onClick={shoppingDone}>Shopping done</button>
          <p className="small-muted">Only items under “Added in cart” update real inventory.</p>
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const key = item.product.section_name || 'Other';
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="shopping-tag category-shopping-tag">
      <h4>{title}</h4>
      {!items.length && <p className="small-muted">No items here.</p>}
      {groups.map(([category, categoryItems]) => (
        <section key={category} className="shopping-category-section">
          <button className="category-toggle" type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))}>
            <span>{collapsed[category] ? '▶' : '▼'} {category}</span>
            <small>{categoryItems.length} item{categoryItems.length === 1 ? '' : 's'}</small>
          </button>
          {!collapsed[category] && categoryItems.map((item) => <ShoppingRow key={item.id} item={item} onUpdate={onUpdate} onStatusChange={onStatusChange} onRemove={onRemove} />)}
        </section>
      ))}
    </div>
  );
}

function ShoppingRow({ item, onUpdate, onStatusChange, onRemove }: { item: ShoppingListItem; onUpdate: (item: ShoppingListItem, updates: ItemUpdates) => void; onStatusChange: (item: ShoppingListItem, status: ShoppingItemStatus) => void; onRemove: (item: ShoppingListItem) => void }) {
  const suggestion = suggestedPrice(item.product);
  return (
    <article className="cart-item polished-cart-item">
      <label className="cart-line">
        <input
          type="checkbox"
          checked={item.status === 'in_cart'}
          onChange={(e) => onStatusChange(item, e.target.checked ? 'in_cart' : 'to_buy')}
        />
        <strong>{item.product.icon || '🛒'} {item.product.name}</strong>
      </label>
      <div className="shopping-suggestion-badges cart-suggestion-badges">
        {stockBadge(item.product)}
        <SuggestedPriceBadge suggestion={suggestion} unit={item.product.unit || 'unit'} />
      </div>
      <div className="cart-grid">
        <label>Need<input type="number" min="0.01" step="0.01" value={item.requested_quantity} onChange={(e) => onUpdate(item, { requested_quantity: Number(e.target.value) })} /></label>
        <label>Bought<input type="number" min="0.01" step="0.01" value={item.bought_quantity} onChange={(e) => onUpdate(item, { bought_quantity: Number(e.target.value) })} /></label>
        <label>Store<input value={item.bought_store_name || ''} onChange={(e) => onUpdate(item, { bought_store_name: e.target.value || null })} /></label>
        <label>Price<input type="number" min="0" step="0.01" value={item.bought_price ?? ''} onChange={(e) => onUpdate(item, { bought_price: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>
      <textarea value={item.message || ''} placeholder="Message for this item" onChange={(e) => onUpdate(item, { message: e.target.value })} />
      <div className="cart-footer">
        <small>Trip store: {item.bought_store_name || item.product.store_name || 'No store'} • Current inventory: {item.product.quantity} {item.product.unit}</small>
        <button className="secondary small-button" onClick={() => onRemove(item)}>Remove</button>
      </div>
    </article>
  );
}
