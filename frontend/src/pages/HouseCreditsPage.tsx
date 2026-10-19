import {useCallback,useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api,errorMessage} from '../api';
type Pack={key:string;feature:string;units:number;label:string;price_cents:number|null;currency:string};
type Event={id:number;feature:string;delta:number;kind:string;actor:string;amount_cents:number|null;created_at:string};
type Data={balances:Record<string,number>;packs:Pack[];members_can_spend:boolean;can_spend:boolean;is_owner:boolean;events:Event[]};
const labels:Record<string,string>={receipt_scan:'Receipt scans',grocery_scan:'Grocery scans',product_lookup:'Product lookups',ask_ghm:'Ask GHM responses',kitchen_vision:'Kitchen Vision',paid_provider:'Price & flyer requests'};
export default function HouseCreditsPage(){
  const {houseId}=useParams();const id=Number(houseId);
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{if(!id)return;try{const r=await api.get<Data>(`/houses/${id}/credits`);setData(r.data);setError('');}catch(e){setError(errorMessage(e));}},[id]);
  useEffect(()=>{void load();},[load]);
  async function changePolicy(allow:boolean){try{setBusy(true);await api.put(`/houses/${id}/credits/policy`,{members_can_spend:allow});await load();}catch(e){setError(errorMessage(e));}finally{setBusy(false)}}
  async function checkout(pack:Pack){if(pack.price_cents===null)return;try{setBusy(true);setError('');const r=await api.post<{checkout_url:string}>(`/houses/${id}/credits/checkout`,{pack_key:pack.key});window.location.assign(r.data.checkout_url);}catch(e){setError(errorMessage(e));setBusy(false)}}
  return <main className="page shell wide v140-credit-page"><header className="panel"><p className="eyebrow">GHM HOUSE CREDITS</p><h1>Shared service credits</h1><p>Members can contribute prepaid GHM services to this house. Included plan allowances remain shared across the subscription owner's houses; purchased credits stay with this house.</p><Link to={`/houses/${id}`}>← Back to house</Link></header>
   {new URLSearchParams(window.location.search).get('payment')==='success'&&<p className="success">Payment returned successfully. Credits appear only after Stripe confirms the payment. Refresh if processing is still pending.</p>}
   {error&&<p className="error" role="alert">{error}</p>}{status&&<p className="success">{status}</p>}
   {data&&<>
    <section className="panel"><h2>House balances</h2><div className="v140-credit-grid">{Object.entries(labels).map(([key,label])=><article className="v140-credit-card" key={key}><strong>{label}</strong><strong style={{fontSize:'1.6rem'}}>{data.balances[key]||0}</strong><small>Additional purchased uses available to this house</small></article>)}</div></section>
    <section className="panel"><h2>Buy credits for this house</h2><p className="small-muted">Each purchase contributes only the selected service. These are not cash, cannot be withdrawn, and are separate from the monthly subscription allowance. Members can contribute even if only an owner may spend.</p><div className="v140-credit-grid">{data.packs.map(pack=><article key={pack.key} className="v140-credit-card"><strong>{pack.label}</strong><small>{labels[pack.feature]}</small><strong>{pack.price_cents!==null?`CA$${(pack.price_cents/100).toFixed(2)}`:'Pricing coming soon'}</strong><button type="button" className="primary" disabled={busy||pack.price_cents===null} onClick={()=>checkout(pack)}>Contribute to house</button></article>)}</div></section>
    <section className="panel"><h2>Spending permissions</h2><p>{data.members_can_spend?'All house members may use this house’s extra service credits.':'Only the house owner and house admins may use extra credits.'}</p>{data.is_owner&&<label style={{display:'flex',alignItems:'center',gap:10}}><input type="checkbox" checked={data.members_can_spend} disabled={busy} onChange={e=>void changePolicy(e.target.checked)}/>Allow all house members to spend purchased house credits</label>}<small className="small-muted">Only the house owner can change this permission. A real purchase is never required to change permissions.</small></section>
    <section className="panel"><h2>Contribution & usage ledger</h2>{data.events.length?data.events.map(e=><div className="v140-ledger-row" key={e.id}><div><strong>{e.kind==='purchase'?'Contribution':'Service used'}: {labels[e.feature]||e.feature}</strong><br/><small>{e.actor} · {new Date(e.created_at).toLocaleString()}</small></div><strong style={{whiteSpace:'nowrap'}}>{e.delta>0?'+':''}{e.delta}</strong></div>):<p>No contributions or spending yet.</p>}</section>
   </>}
  </main>;
}
