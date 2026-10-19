import {useEffect,useState} from 'react';
import {api,errorMessage} from '../api';
import type {AdminUser,AdminUserOffer} from '../types';
type EmailPreview={recipient_email:string;subject:string;text:string;html:string;sender_role:string};
type CostRow={feature:string;count:number;unit_cost_cad:number|null;estimated_cost_cad:number|null};
type CostReport={month:string;rows:CostRow[];known_estimated_total_cad:number;all_costs_configured:boolean;house_credit_sales_cad:number;note:string};
export default function AdminGrowthPanel({users,offers}:{users:AdminUser[];offers:AdminUserOffer[]}){
 const [userId,setUserId]=useState(''),[offerId,setOfferId]=useState(''),[kind,setKind]=useState('discount'),[senderRole,setSenderRole]=useState('GHM Team');
 const [title,setTitle]=useState(''),[note,setNote]=useState(''),[draft,setDraft]=useState<EmailPreview|null>(null);
 const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [report,setReport]=useState<CostReport|null>(null);
 useEffect(()=>{api.get<CostReport>('/admin/growth/feature-costs').then(r=>setReport(r.data)).catch(()=>{});},[]);
 const payload=()=>({user_id:Number(userId),offer_id:offerId?Number(offerId):null,kind,sender_role:senderRole,subject_override:title.trim()||null,custom_note:note.trim()||null});
 async function preview(){if(!userId){setError('Select a recipient first.');return;}try{setBusy(true);setError('');setSuccess('');const r=await api.post<EmailPreview>('/admin/growth/offer-email/preview',payload());setDraft(r.data);}catch(e){setError(errorMessage(e));}finally{setBusy(false)}}
 async function send(){if(!draft||!accepted||!window.confirm(`Send this offer email to ${draft.recipient_email}?`))return;try{setBusy(true);setError('');const r=await api.post<{message:string}>('/admin/growth/offer-email/send',{...payload(),confirm_send:true,confirm_marketing_permission:true});setSuccess(r.data.message);setAccepted(false);}catch(e){setError(errorMessage(e));}finally{setBusy(false)}}
 const readable=(feature:string)=>({grocery_scan:'Grocery image scans',product_lookup:'Product lookups',ask_ghm:'Ask GHM responses',kitchen_vision:'Kitchen Vision',receipt_scan:'Receipt scans',paid_provider:'Paid price/flyer calls'}[feature]||feature);
 return <>
 <section className="panel v140-admin-panel"><div><p className="eyebrow">GHM OFFICIAL COMMUNICATIONS</p><h2>Professional offer email composer</h2><p>Select one user and an existing offer, or prepare a standalone message. The preview uses verified offer details where available; it does not invent active discounts.</p></div>
 <div className="v140-form-row"><label>Recipient<select value={userId} onChange={e=>{setUserId(e.target.value);setDraft(null);}}><option value="">Select a user</option>{users.map(x=><option key={x.id} value={x.id}>{x.full_name||x.email} — {x.email}</option>)}</select></label>
 <label>Issued offer<select value={offerId} onChange={e=>{setOfferId(e.target.value);setDraft(null)}}><option value="">Standalone message (no specific granted offer)</option>{offers.filter(o=>!userId||!o.user_id||String(o.user_id)===userId).map(o=><option key={o.id} value={o.id}>{o.title} · {o.status}</option>)}</select></label>
 <label>Message purpose<select value={kind} onChange={e=>{setKind(e.target.value);setDraft(null)}}><option value="discount">Discount</option><option value="free_access">Limited free access</option><option value="announcement">Product update / announcement</option></select></label>
 <label>Signature<select value={senderRole} onChange={e=>{setSenderRole(e.target.value);setDraft(null)}}>{['GHM Team','Founder','CEO','Owner'].map(r=><option key={r}>{r}</option>)}</select></label></div>
 <label>Email subject override (optional)<input value={title} onChange={e=>{setTitle(e.target.value);setDraft(null)}} maxLength={170} placeholder="Leave blank for the offer title"/></label>
 <label>Personal message (optional)<textarea value={note} onChange={e=>{setNote(e.target.value);setDraft(null)}} rows={3} maxLength={1500} placeholder="A short, personal note. The app will format it professionally."/></label>
 <div className="v140-form-row"><button className="primary" type="button" disabled={busy} onClick={preview}>Preview branded email</button><button type="button" className="secondary" disabled={!draft} onClick={()=>{if(draft){void navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.text}`);setSuccess('Email draft copied.')}}}>Copy subject + email</button></div>
 {draft&&<><p><strong>To:</strong> {draft.recipient_email} · <strong>Subject:</strong> {draft.subject}</p><div className="v140-offer-preview" role="region" aria-label="Official email text preview">{draft.text}</div><details><summary>View actual branded HTML</summary><iframe title="GHM offer email preview" sandbox="" srcDoc={draft.html} style={{width:'100%',height:440,border:0,background:'#fff'}}/></details>
 <label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I confirm this particular recipient consented to marketing email or we have another legally valid basis, and I approve sending this preview.</label>
 <button type="button" className="primary" disabled={busy||!accepted} onClick={send}>Send email to selected user</button></>}
 {error&&<p className="error" role="alert">{error}</p>}{success&&<p className="success">{success}</p>}
 </section>
 <section className="panel v140-admin-panel"><div><p className="eyebrow">FEATURE ECONOMICS</p><h2>Usage & provider-cost estimates — {report?.month||'Loading'}</h2><p>Counted usage is real database data. Estimated costs require you to configure your own provider rates.</p></div>
 {report&&<><div className="v140-credit-grid">{report.rows.map(r=><div className="v140-credit-card" key={r.feature}><small>{readable(r.feature)}</small><strong style={{fontSize:'1.4rem'}}>{r.count} uses</strong><span>{r.estimated_cost_cad===null?'Cost not configured':`Est. CA$${r.estimated_cost_cad.toFixed(2)}`}</span><small>{r.unit_cost_cad===null?'Set provider unit cost in backend env':`CA$${r.unit_cost_cad.toFixed(4)} estimated per use`}</small></div>)}</div><p><strong>Estimated subtotal for configured features: CA${report.known_estimated_total_cad.toFixed(2)}</strong> · Purchased house credit revenue: CA${report.house_credit_sales_cad.toFixed(2)}</p><p className="small-muted">{report.note}</p>{!report.all_costs_configured&&<p className="small-muted">Cost figures are incomplete until all provider unit costs are supplied. Do not use this subtotal as net profit.</p>}</>}
 </section></>;
}
