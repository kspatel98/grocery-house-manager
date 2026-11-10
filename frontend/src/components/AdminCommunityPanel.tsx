import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
type Tip={id:number;kind:string;title:string;place_name:string;city:string;address?:string;notes:string;images:string[];status:string;reports:number;price_amount:number|null;currency_code:string;tax_basis:string;created_at:string;diet_tags:string[]};
export default function AdminCommunityPanel(){
 const [filter,setFilter]=useState('pending');
 const [rows,setRows]=useState<Tip[]>([]);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState<number|null>(null);
 async function load(){try{const {data}=await api.get<Tip[]>('/community/tips/admin',{params:{status:filter}});setRows(data);setError('')}catch(err){setError(errorMessage(err))}}
 useEffect(()=>{void load()},[filter]);
 async function act(row:Tip,action:'approve'|'reject'|'hide'){
  setBusy(row.id);setError('');setNotice('');
  try{await api.put(`/community/tips/admin/${row.id}/moderate`,null,{params:{action}});setNotice(`${row.title}: ${action==='approve'?'published':action==='hide'?'hidden':'rejected'}.`);await load()}catch(err){setError(errorMessage(err))}finally{setBusy(null)}
 }
 return <section className="panel admin-community-v157">
  <div className="panel-title-row"><div><p className="eyebrow">COMMUNITY SAFETY</p><h2>Restaurant recommendations & shared offers</h2><p>Approve accurate, appropriate posts before they appear. Review complaints, photos, dates and claims.</p></div><button className="secondary" onClick={()=>void load()}>Refresh queue</button></div>
  <div className="admin-community-filters-v157">{(['pending','approved','rejected','all'] as const).map(s=><button key={s} className={filter===s?'active':''} onClick={()=>setFilter(s)}>{s==='pending'?'Needs review':s==='approved'?'Live':s==='rejected'?'Rejected':'All'}</button>)}</div>
  {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
  {!rows.length?<div className="community-empty-small-v157">No {filter==='all'?'':filter} community submissions to review.</div>:<div className="admin-community-list-v157">{rows.map(row=><article key={row.id} className="admin-community-row-v157"><div className="admin-community-review-details-v157"><div className="community-tip-top-v157"><span>{row.kind==='restaurant'?'🍽️ Restaurant':'🏷️ Offer'}</span><span>{row.status}{row.reports>0?` · ${row.reports} report(s)`:''}</span></div><h3>{row.title}</h3><p><strong>{row.place_name}</strong> · {row.address||row.city}</p>{row.notes&&<p>{row.notes}</p>}{row.price_amount!==null&&<p>Reported price: {row.currency_code} {row.price_amount} ({row.tax_basis} tax)</p>}{row.diet_tags?.length>0&&<p>Dietary labels: {row.diet_tags.join(', ')}</p>}<small>Submitted {new Date(row.created_at).toLocaleString()}</small></div>{row.images?.length>0&&<div className="admin-community-photo-list-v157">{row.images.map((src,i)=><a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`User-submitted photo ${i+1}`}/></a>)}</div>}<div className="admin-community-actions-v157">{row.status!=='approved'&&<button className="primary" disabled={busy===row.id} onClick={()=>void act(row,'approve')}>Approve & publish</button>}{row.status!=='rejected'&&<button className="secondary" disabled={busy===row.id} onClick={()=>void act(row,row.status==='approved'?'hide':'reject')}>{row.status==='approved'?'Hide post':'Reject'}</button>}</div></article>)}</div>}
 </section>;
}
