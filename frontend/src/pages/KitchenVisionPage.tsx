import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { House, KitchenVisionApplyResponse, KitchenVisionDetection, KitchenVisionResult, KitchenVisionReviewItem, KitchenZone, PremiumTryStatus } from '../types';

const ZONE_TYPES = [
  ['fridge', '🥛', 'Fridge'],
  ['freezer', '❄️', 'Freezer'],
  ['pantry', '🥫', 'Pantry'],
  ['cupboard', '▦', 'Cupboard'],
  ['rack', '▥', 'Rack / shelf'],
  ['counter', '◫', 'Counter'],
  ['garage', '⌂', 'Garage / basement'],
  ['custom', '✦', 'Custom'],
] as const;

function zoneIcon(type: string) {
  return ZONE_TYPES.find(([key]) => key === type)?.[1] || '✦';
}

function relativeDate(value?: string | null) {
  if (!value) return 'Not scanned yet';
  const date = new Date(value);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays <= 0) return 'Checked today';
  if (diffDays === 1) return 'Checked yesterday';
  if (diffDays < 14) return `Checked ${diffDays} days ago`;
  return `Checked ${date.toLocaleDateString()}`;
}

function quantityLabel(detection: KitchenVisionDetection) {
  if (detection.quantity_min != null && detection.quantity_max != null && detection.quantity_min !== detection.quantity_max) {
    return `~${detection.quantity_min}–${detection.quantity_max} ${detection.unit || ''}`.trim();
  }
  if (detection.estimated_quantity != null) return `~${detection.estimated_quantity} ${detection.unit || ''}`.trim();
  if (detection.visible_instance_count != null) return `${detection.visible_instance_count} physical unit${detection.visible_instance_count === 1 ? '' : 's'} visible`;
  return 'Quantity needs review';
}

function needsDecision(detection: KitchenVisionDetection) {
  if (!detection.matched_product_id) return true;
  if (detection.confidence_label !== 'high') return true;
  if (detection.estimated_quantity != null && detection.current_quantity != null && Math.abs(detection.estimated_quantity - detection.current_quantity) > 0.001) return true;
  if (detection.quantity_min != null && detection.quantity_max != null && detection.quantity_min !== detection.quantity_max) return true;
  return false;
}

export default function KitchenVisionPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [house, setHouse] = useState<House | null>(null);
  const [premiumTry, setPremiumTry] = useState<PremiumTryStatus | null>(null);
  const [zones, setZones] = useState<KitchenZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [scanMode, setScanMode] = useState<'quick' | 'full' | 'targeted'>('quick');
  const [fullRefresh, setFullRefresh] = useState(false);
  const [completedZones, setCompletedZones] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<KitchenVisionResult | null>(null);
  const [review, setReview] = useState<Record<string, KitchenVisionReviewItem>>({});
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [autoRestock, setAutoRestock] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('cupboard');
  const [zoneFormOpen, setZoneFormOpen] = useState(false);

  async function load() {
    try {
      const [houseRes, zonesRes, premiumTryRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<KitchenZone[]>(`/ai/houses/${id}/kitchen-zones`, { params: { t: Date.now() } }),
        api.get<PremiumTryStatus>('/billing/premium-try', { params: { t: Date.now() } }).catch(() => ({ data: null as PremiumTryStatus | null })),
      ]);
      setHouse(houseRes.data);
      setZones(zonesRes.data);
      setPremiumTry(premiumTryRes.data);
      setSelectedZoneId((current) => current && zonesRes.data.some((zone) => zone.id === current) ? current : zonesRes.data[0]?.id || null);
      setError('');
    } catch (err) {
      const text = errorMessage(err);
      setError(text);
      if (text.includes('not a member')) navigate('/houses');
    }
  }

  useEffect(() => { void load(); }, [id]);
  useHouseLiveRefresh(id, load);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;
  const actionable = useMemo(() => result?.detections.filter(needsDecision) || [], [result]);
  const confirmed = useMemo(() => result?.detections.filter((row) => !needsDecision(row)) || [], [result]);
  const fullProgress = zones.length ? Math.round((completedZones.size / zones.length) * 100) : 0;

  function prepareReview(data: KitchenVisionResult) {
    const next: Record<string, KitchenVisionReviewItem> = {};
    data.detections.forEach((detection) => {
      const decisionNeeded = needsDecision(detection);
      const suggested = decisionNeeded && (detection.suggested_action === 'update' || detection.suggested_action === 'add')
        ? detection.suggested_action
        : 'ignore';
      next[detection.detection_id] = {
        detection_id: detection.detection_id,
        action: suggested,
        product_id: detection.matched_product_id || null,
        name: detection.matched_product_name || detection.detected_name,
        quantity: detection.estimated_quantity ?? detection.current_quantity ?? detection.visible_instance_count ?? 1,
        unit: detection.unit || detection.current_unit || 'pcs',
      };
    });
    setReview(next);
  }

  async function runScan() {
    if (!selectedZone) {
      setError('Choose the storage area you are scanning first.');
      return;
    }
    const files = Array.from(inputRef.current?.files || []);
    if (!files.length) {
      setError('Choose 2–4 photos or a short, slow video of this area first.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const form = new FormData();
      files.slice(0, 6).forEach((file) => form.append('media', file));
      form.append('zone_id', String(selectedZone.id));
      form.append('scan_mode', scanMode);
      const usingPremiumTry = Boolean(premiumTry?.available && premiumTry.selected_feature === 'kitchen_vision');
      if (usingPremiumTry && !window.confirm('Use Kitchen Vision as your one free Premium Try? The free try is only used after GHM successfully analyzes the scan.')) return;
      const { data } = await api.post<KitchenVisionResult>(`/ai/houses/${id}/kitchen-vision`, form, { headers: { 'Content-Type': 'multipart/form-data', ...(usingPremiumTry ? { 'X-GHM-Premium-Try': 'kitchen_vision' } : {}) } });
      setResult(data);
      if (usingPremiumTry) {
        const refreshed = await api.get<PremiumTryStatus>('/billing/premium-try', { params: { t: Date.now() } }).catch(() => null);
        if (refreshed?.data) setPremiumTry(refreshed.data);
        window.dispatchEvent(new Event('account:refresh'));
      }
      prepareReview(data);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function updateReview(detectionId: string, patch: Partial<KitchenVisionReviewItem>) {
    setReview((current) => ({ ...current, [detectionId]: { ...current[detectionId], ...patch } }));
  }

  function moveToNextFullZone(doneZoneId: number) {
    const nextDone = new Set(completedZones);
    nextDone.add(doneZoneId);
    setCompletedZones(nextDone);
    const next = zones.find((zone) => !nextDone.has(zone.id));
    setResult(null);
    setReview({});
    if (inputRef.current) inputRef.current.value = '';
    if (next) {
      setSelectedZoneId(next.id);
      setMessage(`${zones.length - nextDone.size} area${zones.length - nextDone.size === 1 ? '' : 's'} left. Next: ${next.name}.`);
    } else {
      setFullRefresh(false);
      setScanMode('quick');
      setMessage('Full kitchen refresh complete. GHM now has a stronger picture of the areas you chose to scan.');
    }
  }

  async function applyChanges() {
    if (!result || !selectedZone) return;
    try {
      setApplyBusy(true);
      setError('');
      const items = actionable.map((detection) => review[detection.detection_id]).filter(Boolean);
      const { data } = await api.post<KitchenVisionApplyResponse>(`/ai/houses/${id}/kitchen-vision/apply`, {
        scan_id: result.scan_id || null,
        items,
        add_depleted_staples_to_list: autoRestock,
      });
      setMessage(data.message + (data.added_to_list.length ? ` Added to shopping: ${data.added_to_list.join(', ')}.` : ''));
      window.dispatchEvent(new Event('account:refresh'));
      window.dispatchEvent(new CustomEvent('ghm:success-moment', { detail: { type: 'inventory_check', message: 'Your approved Kitchen Vision changes were applied.' } }));
      if (fullRefresh) moveToNextFullZone(selectedZone.id);
      else {
        setResult(null);
        setReview({});
        if (inputRef.current) inputRef.current.value = '';
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApplyBusy(false);
    }
  }

  async function createZone() {
    if (!newZoneName.trim()) return;
    try {
      setError('');
      const { data } = await api.post<KitchenZone>(`/ai/houses/${id}/kitchen-zones`, { name: newZoneName.trim(), zone_type: newZoneType });
      setNewZoneName('');
      setZoneFormOpen(false);
      await load();
      setSelectedZoneId(data.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function archiveZone(zone: KitchenZone) {
    if (!confirm(`Remove ${zone.name} from your Kitchen Map? Scan history stays in GHM, but the area will no longer appear.`)) return;
    try {
      await api.delete(`/ai/houses/${id}/kitchen-zones/${zone.id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function startQuick(zoneId?: number) {
    setFullRefresh(false);
    setCompletedZones(new Set());
    setScanMode('quick');
    setResult(null);
    setReview({});
    if (zoneId) setSelectedZoneId(zoneId);
  }

  function startFullRefresh() {
    setFullRefresh(true);
    setCompletedZones(new Set());
    setScanMode('full');
    setResult(null);
    setReview({});
    if (zones[0]) setSelectedZoneId(zones[0].id);
    setMessage('Full refresh started. Scan only the areas you actually use—you can skip any area.');
  }

  return (
    <main className="page shell wide kitchen-map-page-v96">
      <header className="kitchen-map-hero-v96">
        <div>
          <Link to={`/houses/${id}?tab=home`} className="breadcrumb">← {house?.name || 'Home'}</Link>
          <p className="eyebrow">GHM KITCHEN MAP</p>
          <h1>Scan real kitchens, not showroom shelves.</h1>
          <p>Fridge, cupboards, rack, pantry, freezer—scan one area at a time. GHM remembers what normally appears there and never treats a hidden product as gone just because the camera missed it.</p>
        </div>
        <div className="kitchen-map-mode-actions-v96">
          <button type="button" className={!fullRefresh ? 'primary' : 'secondary'} onClick={() => startQuick(selectedZoneId || undefined)}>Quick scan</button>
          <button type="button" className={fullRefresh ? 'primary' : 'secondary'} onClick={startFullRefresh}>Full kitchen refresh</button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}
      {premiumTry?.available ? (premiumTry.selected_feature === 'kitchen_vision' ? <div className="premium-try-invite-v102"><span aria-hidden="true">✨</span><div><strong>Your free Kitchen Vision experience is ready.</strong><small>Scan one real storage area. The try is used only after GHM successfully analyzes it; you can still review changes before applying them.</small></div><b aria-hidden="true">Ready</b></div> : <Link className="premium-try-invite-v102" to={`/premium-try?feature=kitchen_vision&house=${id}`}><span aria-hidden="true">✨</span><div><strong>Want to see Kitchen Vision before subscribing?</strong><small>Choose it as your one free Premium Try. One successful scan, no card required.</small></div><b aria-hidden="true">→</b></Link>) : null}

      <section className="kitchen-trust-strip-v96">
        <span>✓</span><div><strong>Not visible ≠ gone</strong><small>GHM can confirm what it sees. It will not silently remove products that may be behind something, in a drawer, or stored somewhere else.</small></div>
        <span>✓</span><div><strong>Multiple identical items stay multiple</strong><small>Three separate milk cartons count as three. One carton appearing in five video frames still counts as one physical carton.</small></div>
        <span>✓</span><div><strong>You approve inventory changes</strong><small>High-confidence observations reduce manual work; uncertain changes stay for review.</small></div>
      </section>

      {fullRefresh ? <section className="kitchen-full-progress-v96">
        <div><p className="eyebrow">FULL REFRESH</p><h2>{completedZones.size}/{zones.length} areas checked</h2><p>Scan the areas that matter. Skipping an area simply means GHM makes no new assumptions about it.</p></div>
        <div className="kitchen-refresh-meter-v96"><span style={{ width: `${fullProgress}%` }} /></div>
      </section> : null}

      <section className="kitchen-zone-section-v96">
        <header><div><p className="eyebrow">YOUR KITCHEN</p><h2>Storage areas</h2><p>GHM learns location patterns from repeated scans. You can add your own names such as “Snack rack” or “Costco storage.”</p></div><button type="button" className="secondary" onClick={() => setZoneFormOpen((value) => !value)}>+ Add area</button></header>
        {zoneFormOpen ? <div className="kitchen-zone-create-v96"><input value={newZoneName} onChange={(event) => setNewZoneName(event.target.value)} placeholder="Example: Baking cupboard" /><select value={newZoneType} onChange={(event) => setNewZoneType(event.target.value)}>{ZONE_TYPES.map(([key,,label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" className="primary" onClick={createZone} disabled={!newZoneName.trim()}>Add area</button></div> : null}
        <div className="kitchen-zone-grid-v96">
          {zones.map((zone) => {
            const selected = zone.id === selectedZoneId;
            const done = completedZones.has(zone.id);
            return <article key={zone.id} className={`${selected ? 'selected' : ''} ${done ? 'done' : ''}`}>
              <button type="button" className="kitchen-zone-select-v96" onClick={() => { setSelectedZoneId(zone.id); setResult(null); setReview({}); }}>
                <span className="kitchen-zone-icon-v96">{zoneIcon(zone.zone_type)}</span>
                <div><strong>{zone.name}</strong><small>{relativeDate(zone.last_scanned_at)}</small></div>
                {done ? <b>✓</b> : zone.last_coverage_percent != null ? <b>{zone.last_coverage_percent}%</b> : <b>→</b>}
              </button>
              <footer><span>{zone.expected_product_count ? `${zone.expected_product_count} products learned here` : 'Learning this area'}</span><button type="button" onClick={() => archiveZone(zone)} aria-label={`Remove ${zone.name}`}>•••</button></footer>
            </article>;
          })}
        </div>
      </section>

      {selectedZone ? <section className="kitchen-scan-workspace-v96">
        <div className="kitchen-scan-guide-v96">
          <div><p className="eyebrow">{scanMode === 'full' ? 'FULL REFRESH' : 'QUICK CHECK'} · {selectedZone.name.toUpperCase()}</p><h2>Show the area naturally.</h2></div>
          <ol><li><span>1</span><div><strong>Open it normally</strong><small>No need to take everything out.</small></div></li><li><span>2</span><div><strong>Move slowly left → right</strong><small>For video, pause briefly at each shelf or drawer.</small></div></li><li><span>3</span><div><strong>Show important hidden sections if easy</strong><small>GHM will tell you afterward if one small recheck would help.</small></div></li></ol>
          <div className="kitchen-scan-file-v96"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" capture="environment" multiple /><small>Best: 2–4 photos or one slow 10–20 second video. Maximum 30 seconds.</small></div>
          <button type="button" className="primary full" onClick={runScan} disabled={busy}>{busy ? `Understanding ${selectedZone.name}…` : premiumTry?.available && premiumTry.selected_feature === 'kitchen_vision' ? `Use free Premium Try — scan ${selectedZone.name}` : `Scan ${selectedZone.name}`}</button>
          {fullRefresh ? <button type="button" className="ghost-button full" onClick={() => moveToNextFullZone(selectedZone.id)}>Skip this area</button> : null}
        </div>

        <aside className="kitchen-area-memory-v96">
          <p className="eyebrow">AREA MEMORY</p>
          <h3>{selectedZone.name}</h3>
          <div><span><small>Last coverage</small><strong>{selectedZone.last_coverage_percent != null ? `${selectedZone.last_coverage_percent}%` : 'New area'}</strong></span><span><small>Products learned</small><strong>{selectedZone.expected_product_count}</strong></span><span><small>Recent sightings</small><strong>{selectedZone.recent_seen_count}</strong></span></div>
          <p>As this household scans the same area over time, GHM narrows recognition using what is normally stored here. History supports recognition—it never overrides what the camera actually shows.</p>
        </aside>
      </section> : null}

      {result ? <section className="kitchen-result-v96">
        <header className="kitchen-result-head-v96">
          <div><p className="eyebrow">{result.zone_name || 'KITCHEN'} · SCAN COMPLETE</p><h2>{actionable.length ? `${actionable.length} thing${actionable.length === 1 ? '' : 's'} worth reviewing` : 'Nothing important needs changing'}</h2><p>{result.scene_summary}</p></div>
          <div className="kitchen-coverage-ring-v96" style={{ ['--coverage' as string]: `${result.coverage_percent}%` }}><strong>{result.coverage_percent}%</strong><small>coverage</small></div>
        </header>
        <div className="kitchen-result-stats-v96"><span><strong>{confirmed.length}</strong><small>confirmed · no action</small></span><span><strong>{actionable.length}</strong><small>review changes</small></span><span><strong>{result.not_confirmed.length}</strong><small>not confirmed · unchanged</small></span><span><strong>{result.frames_analyzed}</strong><small>frames compared</small></span></div>

        {actionable.length ? <div className="kitchen-review-list-v96">
          {actionable.map((detection) => {
            const row = review[detection.detection_id];
            return <article key={detection.detection_id} className={`confidence-${detection.confidence_label}`}>
              <header><div><strong>{detection.detected_name}</strong><small>{detection.matched_product_name ? `Matched: ${detection.matched_product_name}` : 'Possible new product'} · {Math.round(detection.confidence * 100)}% confidence</small></div><span>{detection.confidence_label}</span></header>
              <div className="kitchen-physical-proof-v96">
                <span><small>Physical objects</small><strong>{detection.visible_instance_count != null ? detection.visible_instance_count : '—'}</strong></span>
                <span><small>Visible estimate</small><strong>{quantityLabel(detection)}</strong></span>
                <span><small>Inventory now</small><strong>{detection.current_quantity != null ? `${detection.current_quantity} ${detection.current_unit || ''}` : 'Not tracked'}</strong></span>
                {detection.remaining_percent != null ? <span><small>Visible remaining</small><strong>~{Math.round(detection.remaining_percent)}%</strong></span> : null}
              </div>
              <p>{detection.notes || 'Review this observation before changing inventory.'}</p>
              {detection.seen_in_frames.length ? <small className="kitchen-frame-proof-v96">Seen across frame{detection.seen_in_frames.length === 1 ? '' : 's'} {detection.seen_in_frames.join(', ')}. Repeated views of the same physical object are counted once.</small> : null}
              {row ? <div className="kitchen-review-controls-v96"><select value={row.action} onChange={(event) => updateReview(detection.detection_id, { action: event.target.value as KitchenVisionReviewItem['action'] })}><option value="ignore">Keep inventory unchanged</option>{detection.matched_product_id ? <option value="update">Update existing inventory</option> : null}<option value="add">Add as new product</option></select>{row.action !== 'ignore' ? <><input value={row.name || ''} onChange={(event) => updateReview(detection.detection_id, { name: event.target.value })} placeholder="Product name" /><input type="number" min={0} step="0.1" value={row.quantity ?? ''} onChange={(event) => updateReview(detection.detection_id, { quantity: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Quantity" /><input value={row.unit || ''} onChange={(event) => updateReview(detection.detection_id, { unit: event.target.value })} placeholder="Unit" /></> : null}</div> : null}
            </article>;
          })}
        </div> : <div className="kitchen-all-calm-v96"><span>✓</span><div><strong>{confirmed.length} visible product{confirmed.length === 1 ? '' : 's'} looked consistent.</strong><small>GHM keeps these confirmations in area memory without making you review every card.</small></div></div>}

        {result.targeted_rechecks.length ? <details className="kitchen-recheck-v96"><summary><span><strong>Want a little more confidence?</strong><small>{result.targeted_rechecks.length} optional quick recheck{result.targeted_rechecks.length === 1 ? '' : 's'}</small></span><b>＋</b></summary><div>{result.targeted_rechecks.map((item) => <span key={item}>↻ {item}</span>)}</div></details> : null}

        {result.not_confirmed.length ? <details className="kitchen-not-confirmed-v96"><summary><span><strong>{result.not_confirmed.length} expected item{result.not_confirmed.length === 1 ? '' : 's'} not visible</strong><small>No inventory quantity will be reduced automatically.</small></span><b>＋</b></summary><div>{result.not_confirmed.map((item) => <article key={item.product_id}><div><strong>{item.product_name}</strong><small>Recorded: {item.current_quantity} {item.unit}</small></div><span className={item.status === 'possible_depletion' ? 'attention' : ''}>{item.status === 'possible_depletion' ? 'Confirm if gone' : 'Unchanged'}</span><p>{item.reason}</p></article>)}</div></details> : null}

        {result.unseen_areas.length ? <div className="kitchen-unseen-v96"><strong>Coverage notes</strong>{result.unseen_areas.map((item) => <span key={item}>◇ {item}</span>)}</div> : null}
        {result.warnings.length ? <div className="kitchen-warning-list-v96">{result.warnings.map((warning) => <small key={warning}>⚠ {warning}</small>)}</div> : null}

        <label className="v93-smart-action-toggle"><input type="checkbox" checked={autoRestock} onChange={(event) => setAutoRestock(event.target.checked)} /><span><strong>Restock approved depleted staples</strong><small>Only products you explicitly update to a low/depleted quantity can be added to the active shopping list.</small></span></label>
        <div className="kitchen-result-actions-v96"><button type="button" className="secondary" onClick={() => { setResult(null); setReview({}); }}>Discard this scan</button><button type="button" className="primary" onClick={applyChanges} disabled={applyBusy}>{applyBusy ? 'Applying approved changes…' : fullRefresh ? 'Apply & continue refresh' : 'Apply approved changes'}</button></div>
        <small className="kitchen-result-policy-v96">{result.message}</small>
      </section> : null}
    </main>
  );
}
