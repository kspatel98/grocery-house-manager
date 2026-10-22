import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
type MerchProduct = {id:number;sku:string;name:string;category:string;description:string;image_url?:string|null;price_cents_cad:number;active:boolean;printkk_design_id?:string|null};
type Catalog = { currency:string;token_value_cents:number;checkout_available:boolean;message:string;products:MerchProduct[] };
export default function MerchandisePage(){
  const [catalog,setCatalog]=useState<Catalog|null>(null);const [error,setError]=useState('');
  useEffect(()=>{api.get<Catalog>('/merch').then(({data})=>setCatalog(data)).catch(e=>setError(errorMessage(e)));},[]);
  return <main className="page shell wide v147-merch-page">
    <header className="v147-merch-hero"><div><p className="eyebrow">GHM STORE · MADE FOR YOUR HOME</p><h1>Everyday essentials, the GHM way.</h1><p>Simple grocery totes, cooking aprons and other useful household merchandise. Admin-curated and printed on demand.</p></div><Link className="secondary center-link" to="/wallet">View GHM Wallet →</Link></header>
    <div className="v147-token-note"><strong>1 GHM Token = $1 CAD</strong><span>When checkout becomes available, eligible wallet tokens will have the same CAD purchasing value for merchandise and GHM services.</span></div>
    {error&&<div className="error">{error}</div>}
    {!catalog&&!error&&<p>Loading merchandise catalog…</p>}
    {catalog&&!catalog.checkout_available&&<div className="hint compact-message" role="status">Catalog preview — purchasing is not enabled yet while PrintKK fulfillment, token debiting and Stripe payment are being verified. No tokens will be charged.</div>}
    <div className="v147-merch-grid">{catalog?.products.map(product=><article className="v147-merch-product" key={product.id}>
      {product.image_url?<img alt={product.name} src={product.image_url} loading="lazy"/>:<div className="v147-merch-placeholder" aria-hidden="true">🛍️</div>}
      <div className="v147-merch-info"><small>{product.category}</small><h2>{product.name}</h2><p>{product.description}</p><strong>${(product.price_cents_cad/100).toFixed(2)} CAD</strong><small>Equivalent value: {(product.price_cents_cad/100).toFixed(2)} GHM Tokens before applicable shipping and taxes</small><button className="secondary" disabled>Checkout coming soon</button></div>
    </article>)}</div>
    {catalog&&!catalog.products.length?<div className="empty-state compact">GHM merchandise is being prepared. Check back after new products are published.</div>:null}
    <p className="small-muted">Images and listings are managed by GHM. Sizes, delivery and taxes will be confirmed before orders are enabled.</p>
  </main>;
}
