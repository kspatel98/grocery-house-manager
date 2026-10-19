import { useEffect, useState } from 'react';
import { api } from '../api';

type FeatureKey = 'grocery_scan' | 'product_lookup' | 'ask_ghm' | 'kitchen_vision' | 'receipt_scan' | 'paid_provider_day' | 'paid_provider_month';
type Counter = { limit: number; used: number; remaining: number; period: 'month' | 'day'; description: string };
type Usage = { plan_name: string; reset_note: string; house_credits?:Record<string, number>; features: Record<FeatureKey,Counter> };

/** Read-only view. Cached results do not consume a new paid provider run. */
export default function FeatureUsageStrip({ houseId, features, compact = false }: {houseId?: number | null; features:FeatureKey[]; compact?:boolean}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    if (!houseId) { setUsage(null); return; }
    let active = true;
    const reload = () => { api.get<Usage>(`/houses/${houseId}/feature-usage`).then(({data})=>{ if(active) setUsage(data); }).catch(()=>{if(active)setUsage(null);}); };
    reload();
    window.addEventListener('account:refresh',reload);
    window.addEventListener('focus',reload);
    window.addEventListener('ghm:usage-changed',reload);
    return ()=> {active=false;window.removeEventListener('account:refresh',reload);window.removeEventListener('focus',reload);window.removeEventListener('ghm:usage-changed',reload);};
  },[houseId]);
  if (!usage || !features.length) return null;
  return <aside className={`v139-usage-strip ${compact ? 'compact' : ''}`} aria-label="Feature usage remaining">
    {features.map(key => {
      const row=usage.features[key];
      if (!row) return null;
      return <div className="v139-usage-item" key={key}><span>{row.description}</span>
        <strong className={row.limit > 0 && row.remaining === 0 ? 'exhausted' : ''}>{row.limit > 0 ? `${row.remaining} of ${row.limit} left` : 'Not included'}</strong>
        <small>{row.period === 'day' ? 'Resets daily' : 'Resets monthly'}{usage.house_credits?.[key === 'paid_provider_day' || key === 'paid_provider_month' ? 'paid_provider' : key] ? ` · +${usage.house_credits[key === 'paid_provider_day' || key === 'paid_provider_month' ? 'paid_provider' : key]} house credits` : ''}</small>
      </div>;
    })}
    {!compact && <small className="v139-usage-help">All included limits are shared across the subscription owner's houses. Cached results do not spend additional credits. <a href={`/wallet?house=${houseId}`}>Purchase or view this house’s extra credits</a></small>}
  </aside>;
}
