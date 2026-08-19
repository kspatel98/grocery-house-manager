import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { Product, Receipt, ReceiptLineItem, ReceiptScanUsage, ReceiptUploadResult, Section } from '../types';

type ReviewLine = {
  id?: number;
  description: string;
  product_id: number | '';
  quantity: string;
  line_unit: string;
  unit_price: string;
  line_total: string;
  discount_amount: string;
  tax_amount: string;
  line_type: string;
  is_selected: boolean;
  update_inventory: boolean;
  create_product: boolean;
  new_product_name: string;
  new_product_section_id: number | '';
  new_product_unit: string;
  needs_review?: boolean;
  confidence?: number | null;
};

function displayUnitPrice(item: ReceiptLineItem) {
  if (item.unit_price !== null && item.unit_price !== undefined) return String(item.unit_price);
  if (item.line_total !== null && item.line_total !== undefined && item.quantity && item.quantity > 0) {
    const discount = item.discount_amount || 0;
    return String(Number(((item.line_total - discount) / item.quantity).toFixed(2)));
  }
  return '';
}

function lineFromReceiptItem(item: ReceiptLineItem): ReviewLine {
  const productLine = item.line_type !== 'discount' && item.line_type !== 'tax' && item.line_type !== 'summary';
  const hasMatch = Boolean(item.matched_product_id);
  const qty = item.quantity !== null && item.quantity !== undefined && item.quantity > 0 ? String(item.quantity) : '1';
  const unit = item.line_unit || 'pcs';
  return {
    id: item.id,
    description: item.description,
    product_id: item.matched_product_id || '',
    quantity: qty,
    line_unit: unit,
    unit_price: displayUnitPrice(item),
    line_total: item.line_total !== null && item.line_total !== undefined ? String(item.line_total) : '',
    discount_amount: item.discount_amount !== null && item.discount_amount !== undefined ? String(item.discount_amount) : '',
    tax_amount: item.tax_amount !== null && item.tax_amount !== undefined ? String(item.tax_amount) : '',
    line_type: item.line_type || 'product',
    is_selected: item.is_selected !== false && productLine,
    update_inventory: productLine,
    create_product: productLine && !hasMatch,
    new_product_name: item.normalized_name || item.description,
    new_product_section_id: '',
    new_product_unit: unit,
    needs_review: item.needs_review,
    confidence: item.confidence,
  };
}

function cleanUnit(value: string) {
  const unit = (value || 'pcs').trim().toLowerCase();
  if (unit === 'ea') return 'each';
  if (unit === 'pc') return 'pcs';
  if (unit === 'kgs') return 'kg';
  if (unit === 'lbs') return 'lb';
  return unit || 'pcs';
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

export default function ReceiptStudio({ houseId, products, sections, receipts, onChange }: { houseId: number; products: Product[]; sections: Section[]; receipts: Receipt[]; onChange: () => void | Promise<void> }) {
  const [storeName, setStoreName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [price, setPrice] = useState('');
  const [lines, setLines] = useState<{ product_id: number; product_name: string; price: number; store_name?: string }[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<ReceiptUploadResult | null>(null);
  const [scanUsage, setScanUsage] = useState<ReceiptScanUsage | null>(null);
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

  async function loadScanUsage() {
    try {
      const { data } = await api.get<ReceiptScanUsage>(`/houses/${houseId}/receipts/scan-usage`, { params: { t: Date.now() } });
      setScanUsage(data);
    } catch {
      setScanUsage(null);
    }
  }

  useEffect(() => {
    loadScanUsage();
  }, [houseId]);

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
      setError('Choose a JPG or PNG receipt image first.');
      return;
    }
    if (scanUsage && !scanUsage.allowed) {
      setError(scanUsage.message || 'Smart Receipt Scan is not available for this house right now. When free scans are finished, suggest using extra scans or buying a small one-time scan pack.');
      return;
    }
    if (scanUsage?.is_last_available) {
      const confirmed = window.confirm(`This will use the last Smart Receipt Scan for ${scanUsage.plan_name} in ${scanUsage.month_label}. After this upload, 0 of ${scanUsage.limit} scans will remain this month. Continue?`);
      if (!confirmed) return;
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
      if (data.usage) setScanUsage(data.usage);
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
        line_unit: 'pcs',
        unit_price: '',
        line_total: '',
        discount_amount: '',
        tax_amount: '',
        line_type: 'product',
        is_selected: true,
        update_inventory: true,
        create_product: true,
        new_product_name: '',
        new_product_section_id: sections[0]?.id || '',
        new_product_unit: 'pcs',
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
          quantity: numberOrNull(line.quantity) || 1,
          line_unit: cleanUnit(line.line_unit || line.new_product_unit),
          unit_price: numberOrNull(line.unit_price),
          line_total: numberOrNull(line.line_total),
          discount_amount: numberOrNull(line.discount_amount),
          tax_amount: numberOrNull(line.tax_amount),
          line_type: line.line_type || 'product',
          is_selected: line.is_selected,
          update_inventory: line.update_inventory,
          create_product: line.create_product && !line.product_id,
          new_product_name: line.new_product_name || line.description,
          new_product_section_id: line.new_product_section_id || sections[0]?.id || null,
          new_product_unit: cleanUnit(line.new_product_unit || line.line_unit),
          new_product_quantity: numberOrNull(line.quantity) || 1,
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
  const scanLimitText = scanUsage
    ? `${scanUsage.remaining} of ${scanUsage.limit} Smart Receipt Scans remaining`
    : 'Checking Smart Receipt Scan limit...';
  const scanButtonDisabled = uploadBusy || !receiptFile || !scanUsage || !scanUsage.allowed;

  return (
    <section className="panel receipt-panel premium-receipt-panel receipt-studio">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Smart receipt studio</p>
          <h2>Scan receipts and save trusted prices</h2>
        </div>
        <span className="badge premium-badge">Professional scan</span>
      </div>
      <p>
        Upload a JPG or PNG receipt photo. Grocery House Manager extracts the store, item rows, prices, discounts, taxes, and total, then lets you review everything before it updates price history.
      </p>
      <div className="receipt-studio-hero">
        <div className="receipt-hero-icon">🧾</div>
        <div>
          <strong>Smart scan with your final approval</strong>
          <span>Quantity defaults to 1 when missing, duplicate product rows are combined, and weighted prices are saved correctly, like $1.50/kg for bananas.</span>
        </div>
      </div>
      <div className="receipt-flow-cards">
        <span><strong>1</strong> Upload receipt</span>
        <span><strong>2</strong> Review extracted rows</span>
        <span><strong>3</strong> Save trusted prices</span>
      </div>
      <div className={`receipt-usage-card ${scanUsage?.is_last_available ? 'last-scan' : ''} ${scanUsage && !scanUsage.allowed ? 'locked' : ''}`}>
        <div>
          <strong>{scanLimitText}</strong>
          <span>{scanUsage?.message || 'Each house uses the owner plan. Manual receipt entry does not use scan quota.'} When you are low on scans, suggest an extra scan pack instead of changing the full plan.</span>
        </div>
        {scanUsage?.plan_name && <span className="badge">{scanUsage.plan_name}</span>}
      </div>
      {error && <div className="error">{error}</div>}
      {uploadResult && <div className="success compact-message">{uploadResult.message}</div>}

      <div className="receipt-upload-card">
        <div>
          <h3>Upload receipt</h3>
          <p className="small-muted">Best results: upload a clear JPG or PNG photo with the receipt flat, well-lit, fully visible, and no cropped totals.</p>
          <p className="small-muted"><strong>{scanLimitText}</strong>. Manual receipt price entry stays available without using a scan.</p>
        </div>
        <label>Store name, optional<input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Costco, Walmart, No Frills" /></label>
        <label>Attach receipt photo (JPG or PNG only)<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => { const file = e.target.files?.[0] || null; if (file && !['image/jpeg', 'image/png'].includes(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) { setError('Please upload a JPG or PNG receipt image only.'); e.target.value = ''; setReceiptFile(null); return; } setError(''); setReceiptFile(file); }} /></label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you want to remember about this receipt" /></label>
        <button className="primary full" type="button" onClick={uploadReceipt} disabled={scanButtonDisabled}>{uploadBusy ? 'Scanning receipt...' : scanUsage?.is_last_available ? 'Use last scan this month' : 'Scan receipt'}</button>
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
              <span>Match or create</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Price/unit</span>
              <span>Line total</span>
              <span>Discount</span>
              <span>Inventory</span>
              <span>Status</span>
            </div>
            {reviewLines.map((line, index) => {
              const rowWillCreate = line.is_selected && line.line_type === 'product' && !line.product_id && line.create_product;
              return (
                <div className={`receipt-line-row ${line.needs_review || rowWillCreate ? 'needs-review' : ''}`} key={`${line.id || 'new'}-${index}`}>
                  <div className="receipt-mobile-field save-field" data-label="Save"><label className="inline-check"><input type="checkbox" checked={line.is_selected} onChange={(e) => updateReviewLine(index, { is_selected: e.target.checked })} /><small>Save</small></label></div>
                  <div className="receipt-mobile-field" data-label="Receipt item"><input value={line.description} onChange={(e) => updateReviewLine(index, { description: e.target.value, new_product_name: line.new_product_name || e.target.value })} placeholder="Product name" /></div>
                  <div className="receipt-mobile-field" data-label="Match or create"><select value={line.product_id} onChange={(e) => updateReviewLine(index, { product_id: e.target.value ? Number(e.target.value) : '', create_product: !e.target.value, new_product_name: line.new_product_name || line.description })}>
                    <option value="">Create / no match</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select></div>
                  <div className="receipt-mobile-field" data-label="Qty"><input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => updateReviewLine(index, { quantity: e.target.value })} placeholder="1" /></div>
                  <div className="receipt-mobile-field" data-label="Unit"><input value={line.line_unit} onChange={(e) => updateReviewLine(index, { line_unit: e.target.value, new_product_unit: e.target.value })} placeholder="pcs/kg" /></div>
                  <div className="receipt-mobile-field" data-label="Price/unit"><input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateReviewLine(index, { unit_price: e.target.value })} placeholder="$/unit" /></div>
                  <div className="receipt-mobile-field" data-label="Line total"><input type="number" min="0" step="0.01" value={line.line_total} onChange={(e) => updateReviewLine(index, { line_total: e.target.value })} placeholder="Total" /></div>
                  <div className="receipt-mobile-field" data-label="Discount"><input type="number" min="0" step="0.01" value={line.discount_amount} onChange={(e) => updateReviewLine(index, { discount_amount: e.target.value })} placeholder="0" /></div>
                  <div className="receipt-mobile-field" data-label="Inventory"><label className="inline-check receipt-inventory-check"><input type="checkbox" checked={line.update_inventory} onChange={(e) => updateReviewLine(index, { update_inventory: e.target.checked })} /><small>Update inventory</small></label></div>
                  <div className="receipt-mobile-field status-field" data-label="Status"><div className="receipt-line-status">
                    <span className={rowWillCreate ? 'badge create' : line.needs_review || !line.product_id ? 'badge warn' : 'badge ok'}>{rowWillCreate ? 'Create' : !line.product_id ? 'Match' : confidenceLabel(line.confidence)}</span>
                    <button className="ghost tiny" type="button" onClick={() => removeReviewLine(index)}>Remove</button>
                  </div></div>
                  {rowWillCreate && (
                    <div className="receipt-create-row">
                      <span className="small-muted"><strong>New inventory item</strong> will be created when you save this receipt.</span>
                      <input value={line.new_product_name} onChange={(e) => updateReviewLine(index, { new_product_name: e.target.value })} placeholder="Inventory product name" />
                      <select value={line.new_product_section_id} onChange={(e) => updateReviewLine(index, { new_product_section_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Auto section</option>
                        {sections.map((section) => <option key={section.id} value={section.id}>{section.icon ? `${section.icon} ` : ''}{section.name}</option>)}
                      </select>
                      <input value={line.new_product_unit} onChange={(e) => updateReviewLine(index, { new_product_unit: e.target.value, line_unit: e.target.value })} placeholder="Inventory unit" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="primary full" type="button" onClick={saveReviewedReceipt} disabled={saveScanBusy || !reviewLines.length}>{saveScanBusy ? 'Saving reviewed receipt...' : 'Save reviewed receipt'}</button>
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
      <div className="receipt-history-shortcut">
        <div>
          <strong>Need older receipts?</strong>
          <span>Open the separate receipt history page to see receipt photos, extracted rows, totals, dates, and saved prices.</span>
        </div>
        <Link className="secondary center-link" to={`/houses/${houseId}/receipts`}>Open receipt history</Link>
      </div>
    </section>
  );
}


