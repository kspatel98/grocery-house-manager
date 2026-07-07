import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { Product, ShoppingItemStatus, ShoppingList, ShoppingListItem } from '../types';

type Selection = Record<number, { selected: boolean; requested_quantity: number; message: string; bought_price?: number | null; bought_store_name?: string }>;
type ItemUpdates = {
  requested_quantity?: number;
  bought_quantity?: number;
  message?: string | null;
  status?: ShoppingItemStatus;
  bought_price?: number | null;
  bought_store_name?: string | null;
};

export default function ShoppingListPanel({ houseId, products, activeList, onChange, onListCreated, onListUpdated }: { houseId: number; products: Product[]; activeList: ShoppingList | null; onChange: () => void | Promise<void>; onListCreated?: (list: ShoppingList) => void; onListUpdated?: (list: ShoppingList) => void }) {
  const [selection, setSelection] = useState<Selection>({});
  const [title, setTitle] = useState('Grocery List');
  const [editedTitle, setEditedTitle] = useState(activeList?.title || 'Grocery List');
  const [showAddMore, setShowAddMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedItems = useMemo(() => Object.entries(selection).filter(([, value]) => value.selected), [selection]);
  const existingProductIds = useMemo(() => new Set(activeList?.items.map((item) => item.product_id) || []), [activeList]);
  const productsNotInList = activeList ? products.filter((product) => !existingProductIds.has(product.id)) : products;

  useEffect(() => {
    if (activeList?.title) {
      setEditedTitle(activeList.title);
    }
  }, [activeList?.id, activeList?.title]);

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
        [key]: key === 'requested_quantity' || key === 'bought_price' ? (value === '' ? null : Number(value)) : value,
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
      await api.post(`/houses/${houseId}/shopping-lists/${activeList.id}/done`, { confirm: true });
      setError('');
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
    <section className="panel shopping-panel">
      <h2>Grocery list</h2>
      <p>Select multiple products, set shopping-only quantity, add notes, then shop.</p>
      {error && <div className="error">{error}</div>}
      {busy && <div className="hint">Saving change...</div>}

      {!activeList && (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="List title" />
          <ProductPicker products={products} selection={selection} onToggle={toggleProduct} onUpdate={updateSelection} />
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
                  <ProductPicker products={productsNotInList} selection={selection} onToggle={toggleProduct} onUpdate={updateSelection} />
                  <button className="primary full" disabled={!selectedItems.length || busy} onClick={addMoreProducts}>Add selected products</button>
                </>
              ) : (
                <p className="small-muted">Every visible inventory product is already on this list. Edit the quantity below to buy more of an existing item.</p>
              )}
            </div>
          )}

          <Tag title="Products to buy" items={toBuy} onUpdate={updateItem} onStatusChange={updateItemStatus} onRemove={removeItem} />
          <Tag title="Added in cart" items={inCart} onUpdate={updateItem} onStatusChange={updateItemStatus} onRemove={removeItem} />
          <button className="primary full done" disabled={!inCart.length || busy} onClick={shoppingDone}>Shopping done</button>
          <p className="small-muted">Only items under “Added in cart” update real inventory.</p>
        </div>
      )}
    </section>
  );
}

function ProductPicker({ products, selection, onToggle, onUpdate }: { products: Product[]; selection: Selection; onToggle: (product: Product) => void; onUpdate: (productId: number, key: 'requested_quantity' | 'message' | 'bought_price' | 'bought_store_name', value: string) => void }) {
  const [pickerSearch, setPickerSearch] = useState('');
  const visibleProducts = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    const filtered = query
      ? products.filter((product) => [product.name, product.store_name, product.section_name, product.brand].filter(Boolean).join(' ').toLowerCase().includes(query))
      : products;
    return filtered.slice(0, 80);
  }, [products, pickerSearch]);

  return (
    <div className="product-picker-wrap">
      <div className="product-picker-toolbar">
        <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search inventory products..." />
        <small>{visibleProducts.length} shown{products.length > visibleProducts.length ? ` of ${products.length}` : ''}</small>
      </div>
      {products.length > visibleProducts.length && <p className="small-muted">Showing the first 80 matches to keep this page fast. Search to narrow the list.</p>}
      <div className="product-picker">
        {visibleProducts.map((product) => {
          const selected = selection[product.id]?.selected;
          return (
            <div key={product.id} className={`pick-row ${selected ? 'selected' : ''}`}>
              <label>
                <input type="checkbox" checked={!!selected} onChange={() => onToggle(product)} />
                <span>
                  {product.icon || '🛒'} {product.name}
                  <small className="picker-product-meta">{product.store_name || 'No store'} • Inventory: {product.quantity} {product.unit}{product.price !== undefined && product.price !== null ? ` • ${money(product.price)}` : ''}</small>
                </span>
              </label>
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
    </div>
  );
}

function Tag({ title, items, onUpdate, onStatusChange, onRemove }: { title: string; items: ShoppingListItem[]; onUpdate: (item: ShoppingListItem, updates: ItemUpdates) => void; onStatusChange: (item: ShoppingListItem, status: ShoppingItemStatus) => void; onRemove: (item: ShoppingListItem) => void }) {
  return (
    <div className="shopping-tag">
      <h4>{title}</h4>
      {!items.length && <p className="small-muted">No items here.</p>}
      {items.map((item) => (
        <article key={item.id} className="cart-item">
          <label className="cart-line">
            <input
              type="checkbox"
              checked={item.status === 'in_cart'}
              onChange={(e) => onStatusChange(item, e.target.checked ? 'in_cart' : 'to_buy')}
            />
            <strong>{item.product.icon || '🛒'} {item.product.name}</strong>
          </label>
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
      ))}
    </div>
  );
}
