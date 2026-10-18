import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import type { Section, ShoppingList } from '../types';
import OverlayPortal from './OverlayPortal';
import { smartSectionId, smartProductUnit, smartSectionSuggestion } from '../smartCategory';

type ScanMode = 'products' | 'written_list';
type Destination = 'shopping' | 'inventory';
type ScanRow = { name: string; category: string; quantity: number | string | null; unit: string; confidence: number; notes: string; needs_review: boolean; product_id: number | null; section_id: number | null; selected: boolean; reviewConfirmed: boolean };
type Preview = { mode: ScanMode; items: Omit<ScanRow, 'selected' | 'section_id' | 'reviewConfirmed'>[]; warnings: string[]; message: string };
const UNITS = ['pcs', 'kg', 'g', 'L', 'mL', 'pack', 'box', 'bag', 'bottle', 'can', 'loaf'];

export default function GroceryPhotoScan({ houseId, sections, initialMode = 'written_list', initialDestination = 'shopping', onClose, onSaved }: {
  houseId: number; sections: Section[]; initialMode?: ScanMode; initialDestination?: Destination; onClose: () => void; onSaved: (result: { destination: Destination; count: number; list_id: number | null }) => void;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [destination, setDestination] = useState<Destination>(initialMode === 'written_list' ? 'shopping' : initialDestination);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [listId, setListId] = useState<number | null>(null);
  const [listPopup, setListPopup] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [quota, setQuota] = useState<{limit:number;used:number;remaining:number}|null>(null);
  const [listTitle, setListTitle] = useState('Scanned Groceries');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'choose' | 'review'>('choose');
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let mounted = true;
    api.get<ShoppingList[]>(`/houses/${houseId}/shopping-lists`).then(({ data }) => {
      if (mounted) { const active = data.filter(list=>!list.is_done); setShoppingLists(active); setListId(active[0]?.id || null); }
    }).catch(() => {});
    api.get<{limit:number;used:number;remaining:number}>(`/houses/${houseId}/grocery-scan/quota`).then(({data}) => {if(mounted)setQuota(data);}).catch(()=>{});
    return () => { mounted = false; };
  }, [houseId]);
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);

  function changeMode(next: ScanMode) {
    if (busy) return;
    setMode(next);
    if (next === 'written_list') setDestination('shopping');
    setStage('choose'); setRows([]); setWarnings([]); setError(''); setEditingRow(null); setListPopup(false);
  }
  function selectFile(next: File | null) {
    if (busy) return;
    setFile(next); setRows([]); setStage('choose'); setError(''); setEditingRow(null); setListPopup(false);
  }
  function updateRow(index: number, change: Partial<ScanRow>) {
    setRows(prev => prev.map((row, i) => i !== index ? row : {
      ...row, ...change,
      product_id: change.product_id !== undefined ? change.product_id : (change.name !== undefined && change.name !== row.name ? null : row.product_id),
      section_id: change.name !== undefined && change.name !== row.name ? (smartSectionId(change.name, sections) || null) : (change.section_id === undefined ? row.section_id : change.section_id),
      category: change.name !== undefined && change.name !== row.name ? ( ["Fruits", "Vegetables", "Dairy", "Pantry", "Bakery", "Beverages", "Household", "Frozen", "Snacks", "Other"].includes(smartSectionSuggestion(change.name).name) ? smartSectionSuggestion(change.name).name : "Other") : (change.category ?? row.category),
      reviewConfirmed: change.name !== undefined || change.quantity !== undefined || change.unit !== undefined ? true : (change.reviewConfirmed ?? row.reviewConfirmed),
    }));
  }

  async function scan() {
    if (!file || busy) return;
    if (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP photo smaller than 8 MB.'); return;
    }
    setError(''); setBusy(true); busyRef.current = true;
    try {
      const form = new FormData();
      form.set('mode', mode); form.set('image', file);
      const { data } = await api.post<Preview>(`/houses/${houseId}/grocery-scan/preview`, form, { timeout: 100000 });
      setWarnings(data.warnings || []);
      setRows((data.items || []).map(item => ({
        ...item, selected: true, reviewConfirmed: !item.needs_review,
        quantity: item.quantity ?? '', unit: item.unit || smartProductUnit(item.name) || 'pcs',
        section_id: smartSectionId(item.name, sections) || null,
        category: item.category || smartSectionSuggestion(item.name).name,
        product_id: item.product_id ?? null,
      })));
      setStage('review');
      window.dispatchEvent(new Event('ghm:usage-changed'));
      api.get<{limit:number;used:number;remaining:number}>(`/houses/${houseId}/grocery-scan/quota`).then(({data:q})=>setQuota(q)).catch(()=>{});
      if (!data.items.length) setError('No groceries could be identified confidently. You can enter items manually below without using another scan credit, or try a clearer picture. This attempt used one image-scan credit.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); busyRef.current = false; }
  }

  function addManualRow() {
    setStage('review');
    setRows(prev=>[...prev,{name:'',category:'Other',quantity:'',unit:'pcs',confidence:0,notes:'Enter the visible grocery name and quantity.',needs_review:true,product_id:null,section_id:null,selected:true,reviewConfirmed:false}]);
    setEditingRow(rows.length);
    setError('');
  }

  const selected = rows.filter(row => row.selected);
  const hasInvalid = selected.some(row => !row.name.trim() || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 || Number(row.quantity) > 10000 || !UNITS.includes(row.unit) || !row.reviewConfirmed);
  const duplicateNames = selected.some((row, i) => selected.slice(0, i).some(p => p.name.trim().toLocaleLowerCase() === row.name.trim().toLocaleLowerCase() && p.unit.toLowerCase() === row.unit.toLowerCase()));

  const needsQuantity = selected.filter(row=> row.quantity === '' || row.quantity === null).length;
  function chooseOneForUnspecified() {
    setRows(prev=>prev.map(row=>row.selected && (row.quantity === '' || row.quantity === null) ? {...row, quantity: 1, reviewConfirmed: true} : row));
  }

  async function apply() {
    if (!selected.length || hasInvalid || duplicateNames || busy) return;
    setBusy(true); busyRef.current = true; setError('');
    try {
      const { data } = await api.post<{ destination: Destination; count: number; list_id: number | null }>(`/houses/${houseId}/grocery-scan/apply`, {
        mode, destination: mode === 'written_list' ? 'shopping' : destination,
        list_id: destination === 'shopping' ? listId : null,
        list_title: listTitle.trim() || 'Scanned Groceries',
        items: selected.map(row => ({
          name: row.name.trim(), quantity: Number(row.quantity), unit: row.unit,
          product_id: row.product_id, section_id: row.product_id ? null : row.section_id, category: row.category,
        })),
      }, { timeout: 60000 });
      window.dispatchEvent(new Event('account:refresh'));
      setListPopup(false);
      onSaved(data);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); busyRef.current = false; }
  }

  return <OverlayPortal>
    <div className="v137-scan-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="v137-scan-modal" role="dialog" aria-modal="true" aria-label="Scan groceries" ref={dialogRef} tabIndex={-1}>
        <header className="v137-scan-header">
          <div><small>GHM SMART CAPTURE</small><h2>Scan groceries</h2><p>One picture, many groceries. You review everything before it changes your house.</p></div>
          <button type="button" className="v137-scan-close" disabled={busy} onClick={onClose} aria-label="Close grocery scanner">×</button>
        </header>
        <div className="v137-scan-content">
          <div className="v137-scan-mode-grid" role="group" aria-label="What do you want to scan?">
            <button type="button" aria-pressed={mode === 'products'} className={mode === 'products' ? 'active' : ''} disabled={busy} onClick={() => changeMode('products')}>
              <span aria-hidden="true">🥑</span><strong>Products</strong><small>Photo of physical groceries, packages or produce</small>
            </button>
            <button type="button" aria-pressed={mode === 'written_list'} className={mode === 'written_list' ? 'active' : ''} disabled={busy} onClick={() => changeMode('written_list')}>
              <span aria-hidden="true">📝</span><strong>Written list</strong><small>Handwritten paper, printed sheet or screenshot</small>
            </button>
          </div>
          {mode === 'products' ? <div className="v137-scan-target"><strong>Add products to</strong><div role="group" aria-label="Where should products go?">
            <button type="button" aria-pressed={destination === 'inventory'} className={destination === 'inventory' ? 'active' : ''} disabled={busy} onClick={() => setDestination('inventory')}>🏠 Inventory</button>
            <button type="button" aria-pressed={destination === 'shopping'} className={destination === 'shopping' ? 'active' : ''} disabled={busy} onClick={() => setDestination('shopping')}>🛒 Shopping list</button>
          </div></div> : <p className="v137-scan-info">Written lists go to <strong>Shopping Lists</strong>. They won't increase inventory quantities until shopping is finished.</p>}
          {quota && <p className="v138-scan-quota">Image scans this month: <strong>{quota.remaining} of {quota.limit} remaining</strong> · Each provider attempt uses one credit, including unclear images.</p>}
          {stage === 'choose' ? <div className="v137-scan-upload">
            <input ref={fileRef} type="file" id="v137-grocery-photo" accept="image/jpeg,image/png,image/webp" onChange={event => selectFile(event.target.files?.[0] || null)} disabled={busy} />
            {previewUrl ? <img src={previewUrl} alt="Selected grocery scan" className="v137-scan-thumbnail" /> : <span aria-hidden="true" className="v137-scan-upload-icon">📷</span>}
            <label htmlFor="v137-grocery-photo">{file ? 'Change photo' : 'Take a picture or choose an image'}</label>
            <small>{file?.name || 'JPG, PNG, WebP · up to 8 MB · one image per scan'}</small>
            <p>For handwritten lists, fill the photo with the whole page and avoid shadows. GHM uses an AI vision service for this scan. Don't include private information on the page if you don't want it processed.</p>
          </div> : <div className="v137-scan-review-head">
            <div><strong>{rows.length} groceries found</strong><small>{selected.length} selected · review quantities and units</small></div>
            <button type="button" disabled={busy} className="secondary" onClick={() => setStage('choose')}>← Choose another photo</button>
          </div>}
          {stage === 'review' && previewUrl && <details className="v138-scan-photo-reference"><summary>Compare with original photo</summary><img src={previewUrl} alt="Original grocery list or products for comparison" /></details>}
          {stage === 'review' && <div className="v139-scan-manual-actions"><button type="button" className="secondary" disabled={busy || rows.length >= 60} onClick={addManualRow}>＋ Add an item manually (no scan credit)</button></div>}
      {stage === 'review' && rows.length > 0 && <div className="v138-scan-tools">
            <strong>{needsQuantity ? `${needsQuantity} quantities need confirmation` : 'Ready for review'}</strong>
            {needsQuantity > 0 && <button type="button" className="secondary" onClick={chooseOneForUnspecified}>Set unspecified quantities to 1 each</button>}
            <small>Check the original photo when uncertain. Tap Edit only on rows you want to change.</small>
          </div>}
          {stage === 'review' && rows.length > 0 ? <div className="v137-scan-rows">
            {rows.map((row, index) => <article className="v137-scan-row v138-scan-row" key={`${index}-${row.product_id || 'new'}`}>
              <div className="v138-scan-row-summary">
                <label className="v137-scan-row-check"><input aria-label={`Include ${row.name}`} type="checkbox" checked={row.selected} onChange={e=>updateRow(index,{selected:e.target.checked})} disabled={busy}/></label>
                <div className="v138-scan-row-title"><strong>{row.name}</strong><small>{row.quantity === '' || row.quantity === null ? 'Quantity not specified' : `${row.quantity} ${row.unit}`}{row.product_id ? ' · Existing product' : ''}</small></div>
                {(row.quantity === '' || row.quantity === null || row.needs_review && !row.reviewConfirmed) && <span className="v137-scan-uncertain">Review</span>}
                <button type="button" className="secondary" aria-expanded={editingRow === index} onClick={()=>setEditingRow(prev=>prev===index?null:index)}>{editingRow===index?'Done':'Edit'}</button>
              </div>
              {editingRow === index && <div className="v138-scan-editor">
                <div className="v137-scan-fields">
                  <label className="v137-scan-name">Name<input disabled={busy || !row.selected} value={row.name} maxLength={180} onChange={e => updateRow(index, { name: e.target.value })} /></label>
                  <label>Quantity<input disabled={busy || !row.selected} inputMode="decimal" type="number" min="0.01" max="10000" step="any" value={row.quantity ?? ''} placeholder="Required" onChange={e => updateRow(index, { quantity: e.target.value })} /></label>
                  <label>Unit<select disabled={busy || !row.selected} value={row.unit} onChange={e => updateRow(index, { unit: e.target.value, product_id: null })}>{UNITS.map(v => <option key={v}>{v}</option>)}</select></label>
                </div>
                {!row.product_id && <label className="v137-scan-section">Category<select disabled={busy || !row.selected} value={row.section_id || ''} onChange={e => updateRow(index, { section_id: Number(e.target.value) || null })}><option value="">Suggested: {row.category}</option>{sections.map(section => <option value={section.id} key={section.id}>{section.icon} {section.name}</option>)}</select></label>}
                {row.needs_review && !row.reviewConfirmed && <label className="v137-scan-confirm"><input type="checkbox" checked={false} disabled={!row.selected || busy} onChange={() => updateRow(index, { reviewConfirmed: true })} />I checked this product against the photo</label>}
                {row.notes && row.needs_review && !row.reviewConfirmed && <small className="v137-scan-note">{row.notes}</small>}
              </div>}
            </article>)}
          </div> : null}
          {warnings.map((warning, i) => <p key={i} className="v137-scan-warning" role="status">⚠ {warning}</p>)}
          {duplicateNames && stage === 'review' ? <p className="v137-scan-warning">There are duplicate names with the same unit. Uncheck or combine duplicates before saving.</p> : null}
          {error && <p className="v137-scan-error" role="alert">{error}</p>}
        </div>
        <footer className="v137-scan-footer">
          <button type="button" disabled={busy} className="secondary" onClick={onClose}>Cancel</button>
          {stage === 'choose' ? <button type="button" disabled={!file || busy} className="primary" onClick={() => void scan()}>{busy ? 'Reading photo…' : 'Scan this image'}</button>
            : <button type="button" className="primary" disabled={busy || selected.length === 0 || hasInvalid || duplicateNames} onClick={() => { if (mode==='written_list' || destination==='shopping') setListPopup(true); else void apply(); }}>{busy ? 'Saving…' : `Add ${selected.length} to ${destination === 'inventory' ? 'inventory' : 'shopping'}`}</button>}
        </footer>
        {listPopup && <div className="v138-scan-list-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setListPopup(false)}}>
          <section className="v138-scan-list-dialog" role="dialog" aria-modal="true" aria-label="Choose shopping list">
            <h3>Where should these {selected.length} groceries go?</h3>
            <p>Choose an existing active list or create a new one. Nothing is saved until you confirm.</p>
            <div role="group" className="v138-list-mode">
              <button type="button" aria-pressed={listId!==null} className={listId!==null?'active':''} disabled={!shoppingLists.length || busy} onClick={()=>setListId(shoppingLists[0]?.id||null)}>Existing list</button>
              <button type="button" aria-pressed={listId===null} className={listId===null?'active':''} disabled={busy} onClick={()=>setListId(null)}>Create new</button>
            </div>
            {listId!==null ? <label>Select an active list<select value={listId} onChange={e=>setListId(Number(e.target.value))}>{shoppingLists.filter(item=>!item.is_done).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <label>New shopping list name<input value={listTitle} maxLength={180} onChange={e=>setListTitle(e.target.value)} placeholder="e.g. Weekly groceries"/></label>}
            {error && <div className="v137-scan-error">{error}</div>}
            <div className="v138-list-actions"><button type="button" className="secondary" onClick={()=>setListPopup(false)} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || (listId===null && !listTitle.trim())} onClick={()=>void apply()}>{busy?'Saving…':`Confirm & add ${selected.length}`}</button></div>
          </section>
        </div>}
      </section>
    </div>
  </OverlayPortal>;
}
