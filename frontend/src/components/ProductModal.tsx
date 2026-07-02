import { useState } from 'react';
import { api, errorMessage } from '../api';
import type { Product, Section } from '../types';

type Props = {
  houseId: number;
  sections: Section[];
  modal: { mode: 'create' | 'edit'; product?: Product; sectionId?: number };
  onClose: () => void;
  onSaved: () => void;
};

export default function ProductModal({ houseId, sections, modal, onClose, onSaved }: Props) {
  const product = modal.product;
  const [form, setForm] = useState({
    section_id: product?.section_id || modal.sectionId || sections[0]?.id,
    name: product?.name || '',
    image_url: product?.image_url || '',
    icon: product?.icon || '',
    quantity: product?.quantity ?? 0,
    unit: product?.unit || 'pcs',
    price: product?.price ?? '',
    store_name: product?.store_name || '',
    brand: product?.brand || '',
    barcode: product?.barcode || '',
    expiry_date: product?.expiry_date || '',
    low_stock_threshold: product?.low_stock_threshold ?? '',
    notes: product?.notes || '',
  });
  const [error, setError] = useState('');

  function setField(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function optionalNumber(value: string | number) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const sectionId = Number(form.section_id);
    if (!sectionId) {
      setError('Please create or choose a section first.');
      return;
    }

    const productFields = {
      name: form.name.trim(),
      image_url: form.image_url.trim() || null,
      icon: form.icon.trim() || null,
      quantity: optionalNumber(form.quantity) ?? 0,
      unit: form.unit.trim() || 'pcs',
      price: optionalNumber(form.price),
      store_name: form.store_name.trim() || null,
      brand: form.brand.trim() || null,
      barcode: form.barcode.trim() || null,
      expiry_date: form.expiry_date || null,
      low_stock_threshold: optionalNumber(form.low_stock_threshold),
      notes: form.notes.trim() || null,
    };

    try {
      if (modal.mode === 'create') {
        await api.post(`/houses/${houseId}/sections/${sectionId}/products`, productFields);
      } else {
        await api.post(`/houses/${houseId}/products/${product!.id}/edit`, { section_id: sectionId, ...productFields });
      }
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">
          <h2>{modal.mode === 'create' ? 'Add product' : 'Edit product'}</h2>
          <button onClick={onClose}>×</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit} className="product-form">
          <label>Section<select value={form.section_id} onChange={(e) => setField('section_id', Number(e.target.value))}>{sections.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></label>
          <label>Name<input value={form.name} onChange={(e) => setField('name', e.target.value)} required /></label>
          <label>Icon<input placeholder="🥛" value={form.icon} onChange={(e) => setField('icon', e.target.value)} /></label>
          <label>Image URL<input value={form.image_url} onChange={(e) => setField('image_url', e.target.value)} /></label>
          <div className="form-row">
            <label>Quantity<input type="number" step="0.01" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} /></label>
            <label>Unit<input placeholder="bags, kg, pcs" value={form.unit} onChange={(e) => setField('unit', e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>Price<input type="number" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} /></label>
            <label>Store<input value={form.store_name} onChange={(e) => setField('store_name', e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>Brand<input value={form.brand} onChange={(e) => setField('brand', e.target.value)} /></label>
            <label>Barcode<input value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>Expiry date<input type="date" value={form.expiry_date} onChange={(e) => setField('expiry_date', e.target.value)} /></label>
            <label>Low stock alert<input type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => setField('low_stock_threshold', e.target.value)} /></label>
          </div>
          <label>Notes<textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} /></label>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary">Cancel</button>
            <button className="primary">Save product</button>
          </div>
        </form>
      </div>
    </div>
  );
}
