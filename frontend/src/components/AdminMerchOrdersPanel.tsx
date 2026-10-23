import { useEffect,useState } from 'react';
import { api,errorMessage } from '../api';
type Order={id:string;status:string;items:{name:string;quantity:number}[];total_cents:number;tokens_used:number;card_cents:number;provider_stage:string;provider_status?:string|null;printkk_order_id?:string|null;shipping_address?:{name:string;city:string;province:string;postal_code:string};tracking_number?:string|null;created_at:string;support_note?:string|null};
export default function AdminMerchOrdersPanel(){
 const [orders,setOrders]=useState<Order[]>([]),[busy,setBusy]=useState(''),[note,setNote]=useState('');
 const reload=async()=>{try{const {data}=await api.get<Order[]>('/merch/admin/orders');setOrders(data);}catch(e){setNote(errorMessage(e));}};
 useEffect(()=>{void reload();},[]);
 async function action(order:Order,step:'submit'|'pay-supplier'|'sync'|'cancel-and-refund'|'reconcile'|'cancel-supplier'|'reconcile-stripe'|'tracking'|'verify-supplier-canceled'){
   const confirmMessage=step==='pay-supplier'?'Pay PrintKK using your supplier wallet? This is a real supplier charge.':step==='submit'?'Submit this PAID order to PrintKK? Verify the design, shipping details and estimated supplier cost first.':'Continue with this order action?';
   if(!window.confirm(confirmMessage))return;
   setBusy(order.id+step);setNote('');
   try{let path=`/merch/admin/orders/${encodeURIComponent(order.id)}/${step}`;let data:Record<string,string>={};
     if(step==='reconcile-stripe'){const id=window.prompt('Verified Stripe Checkout Session ID from dashboard:');if(!id)return;data={session_id:id};}
     if(step==='tracking'){
       const carrier=window.prompt('Verified carrier name:');if(!carrier)return;
       const tracking_number=window.prompt('Tracking number:');if(!tracking_number)return;
       const tracking_url=window.prompt('HTTPS tracking URL (optional):')||'';
       await api.put(`/merch/admin/orders/${encodeURIComponent(order.id)}/tracking`,{carrier,tracking_number,tracking_url:tracking_url||null});await reload();return;
     }
     if(step==='verify-supplier-canceled'){
       const reference=window.prompt('Supplier support cancellation confirmation/reference (minimum 20 characters):');if(!reference)return;
       await api.post(`/merch/admin/orders/${encodeURIComponent(order.id)}/verify-supplier-canceled`,{reference});await reload();return;
     }
     if(step==='reconcile') {const id=window.prompt('Existing PrintKK order ID found in supplier dashboard:');if(!id)return;path+=`?supplier_order_id=${encodeURIComponent(id)}`;}
     if(step==='cancel-and-refund'){const reason=window.prompt('Reason documented in audit history:','Order canceled before fulfillment.');if(reason===null)return;data={reason};}
     await api.post(path,data);setNote(`${order.id}: ${step} request accepted.`);await reload();
   }catch(e){setNote(errorMessage(e));}finally{setBusy('');}
 }
 return <section className="panel v148-admin-orders"><div className="panel-title-row"><div><p className="eyebrow">GHM STORE · FINANCIAL OPERATIONS</p><h2>Merchandise orders & fulfillment</h2><p>Verify card/token payments, inspect shipping details, submit PrintKK drafts, fund fulfillment and reconcile exceptions. Supplier actions are deliberately not automatic until tested.</p></div><button className="secondary" onClick={()=>void reload()}>Refresh</button></div>
 {note&&<p role="status" className="hint">{note}</p>}
 {!orders.length&&<p>No merchandise orders yet.</p>}
 {orders.map(o=><article className="v148-admin-order" key={o.id}>
  <div className="v148-order-top"><strong>{o.id}</strong><span>{o.status.replace(/_/g,' ')} · {o.provider_stage}</span></div>
  <p>{o.items.map(x=>`${x.name} × ${x.quantity}`).join(', ')}</p>
  <p><strong>${(o.total_cents/100).toFixed(2)} CAD</strong> · {o.tokens_used} tokens · ${(o.card_cents/100).toFixed(2)} card</p>
  <small>Ship to: {o.shipping_address?.name} · {o.shipping_address?.city}, {o.shipping_address?.province} {o.shipping_address?.postal_code}</small>
  <small>PrintKK: {o.printkk_order_id||'Not created'} · {o.provider_status||o.provider_stage} · Tracking {o.tracking_number||'Not assigned'}</small>
  <div className="v148-admin-actions">
   {['paid','fulfillment_review'].includes(o.status)&&o.provider_stage==='not_submitted'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'submit')}>Submit draft to PrintKK</button>}
   {o.status==='checkout_attention'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'reconcile-stripe')}>Reconcile Stripe checkout</button>}
   {o.provider_stage==='submission_uncertain'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'reconcile')}>Reconcile supplier ID</button>}
   {o.provider_stage==='draft_unpaid'&&o.status==='supplier_unpaid'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'pay-supplier')}>Pay PrintKK</button>}
   {o.printkk_order_id&&o.provider_stage==='draft_unpaid'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'cancel-supplier')}>Cancel unpaid PrintKK draft</button>}
   {o.printkk_order_id&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'sync')}>Sync tracking/status</button>}
   {o.printkk_order_id&&o.provider_stage==='paid'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'tracking')}>Enter verified tracking</button>}
   {o.printkk_order_id&&o.provider_stage!=='supplier_canceled'&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'verify-supplier-canceled')}>Verify supplier support cancellation</button>}
   {['cancel_requested','paid','awaiting_payment','supplier_unpaid'].includes(o.status)&&<button className="secondary" disabled={!!busy} onClick={()=>void action(o,'cancel-and-refund')}>Cancel/refund (policy checks)</button>}
  </div>
 </article>)}
 </section>;
}
