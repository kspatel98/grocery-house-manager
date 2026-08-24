import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import type { Product, Section } from '../types';
import { smartProductIcon, smartProductUnit, smartSectionId } from '../smartCategory';

type Props = {
  houseId: number;
  sections: Section[];
  modal: { mode: 'create' | 'edit'; product?: Product; sectionId?: number };
  onClose: () => void;
  onSaved: () => void;
};

type ProductPreset = {
  label: string;
  icon: string;
  image: string;
  unit: string;
};

const PRODUCT_PRESETS: ProductPreset[] = [
  { label: 'Milk', icon: '🥛', image: '/product-icons/milk.svg', unit: 'bags' },
  { label: 'Eggs', icon: '🥚', image: '/product-icons/eggs.svg', unit: 'dozen' },
  { label: 'Bread', icon: '🍞', image: '/product-icons/bread.svg', unit: 'loaf' },
  { label: 'Apples', icon: '🍎', image: '/product-icons/apple.svg', unit: 'pcs' },
  { label: 'Bananas', icon: '🍌', image: '/product-icons/banana.svg', unit: 'pcs' },
  { label: 'Vegetables', icon: '🥦', image: '/product-icons/vegetables.svg', unit: 'pcs' },
  { label: 'Cheese', icon: '🧀', image: '/product-icons/cheese.svg', unit: 'pack' },
  { label: 'Yogurt', icon: '🥣', image: '/product-icons/yogurt.svg', unit: 'tub' },
  { label: 'Snacks', icon: '🍿', image: '/product-icons/snacks.svg', unit: 'pack' },
  { label: 'Rice', icon: '🍚', image: '/product-icons/rice.svg', unit: 'kg' },
  { label: 'Chicken', icon: '🍗', image: '/product-icons/chicken.svg', unit: 'kg' },
  { label: 'Fish', icon: '🐟', image: '/product-icons/fish.svg', unit: 'kg' },
  { label: 'Juice', icon: '🧃', image: '/product-icons/juice.svg', unit: 'bottle' },
  { label: 'Coffee', icon: '☕', image: '/product-icons/coffee.svg', unit: 'pack' },
  { label: 'Cleaning', icon: '🧼', image: '/product-icons/cleaning.svg', unit: 'pcs' },
  { label: 'Toiletries', icon: '🧴', image: '/product-icons/toiletries.svg', unit: 'pcs' },
  { label: 'Frozen', icon: '🧊', image: '/product-icons/frozen.svg', unit: 'pack' },
  { label: 'Pantry', icon: '🥫', image: '/product-icons/pantry.svg', unit: 'can' },
];

const EMOJI_LIBRARY = ['🥛', '🥚', '🍞', '🍎', '🍌', '🥦', '🥕', '🍅', '🧀', '🥣', '🍿', '🍪', '🍚', '🥫', '🍗', '🐟', '🧃', '☕', '🧼', '🧴', '🧻', '🧊'];

async function resizeImageToDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image file.'));
    img.src = dataUrl;
  });

  const maxSize = 720;
  const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image resizing is not supported in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

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
  const [imageBusy, setImageBusy] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const categoryManuallyChosen = useRef(Boolean(product?.section_id || modal.sectionId));
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');

  useEffect(() => {
    if (modal.mode !== 'create' || categoryManuallyChosen.current || !form.name.trim()) return;
    const suggestedSection = smartSectionId(form.name, sections);
    if (suggestedSection && suggestedSection !== form.section_id) {
      setForm((prev) => ({ ...prev, section_id: suggestedSection }));
    }
  }, [form.name, form.section_id, modal.mode, sections]);

  function setField(key: string, value: string | number) {
    if (key === 'section_id') categoryManuallyChosen.current = true;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (modal.mode === 'create' && key === 'name' && !categoryManuallyChosen.current) {
        const suggestedSection = smartSectionId(String(value), sections);
        if (suggestedSection) next.section_id = suggestedSection;
        if (!next.icon) next.icon = smartProductIcon(String(value));
        if (!next.unit || next.unit === 'pcs') next.unit = smartProductUnit(String(value));
      }
      return next;
    });
    if (key === 'image_url') setPreviewBroken(false);
  }

  function optionalNumber(value: string | number) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function applyPreset(preset: ProductPreset) {
    setForm((prev) => {
      const nextName = prev.name || preset.label;
      const suggestedSection = modal.mode === 'create' && !categoryManuallyChosen.current ? smartSectionId(nextName, sections) : prev.section_id;
      return {
        ...prev,
        section_id: suggestedSection || prev.section_id,
        name: nextName,
        icon: preset.icon,
        image_url: preset.image,
        unit: prev.unit && prev.unit !== 'pcs' ? prev.unit : preset.unit,
      };
    });
    setPreviewBroken(false);
  }

  async function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    try {
      setImageBusy(true);
      setError('');
      const resized = await resizeImageToDataUrl(file);
      setForm((prev) => ({ ...prev, image_url: resized }));
      setPreviewBroken(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImageBusy(false);
      event.target.value = '';
    }
  }

  function stopBarcodeScanner() {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    scannerFrameRef.current = null;
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    setScannerOpen(false);
  }

  async function startBarcodeScanner() {
    setScannerError('');
    const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!Detector) {
      setScannerError('Camera barcode scanning is not supported by this browser. You can still type or paste the barcode.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('Camera access is not available in this browser.');
      return;
    }
    try {
      setScannerOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      scannerStreamRef.current = stream;
      const video = scannerVideoRef.current;
      if (!video) throw new Error('Camera preview is not ready.');
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const scan = async () => {
        if (!scannerStreamRef.current || !scannerVideoRef.current) return;
        try {
          const results = await detector.detect(scannerVideoRef.current);
          const raw = results.find((row) => row.rawValue)?.rawValue?.trim();
          if (raw) {
            setField('barcode', raw);
            stopBarcodeScanner();
            return;
          }
        } catch {
          // Some browsers throw transient detection errors between video frames.
        }
        scannerFrameRef.current = requestAnimationFrame(scan);
      };
      scannerFrameRef.current = requestAnimationFrame(scan);
    } catch (err) {
      stopBarcodeScanner();
      setScannerError(errorMessage(err));
    }
  }

  useEffect(() => () => stopBarcodeScanner(), []);

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
      <div className="modal product-modal-enhanced">
        <div className="modal-title">
          <div>
            <p className="eyebrow warm-eyebrow">Inventory item</p>
            <h2>{modal.mode === 'create' ? 'Add product' : 'Edit product'}</h2>
          </div>
          <button onClick={() => { stopBarcodeScanner(); onClose(); }} aria-label="Close product form">×</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit} className="product-form enhanced-product-form">
          <section className="product-visual-editor">
            <div className="product-preview-card">
              <div className="product-image-preview">
                {form.image_url && !previewBroken ? (
                  <img src={form.image_url} alt="Product preview" onError={() => setPreviewBroken(true)} />
                ) : (
                  <span>{form.icon || '🛒'}</span>
                )}
              </div>
              <strong>{form.name || 'Product preview'}</strong>
              <small>{form.store_name || 'Any store'}{form.price !== '' && form.price !== null ? ` • ${money(Number(form.price))}` : ''}</small>
            </div>

            <div className="preset-panel">
              <label>Choose from built-in product images</label>
              <div className="preset-grid">
                {PRODUCT_PRESETS.map((preset) => (
                  <button type="button" key={preset.image} className="preset-tile" onClick={() => applyPreset(preset)}>
                    <img src={preset.image} alt="" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
              <label>Quick emoji icon</label>
              <div className="emoji-preset-row">
                {EMOJI_LIBRARY.map((emoji) => (
                  <button type="button" key={emoji} onClick={() => setField('icon', emoji)}>{emoji}</button>
                ))}
              </div>
            </div>
          </section>

          <div className="form-row">
            <label>Category<select value={form.section_id} onChange={(e) => setField('section_id', Number(e.target.value))}>{sections.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select><small>Auto-selected from the product name. You can change it anytime.</small></label>
            <label>Name<input value={form.name} onChange={(e) => setField('name', e.target.value)} required /></label>
          </div>

          <div className="form-row">
            <label>Icon<input placeholder="🥛" value={form.icon} onChange={(e) => setField('icon', e.target.value)} /></label>
            <label>Image URL<input placeholder="Paste image URL or choose/upload above" value={form.image_url} onChange={(e) => setField('image_url', e.target.value)} /></label>
          </div>

          <label className="file-upload-box">
            Upload product photo — it will be resized automatically
            <input type="file" accept="image/*" onChange={handleImageFile} />
            {imageBusy && <span>Resizing image...</span>}
          </label>

          <div className="form-row">
            <label>Quantity<input type="number" step="0.01" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} /></label>
            <label>Unit<input placeholder="bags, kg, pcs" value={form.unit} onChange={(e) => setField('unit', e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>Price<input type="number" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} placeholder="Leave blank to remove price" /></label>
            <label>Store<input value={form.store_name} onChange={(e) => setField('store_name', e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>Brand<input value={form.brand} onChange={(e) => setField('brand', e.target.value)} /></label>
            <label>Barcode
              <div className="barcode-input-row">
                <input value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} inputMode="numeric" />
                <button type="button" className="secondary barcode-scan-button" onClick={scannerOpen ? stopBarcodeScanner : startBarcodeScanner}>{scannerOpen ? 'Stop camera' : 'Scan'}</button>
              </div>
              <small>On supported phones, Scan uses the rear camera and fills the barcode automatically.</small>
            </label>
          </div>
          {scannerError && <div className="hint compact-message">{scannerError}</div>}
          {scannerOpen && (
            <div className="barcode-camera-panel">
              <video ref={scannerVideoRef} muted playsInline aria-label="Barcode camera preview" />
              <div className="barcode-scan-frame" aria-hidden="true"><span /></div>
              <p>Hold the product barcode inside the frame. It will stop automatically when a code is found.</p>
            </div>
          )}
          <div className="form-row">
            <label>Expiry date<input type="date" value={form.expiry_date} onChange={(e) => setField('expiry_date', e.target.value)} /></label>
            <label>Low stock alert<input type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => setField('low_stock_threshold', e.target.value)} /></label>
          </div>
          <div className="form-row"><button type="button" className="secondary" onClick={() => setField('price', '')}>Clear product price</button><span className="small-muted inline-help">Blank price saves as no price and removes the manual product price.</span></div>
          <label>Notes<textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} /></label>
          <div className="modal-actions">
            <button type="button" onClick={() => { stopBarcodeScanner(); onClose(); }} className="secondary">Cancel</button>
            <button className="primary orange-cta">Save product</button>
          </div>
        </form>
      </div>
    </div>
  );
}
