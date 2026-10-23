import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';

type MerchProduct = {id:number;sku:string;name:string;category:string;description:string;image_url?:string|null;price_cents_cad:number;active:boolean;printkk_design_id?:string|null};
type Catalog = { currency:string;token_value_cents:number;checkout_available:boolean;message:string;products:MerchProduct[] };
type OrderItem = {name:string;sku:string;quantity:number;unit_cents:number};
type Order = {id:string;status:string;items:OrderItem[];subtotal_cents:number;shipping_cents:number;tax_cents:number;total_cents:number;tokens_used:number;card_cents:number;created_at:string;provider_stage:string;provider_status?:string|null;tracking_number?:string|null;tracking_url?:string|null;carrier?:string|null;cancellation_reason?:string|null};
type Receipt = {receipt_number:string;date:string|null;currency:string;merchant:string;items:OrderItem[];subtotal_cents:number;shipping_cents:number;tax_cents:number;total_cents:number;ghm_tokens_used:number;stripe_paid_cents:number;payment_status:string;status:string;delivery:Address};
type Address = {name:string;line1:string;line2:string;city:string;province:string;postal_code:string;country:'CA';phone:string};
type Quote = {items:OrderItem[];subtotal_cents:number;shipping_cents:number;tax_cents:number;total_cents:number;tokens:number;tokens_available:number;max_tokens:number;card_cents:number;tax_note:string};
const money=(c:number)=>`$${(c/100).toFixed(2)}`;
const provinceOptions=['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
const initialAddress:Address={name:'',line1:'',line2:'',city:'',province:'ON',postal_code:'',country:'CA',phone:''};
const freshKey=()=>{try{return crypto.randomUUID().replace(/-/g,'')}catch{return `${Date.now()}${Math.random().toString(36).slice(2)}`}};
export default function MerchandisePage(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState('');
 const [cart,setCart]=useState<Record<number,number>>({}),[address,setAddress]=useState<Address>(initialAddress);
 const [tokens,setTokens]=useState(0),[quote,setQuote]=useState<Quote|null>(null);
 const [orders,setOrders]=useState<Order[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [checkoutKey,setCheckoutKey]=useState(freshKey);
 const [showOrders,setShowOrders]=useState(true);
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const lines=useMemo(()=>Object.entries(cart).filter(([,quantity])=>quantity>0).map(([product_id,quantity])=>({product_id:Number(product_id),quantity})),[cart]);
 function reloadOrders(){if(!localStorage.getItem('token'))return;void api.get<Order[]>('/merch/orders').then(r=>setOrders(r.data)).catch(()=>{});}
 useEffect(()=>{api.get<Catalog>('/merch').then(({data})=>setCatalog(data)).catch(e=>setError(errorMessage(e)));reloadOrders();},[]);
 const invalidate=()=>{setQuote(null);setCheckoutKey(freshKey());setNotice('');};
 function qty(id:number,n:number){setCart(prev=>({...prev,[id]:Math.max(0,Math.min(10,n))}));invalidate();}
 function changeAddress(k:keyof Address,v:string){setAddress(prev=>({...prev,[k]:v}));invalidate();}
 function changeTokens(n:number){setTokens(Math.max(0,Math.floor(n)||0));invalidate();}
 function payload(){return {items:lines,shipping:address,tokens};}
 async function preview(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice('');try{const {data}=await api.post<Quote>('/merch/quote',payload());setQuote(data);}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
 async function checkout(){if(!quote)return;setBusy(true);setNotice('');try{const {data}=await api.post<{order:Order;checkout_url:string|null}>('/merch/checkout',{...payload(),idempotency_key:checkoutKey});if(data.checkout_url){window.location.assign(data.checkout_url);return;}if(data.order.status!=='paid'){setNotice('Payment needs verification; check your order status before trying again.');reloadOrders();return;}setNotice('Order received. You can follow progress in Order history.');reloadOrders();setQuote(null);setCart({});setTokens(0);setCheckoutKey(freshKey());}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
 async function showReceipt(id:string){try{const {data}=await api.get<Receipt>(`/merch/orders/${encodeURIComponent(id)}/receipt`);setReceipt(data);}catch(e){setNotice(errorMessage(e));}}
 async function cancelOrder(id:string){const reason=window.prompt('Why would you like to cancel this order? Cancellation is not guaranteed after production begins.','Please cancel my order.');if(reason===null)return;try{await api.post(`/merch/orders/${encodeURIComponent(id)}/cancel-request`,{reason});setNotice('Cancellation request recorded. GHM will review supplier status.');reloadOrders();}catch(e){setNotice(errorMessage(e));}}
 const totalUnits=lines.reduce((n,x)=>n+x.quantity,0);
 return <main className="page shell wide v147-merch-page v148-merch-page">
  <header className="v147-merch-hero"><div><p className="eyebrow">GHM STORE · MADE FOR YOUR HOME</p><h1>Everyday essentials, the GHM way.</h1><p>Thoughtfully designed shopping totes, aprons and household goods. Checkout and shipping through GHM.</p></div><Link className="secondary center-link" to="/wallet">View GHM Wallet →</Link></header>
  <div className="v147-token-note"><strong>1 GHM Token = $1 CAD</strong><span>Apply eligible personal GHM Tokens toward merchandise. All items, delivery and taxes appear in your order total.</span></div>
  {error&&<div className="error" role="alert">{error}</div>}
  {notice&&<div className="hint" role="status">{notice}</div>}
  {!catalog&&!error&&<p>Loading merchandise catalog…</p>}
  {catalog&&!catalog.checkout_available&&<div className="hint compact-message" role="status"><strong>Store preview:</strong> Payment is paused until GHM's Stripe Tax, supplier and fulfillment checks are approved. You can browse products but will not be charged.</div>}
  <div className="v147-merch-grid">{catalog?.products.map(product=><article className="v147-merch-product" key={product.id}>
   {product.image_url?<img alt={product.name} src={product.image_url} loading="lazy"/>:<div className="v147-merch-placeholder" aria-hidden="true">🛍️</div>}
   <div className="v147-merch-info"><small>{product.category}</small><h2>{product.name}</h2><p>{product.description}</p><strong>{money(product.price_cents_cad)} CAD</strong><small>Before shipping and taxes</small>
    <div className="v148-qty"><button type="button" disabled={!catalog.checkout_available} aria-label={`Remove one ${product.name}`} onClick={()=>qty(product.id,(cart[product.id]||0)-1)}>−</button><span>{cart[product.id]||0} in cart</span><button type="button" disabled={!catalog.checkout_available||(cart[product.id]||0)>=10} aria-label={`Add one ${product.name}`} onClick={()=>qty(product.id,(cart[product.id]||0)+1)}>+</button></div>
   </div></article>)}</div>
  {catalog&&!catalog.products.length&&<div className="empty-state compact">No merchandise is currently available.</div>}
  {catalog?.checkout_available&&!localStorage.getItem('token')&&<div className="panel"><p>Sign in to use secure checkout and your GHM Token balance.</p><Link to="/login" className="primary center-link">Sign in to continue</Link></div>}
  {catalog?.checkout_available&&!!localStorage.getItem('token')&&<form className="panel v148-checkout" onSubmit={e=>void preview(e)}>
   <div className="panel-title-row"><div><h2>Shopping cart & delivery</h2><p>{totalUnits} item{totalUnits===1?'':'s'} · Canada only for launch</p></div></div>
   {lines.length===0?<p className="small-muted">Add an item above to prepare checkout.</p>:<div className="v148-cart-list">{lines.map(item=>{const p=catalog.products.find(x=>x.id===item.product_id);return p?<div key={item.product_id} className="v148-cart-row"><strong>{p.name} × {item.quantity}</strong><span>{money(p.price_cents_cad*item.quantity)}</span></div>:null;})}</div>}
   <div className="v148-address-grid">
    <label>Full recipient name<input required value={address.name} maxLength={140} autoComplete="name" onChange={e=>changeAddress('name',e.target.value)}/></label>
    <label>Address line 1<input required value={address.line1} maxLength={180} autoComplete="address-line1" onChange={e=>changeAddress('line1',e.target.value)}/></label>
    <label>Address line 2 (optional)<input value={address.line2} maxLength={180} autoComplete="address-line2" onChange={e=>changeAddress('line2',e.target.value)}/></label>
    <label>City<input required value={address.city} maxLength={120} autoComplete="address-level2" onChange={e=>changeAddress('city',e.target.value)}/></label>
    <label>Province<select value={address.province} onChange={e=>changeAddress('province',e.target.value)}>{provinceOptions.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Postal code<input required value={address.postal_code} maxLength={16} autoComplete="postal-code" onChange={e=>changeAddress('postal_code',e.target.value.toUpperCase())}/></label>
    <label>Phone (for carrier)<input value={address.phone} type="tel" maxLength={30} autoComplete="tel" onChange={e=>changeAddress('phone',e.target.value)}/></label>
    <label>GHM Tokens to apply<input type="number" min={0} max={500} step={1} value={tokens} onChange={e=>changeTokens(Number(e.target.value))}/></label>
   </div>
   <button className="primary" type="submit" disabled={busy||!lines.length}>{busy?'Calculating…':'Calculate shipping, tax and total'}</button>
   {quote&&<div className="v148-quote" aria-live="polite"><h3>Order breakdown</h3>
    <div><span>Products</span><strong>{money(quote.subtotal_cents)}</strong></div><div><span>Delivery</span><strong>{money(quote.shipping_cents)}</strong></div><div><span>Calculated taxes</span><strong>{money(quote.tax_cents)}</strong></div><div><span>GHM Tokens ({quote.tokens})</span><strong>−{money(quote.tokens*100)}</strong></div><div className="v148-grand"><span>Total due by card</span><strong>{money(quote.card_cents)}</strong></div>
    <small>{quote.tax_note} Available balance: {quote.tokens_available} tokens. Max applicable: {quote.max_tokens}.</small>
    <button className="primary" type="button" disabled={busy} onClick={()=>void checkout()}>{busy?'Processing…':quote.card_cents?'Continue to secure Stripe checkout':'Place order using GHM Tokens'}</button>
   </div>}
  </form>}
  {!!localStorage.getItem('token')&&<section className="panel v148-orders"><div className="panel-title-row"><div><h2>My merchandise orders</h2><p>Receipts, progress, shipping updates and cancellation requests</p></div><button className="secondary" type="button" onClick={()=>{setShowOrders(v=>!v);reloadOrders();}}>{showOrders?'Hide orders':'Show orders'}</button></div>
   {showOrders&&(orders.length?orders.map(order=><article className="v148-order-card" key={order.id}>
    <div className="v148-order-top"><strong>{order.id}</strong><span>{order.status.replace(/_/g,' ')}</span></div>
    <small>{order.created_at?new Date(order.created_at).toLocaleDateString():''} · {order.items.map(x=>`${x.name} × ${x.quantity}`).join(', ')}</small>
    <p>Total {money(order.total_cents)} · {order.tokens_used} tokens + {money(order.card_cents)} by card</p>
    <p className="small-muted">PrintKK: {order.provider_status||order.provider_stage}</p>
    {order.tracking_number&&<p>Tracking: {order.carrier||'Carrier'} · {order.tracking_url?.startsWith('https://')?<a href={order.tracking_url} target="_blank" rel="noopener noreferrer">{order.tracking_number}</a>:order.tracking_number}</p>}
    {order.cancellation_reason&&<p className="small-muted">Cancellation requested: {order.cancellation_reason}</p>}
    <button className="secondary" type="button" onClick={()=>void showReceipt(order.id)}>View receipt</button>
    {!['refunded','canceled','completed','shipped','processing','refund_pending','cancel_requested'].includes(order.status)&&<button className="secondary" type="button" onClick={()=>void cancelOrder(order.id)}>Request cancellation</button>}
   </article>):<p className="small-muted">No merchandise orders yet.</p>)}
  </section>}
  {receipt&&<section className="panel v148-receipt" aria-label="GHM purchase receipt">
    <div className="panel-title-row"><div><p className="eyebrow">GHM CUSTOMER RECEIPT</p><h2>{receipt.receipt_number}</h2><p>{receipt.date?new Date(receipt.date).toLocaleString():''} · {receipt.payment_status} · {receipt.status.replace(/_/g,' ')}</p></div><div className="v148-receipt-controls"><button className="secondary" onClick={()=>window.print()}>Print receipt</button><button className="secondary" onClick={()=>setReceipt(null)}>Close</button></div></div>
    <p><strong>Ship to:</strong> {receipt.delivery.name}, {receipt.delivery.line1}, {receipt.delivery.line2&&receipt.delivery.line2+', '}{receipt.delivery.city}, {receipt.delivery.province} {receipt.delivery.postal_code}, Canada</p>
    {receipt.items.map(item=><div className="v148-cart-row" key={item.sku}><span>{item.name} × {item.quantity}</span><strong>{money(item.unit_cents*item.quantity)}</strong></div>)}
    <hr/><div className="v148-cart-row"><span>Products</span><strong>{money(receipt.subtotal_cents)}</strong></div>
    <div className="v148-cart-row"><span>Delivery</span><strong>{money(receipt.shipping_cents)}</strong></div>
    <div className="v148-cart-row"><span>Sales tax</span><strong>{money(receipt.tax_cents)}</strong></div>
    <div className="v148-cart-row"><strong>Total CAD</strong><strong>{money(receipt.total_cents)}</strong></div>
    <div className="v148-cart-row"><span>GHM Tokens</span><strong>{receipt.ghm_tokens_used} (CA${receipt.ghm_tokens_used.toFixed(2)})</strong></div>
    <div className="v148-cart-row"><span>Card amount</span><strong>{money(receipt.stripe_paid_cents)}</strong></div>
    <small>GHM Tokens are prepaid store credits. This receipt summarizes the order and does not replace tax documentation where required.</small>
  </section>}
  <p className="small-muted">Orders are made to order. PrintKK handles production; GHM handles checkout and support. Cancellation is not guaranteed after supplier processing begins.</p>
 </main>;
}
