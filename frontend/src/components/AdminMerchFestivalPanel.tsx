import { useEffect,useState } from 'react';
import { api,errorMessage } from '../api';
type Product = {id:number;sku:string;name:string;category:string;description:string;image_url:string|null;price_cents_cad:number;printkk_design_id:string|null;active:boolean;priority:number};
type PrintKKDesign={design_code:string;name:string;image_url:string|null};
type PrintKKVariant={specification_code:string;label:string;image_url:string|null};
type DesignDetails={design_code:string;name:string;image_url:string|null;category?:string;description?:string;variants:PrintKKVariant[];note:string};
type Festival = {id:number;name:string;festival_date:string;region:string;dishes:string[];reminder_days:number;active:boolean};
const emptyProduct:Omit<Product,'id'>={sku:'',name:'',category:'Kitchen & grocery',description:'',image_url:'',price_cents_cad:0,printkk_design_id:'',active:false,priority:0};
const emptyFestival:Omit<Festival,'id'>={name:'',festival_date:'',region:'Gujarati / Indian',dishes:[],reminder_days:7,active:true};
export default function AdminMerchFestivalPanel(){
 const [products,setProducts]=useState<Product[]>([]),[festivals,setFestivals]=useState<Festival[]>([]);
 const [product,setProduct]=useState<Omit<Product,'id'>>(emptyProduct),[productId,setProductId]=useState<number|null>(null);
 const [festival,setFestival]=useState<Omit<Festival,'id'>>(emptyFestival),[festivalId,setFestivalId]=useState<number|null>(null);
 const [designs,setDesigns]=useState<PrintKKDesign[]>([]),[designDetails,setDesignDetails]=useState<DesignDetails|null>(null),[designPage,setDesignPage]=useState(1),[designLoading,setDesignLoading]=useState(false);
 const [busy,setBusy]=useState(false),[uploadBusy,setUploadBusy]=useState(false),[notice,setNotice]=useState('');
 const load=async()=>{try{const [a,b]=await Promise.all([api.get<Product[]>('/merch/admin'),api.get<Festival[]>('/festival-meals/admin')]);setProducts(a.data);setFestivals(b.data);}catch(e){setNotice(errorMessage(e));}};
 useEffect(()=>{void load();},[]);
 async function loadDesigns(page=1){
  setDesignLoading(true);setNotice('');
  try{const {data}=await api.get<{designs:PrintKKDesign[];page:number}>(`/merch/admin/printkk-designs?page=${page}`);
   setDesigns(data.designs);setDesignDetails(null);setDesignPage(page);
   if(!data.designs.length)setNotice('No designs were returned. Confirm that your PrintKK API key has access to saved designs.');
  }catch(e){setNotice(`Could not load PrintKK designs: ${errorMessage(e)}`);}finally{setDesignLoading(false);}
 }
 async function selectPrintKKDesign(code:string){setDesignLoading(true);setNotice('');
  try{const {data}=await api.get<DesignDetails>(`/merch/admin/printkk-designs/${encodeURIComponent(code)}`);
   setDesignDetails(data);if(!data.variants.length)setNotice('No exact variants found in the PrintKK response. Check the PrintKK design specification in its dashboard.');
  }catch(e){setNotice(`Could not read design: ${errorMessage(e)}`);}finally{setDesignLoading(false);}}
 function useVariant(v:PrintKKVariant){if(!designDetails)return;
  setProduct(prev=>({...prev,sku:prev.sku||`GHM-${designDetails.design_code.replace(/[^A-Za-z0-9_-]/g,'').slice(0,28)}-${v.specification_code.replace(/[^A-Za-z0-9_-]/g,'').slice(0,24)}`,
   name:prev.name||designDetails.name,category:prev.category==='Kitchen & grocery'&&designDetails.category?designDetails.category:prev.category,
   description:prev.description||designDetails.description||'',printkk_design_id:v.specification_code,
   image_url:prev.image_url||v.image_url||designDetails.image_url||''}));
  setNotice('Variant selected. Check name, image, description and CAD price before saving. The product stays hidden until you publish it.');
 }
 async function uploadProductImage(file:File|undefined){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setNotice('Choose a JPG, PNG or WebP image.');return;}
  if(file.size>5*1024*1024){setNotice('Product images must be 5 MB or smaller.');return;}
  setUploadBusy(true);setNotice('');
  try{
   const form=new FormData();form.append('file',file);
   const {data}=await api.post<{url:string}>('/merch/admin/upload-image',form,{headers:{'Content-Type':'multipart/form-data'},timeout:30000});
   setProduct(prev=>({...prev,image_url:data.url}));
   setNotice('Photo uploaded. Save this product to publish the image.');
  }catch(e){setNotice(errorMessage(e));}finally{setUploadBusy(false);}
 }
 async function saveProduct(e:React.FormEvent){e.preventDefault();setBusy(true);try{const url=productId?`/merch/admin/${productId}`:'/merch/admin';await (productId?api.put(url,product):api.post(url,product));setNotice('Product saved; public catalog updates without rebuilding.');setProduct(emptyProduct);setProductId(null);await load();}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
 async function removeProduct(row:Product){if(!window.confirm(`Delete ${row.name} from the GHM catalog?`))return;try{await api.delete(`/merch/admin/${row.id}`);await load();}catch(e){setNotice(errorMessage(e));}}
 async function saveFestival(e:React.FormEvent){e.preventDefault();setBusy(true);try{const url=festivalId?`/festival-meals/admin/${festivalId}`:'/festival-meals/admin';await (festivalId?api.put(url,festival):api.post(url,festival));setFestival(emptyFestival);setFestivalId(null);setNotice('Festival calendar saved; no rebuild required.');await load();}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
 async function removeFestival(row:Festival){if(!window.confirm(`Delete ${row.name} festival reminder?`))return;try{await api.delete(`/festival-meals/admin/${row.id}`);await load();}catch(e){setNotice(errorMessage(e));}}
 return <section className="panel v147-admin-merch"><div className="panel-title-row"><div><p className="eyebrow">MERCHANDISE + CALENDAR</p><h2>Manage GHM Store and festival menus</h2><p>Publish, edit or remove merchandise and curated festival meal dates without rebuilding. Checkout can be enabled only after payment, tax and fulfillment integration tests. The PrintKK field must contain a design SPECIFICATION / variant code, not just the design ID.</p></div></div>{notice&&<p role="status" className="hint">{notice}</p>}
 <section className="v154-design-import"><div className="v149-section-head"><div><h3>Import from your PrintKK designs</h3><p className="small-muted">Read-only discovery. Select a design and exact variant, then review the prefilled product fields. Saving creates a GHM catalog item; it never places a PrintKK order.</p></div><button type="button" className="secondary" disabled={designLoading} onClick={()=>void loadDesigns(1)}>{designLoading?'Loading…':'Load PrintKK designs'}</button></div>
 {designs.length>0&&<><label>Choose saved design<select defaultValue="" onChange={e=>{if(e.target.value)void selectPrintKKDesign(e.target.value);}}><option value="">Select a design…</option>{designs.map(d=><option key={d.design_code} value={d.design_code}>{d.name} ({d.design_code})</option>)}</select></label><div className="v147-admin-buttons"><button type="button" className="secondary" disabled={designLoading||designPage<=1} onClick={()=>void loadDesigns(designPage-1)}>Previous</button><button type="button" className="secondary" disabled={designLoading||designs.length<15} onClick={()=>void loadDesigns(designPage+1)}>Next page</button></div></>}
 {designDetails&&<div><strong>{designDetails.name}</strong><p className="small-muted">Choose the precise color/size specification to sell:</p>{designDetails.variants.map(v=><div className="v154-design-variant" key={v.specification_code}>{v.image_url&&<img src={v.image_url} alt=""/>}<div><strong>{v.label}</strong><small>{v.specification_code}</small></div><button type="button" className="secondary" onClick={()=>useVariant(v)}>Use variant</button></div>)}</div>}</section>
 <div className="v147-admin-columns"><form onSubmit={saveProduct} className="v147-admin-form"><h3>{productId?'Edit':'Add'} merchandise</h3>
 <label>SKU<input required value={product.sku} onChange={e=>setProduct({...product,sku:e.target.value})}/></label>
 <label>Title<input required value={product.name} onChange={e=>setProduct({...product,name:e.target.value})}/></label>
 <label>Category<input value={product.category} onChange={e=>setProduct({...product,category:e.target.value})}/></label>
 <label>Description<textarea rows={3} value={product.description} onChange={e=>setProduct({...product,description:e.target.value})}/></label>
 <label>Product photo — upload from your device
  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadBusy||busy} onChange={e=>{const selected=e.target.files?.[0];void uploadProductImage(selected);e.currentTarget.value='';}}/>
 </label>
 {uploadBusy&&<small role="status">Uploading and optimizing your image…</small>}
 <small>JPG, PNG or WebP, max 5 MB. Photo is stored on GHM's persistent upload volume.</small>
 <label>Or paste a Photo URL (HTTPS)<input type="text" placeholder="https://… or /uploads/merch/…" value={product.image_url||''} onChange={e=>setProduct({...product,image_url:e.target.value})}/></label>
 {product.image_url&&<div className="v150-merch-image-preview"><img src={product.image_url} alt="Merchandise photo preview" loading="lazy"/><button type="button" className="secondary" onClick={()=>setProduct(prev=>({...prev,image_url:''}))}>Remove photo from product</button></div>}

 <label>Price in CAD<input type="number" min="0" step="0.01" value={(product.price_cents_cad/100).toFixed(2)} onChange={e=>setProduct({...product,price_cents_cad:Math.round((Number(e.target.value)||0)*100)})}/></label>
 <label>PrintKK design SPECIFICATION code (exact variant)<input value={product.printkk_design_id||''} onChange={e=>setProduct({...product,printkk_design_id:e.target.value})}/></label>
 <label>Display priority<input type="number" value={product.priority} onChange={e=>setProduct({...product,priority:Number(e.target.value)||0})}/></label>
 <label className="v147-inline-check"><input type="checkbox" checked={product.active} onChange={e=>setProduct({...product,active:e.target.checked})}/> Publicly visible</label>
 <div className="v147-admin-buttons"><button className="primary" type="submit" disabled={busy||uploadBusy}>{busy?'Saving…':'Save product'}</button>{productId&&<button type="button" className="secondary" onClick={()=>{setProduct(emptyProduct);setProductId(null);}}>Cancel edit</button>}</div>
 </form><div><h3>Catalog ({products.length})</h3>{products.map(row=><div className="v147-admin-entry" key={row.id}><div><strong>{row.name}</strong><small>{row.sku} · ${(row.price_cents_cad/100).toFixed(2)} CAD · {row.active?'Published':'Hidden'}</small></div><div><button className="secondary" onClick={()=>{setProduct({...row});setProductId(row.id);}}>Edit</button><button className="secondary" onClick={()=>void removeProduct(row)}>Delete</button></div></div>)}</div></div>
 <hr/><div className="v147-admin-columns"><form onSubmit={saveFestival} className="v147-admin-form"><h3>{festivalId?'Edit':'Add'} festival reminder</h3>
 <label>Festival name<input required value={festival.name} onChange={e=>setFestival({...festival,name:e.target.value})}/></label>
 <label>Festival date<input type="date" required value={festival.festival_date} onChange={e=>setFestival({...festival,festival_date:e.target.value})}/></label>
 <label>Community / region<input value={festival.region} onChange={e=>setFestival({...festival,region:e.target.value})}/></label>
 <label>Suggested meals (comma separated)<textarea value={festival.dishes.join(', ')} onChange={e=>setFestival({...festival,dishes:e.target.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12)})}/></label>
 <label>Remind this many days ahead<input type="number" min={1} max={30} value={festival.reminder_days} onChange={e=>setFestival({...festival,reminder_days:Number(e.target.value)||7})}/></label>
 <label className="v147-inline-check"><input type="checkbox" checked={festival.active} onChange={e=>setFestival({...festival,active:e.target.checked})}/> Active</label>
 <div className="v147-admin-buttons"><button className="primary" type="submit" disabled={busy}>Save festival</button>{festivalId&&<button type="button" className="secondary" onClick={()=>{setFestival(emptyFestival);setFestivalId(null);}}>Cancel edit</button>}</div>
 </form><div><h3>Upcoming curated dates</h3>{festivals.map(row=><div className="v147-admin-entry" key={row.id}><div><strong>{row.name}</strong><small>{row.festival_date} · {row.dishes.join(', ')}</small></div><div><button className="secondary" onClick={()=>{setFestival({...row});setFestivalId(row.id);}}>Edit</button><button className="secondary" onClick={()=>void removeFestival(row)}>Delete</button></div></div>)}<small>Moving Hindu festival dates must be checked for the relevant year and region; enter them here rather than using a guessed annual date.</small></div></div>
 </section>;
}
