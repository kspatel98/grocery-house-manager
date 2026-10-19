import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api,errorMessage} from '../api';
import HouseCreditWalletPanel from '../components/HouseCreditWalletPanel';
type House={id:number;name:string;role:string};
type Personal={balance:number;events:{id:number;delta:number;kind:string;created_at:string}[];purchase_options:{credits:number;price_cents:number;enabled:boolean}[]};
export default function WalletPage(){
 const [params,setParams]=useSearchParams();const [houses,setHouses]=useState<House[]>([]);const [personal,setPersonal]=useState<Personal|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const houseId=Number(params.get('house')||0);
 useEffect(()=>{Promise.all([api.get<{houses:House[]}>('/credits/wallet/houses'),api.get<Personal>('/credits/wallet')]).then(([hs,p])=>{setHouses(hs.data.houses);setPersonal(p.data);setLoading(false)}).catch(e=>{setError(errorMessage(e));setLoading(false)})},[]);
 const selected=houses.find(h=>h.id===houseId);
 const choose=(id:number)=>setParams(id?{house:String(id)}:{});
 async function buy(credits:number){try{setBusy(true);const r=await api.post<{checkout_url:string}>('/credits/wallet/checkout',{credits,house_id:null});window.location.assign(r.data.checkout_url);}catch(e){setError(errorMessage(e));setBusy(false)}}
 return <main className="page shell wide v142-wallet-page">
  <section className="v142-wallet-hero"><div className="v142-token-hero"><img src="/brand/ghm-token.svg" alt="GHM Token"/></div><div><p className="eyebrow">YOUR GHM WALLET</p><h1>GHM Tokens</h1><p>Keep tokens for yourself or contribute to a house you belong to. House owners and admins exchange pooled tokens for extra GHM services.</p><div className="v142-wallet-hero-badges"><span>Closed-loop service tokens</span><span>No cash withdrawal</span><span>Member contributions</span></div></div></section>
  {error&&<p className="error" role="alert">{error}</p>}
  {params.get('payment')==='success'&&<p className="success" role="status">Checkout completed. Token balance updates when Stripe confirms payment.</p>}
  {loading&&<p role="status">Loading your wallet…</p>}
  {personal&&<section className="v142-wallet-summary"><div><small>Personal token balance</small><strong>{personal.balance} <span>GHM Tokens</span></strong><p>Spend your tokens by contributing them to a selected house. Your personal wallet is separate from every house fund.</p></div><div className="v142-wallet-token-packs"><h2>Buy tokens for yourself</h2><div className="v142-topups">{personal.purchase_options.map(pack=><button key={pack.credits} type="button" className="v142-topup" disabled={busy||!pack.enabled} onClick={()=>void buy(pack.credits)}><b>{pack.credits} <img src="/brand/ghm-token.svg" alt=""/></b><span>{pack.enabled?`CA$${(pack.price_cents/100).toFixed(2)}`:'Unavailable'}</span></button>)}</div><small>Choose a house below to buy directly for that house or contribute tokens you already own.</small></div></section>}
  <section className="panel v142-house-selector"><label htmlFor="ghm-wallet-house">Selected house for contributions and service exchange</label><select id="ghm-wallet-house" value={selected?.id||''} onChange={e=>choose(Number(e.target.value))}><option value="">Choose a house</option>{houses.map(h=><option key={h.id} value={h.id}>{h.name} · {h.role}</option>)}</select><small>Only houses where you are a member appear here. Check the house name before buying or contributing.</small></section>
  {selected?<HouseCreditWalletPanel key={selected.id} houseId={selected.id}/>:<section className="panel"><h2>Select a house to share tokens</h2><p>You can keep tokens in your personal balance until you choose a house. Direct donations and service exchange require a selected house.</p><Link to="/houses">View my houses →</Link></section>}
 </main>;
}
