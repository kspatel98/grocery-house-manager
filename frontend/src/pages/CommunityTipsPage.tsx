import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';

type Kind = 'restaurant' | 'offer';
type Tip = { id:number;kind:Kind;place_name:string;city:string;address?:string|null;maps_url?:string|null;title:string;diet_tags:string[];price_amount:number|null;currency_code:string;tax_basis:string;notes:string;offer_code?:string|null;offer_expires?:string|null;images:string[];status:string;is_mine:boolean;created_at:string;attribution:string };
type Candidate = {place_id:string;name:string;address?:string|null;maps_url?:string|null;city:string};
const DIETS = [{value:'vegetarian',label:'Vegetarian'},{value:'non_vegetarian',label:'Non-vegetarian'},{value:'vegan',label:'Vegan'},{value:'swaminarayan',label:'No onion / no garlic (Swaminarayan)'},{value:'jain',label:'Jain'},{value:'unknown',label:'Not sure'}];
const initial = {place_id:'',place_name:'',city:'',address:'',maps_url:'',title:'',diet_tags:[] as string[],price_amount:'',currency_code:'CAD',tax_basis:'unknown',notes:'',offer_code:'',offer_expires:''};

export default function CommunityTipsPage(){
 const [params,setParams]=useSearchParams();
 const [kind,setKind]=useState<Kind>(params.get('type')==='offer'?'offer':'restaurant');
 const [tab,setTab]=useState<'discover'|'share'|'mine'>(params.get('share')==='1'?'share':'discover');
 const [form,setForm]=useState({...initial});
 const [tips,setTips]=useState<Tip[]>([]);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [placeLoading,setPlaceLoading]=useState(false);
 const [query,setQuery]=useState('');
 const [filterCity,setFilterCity]=useState('');
 const [myPhotos,setMyPhotos]=useState<File[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [placeError,setPlaceError]=useState('');
 const [useLocation,setUseLocation]=useState<{latitude:number;longitude:number}|null>(null);
 const [locationBusy,setLocationBusy]=useState(false);
 const [selectedPhoto,setSelectedPhoto]=useState('');
 const [more,setMore]=useState(false);
 const modify=(key:keyof typeof initial,value:any)=>setForm(previous=>({...previous,[key]:value}));
 const photos=useMemo(()=>myPhotos.map(file=>({file,url:URL.createObjectURL(file)})),[myPhotos]);
 useEffect(()=>()=>photos.forEach(p=>URL.revokeObjectURL(p.url)),[photos]);
 useEffect(()=>{api.get<{user:{city?:string|null}}>('/account/bootstrap').then(({data})=>{setForm(p=>({...p,city:p.city||data.user?.city||''}));}).catch(()=>undefined)},[]);
 useEffect(()=>{const next=params.get('type')==='offer'?'offer':'restaurant';setKind(next)},[params]);
 async function load(view=tab){
  try{const {data}=await api.get<Tip[]>('/community/tips',{params:{kind,mine:view==='mine',q:query,city:filterCity,limit:60}});setTips(data);setError('')}
  catch(err){setError(errorMessage(err))}
 }
 useEffect(()=>{if(tab==='share')return;void load(tab)},[kind,tab,filterCity,query]);
 useEffect(()=>{
  if(tab!=='share'||form.place_name.trim().length<3||form.place_id){setCandidates([]);return}
  let active=true;
  const timer=window.setTimeout(()=>{
    setPlaceLoading(true);
    api.get<Candidate[]>('/community/tips/places',{params:{q:form.place_name,city:form.city,latitude:useLocation?.latitude,longitude:useLocation?.longitude}})
       .then(({data})=>{if(active){setCandidates(data);setPlaceError('')}})
       .catch(err=>{if(active){setCandidates([]);setPlaceError(errorMessage(err))}})
       .finally(()=>{if(active)setPlaceLoading(false)});
  },850);
  return()=>{active=false;window.clearTimeout(timer)};
 },[tab,form.place_name,form.city,form.place_id,useLocation]);
 function locate(){
   if(!navigator.geolocation){setPlaceError('This browser cannot share location; enter your city instead.');return}
   setLocationBusy(true);
   navigator.geolocation.getCurrentPosition(pos=>{setUseLocation({latitude:pos.coords.latitude,longitude:pos.coords.longitude});setLocationBusy(false);setPlaceError('Nearby place suggestions are now enabled. Your coordinates are not published on your post.')},()=>{setLocationBusy(false);setPlaceError('Location not shared. Type the restaurant and city to search instead.')},{enableHighAccuracy:false,timeout:9000,maximumAge:300000});
 }
 function selectCandidate(c:Candidate){setForm(prev=>({...prev,place_id:c.place_id,place_name:c.name,city:c.city||prev.city,address:c.address||'',maps_url:c.maps_url||''}));setCandidates([])}
 async function share(event:FormEvent){
   event.preventDefault();setError('');setNotice('');
   if(!form.place_name.trim()||!form.city.trim()||!form.title.trim())return setError('Add a place, city and dish/offer title.');
   setBusy(true);
   try{
    const payload={...form,kind,price_amount:form.price_amount.trim()?Number(form.price_amount):null,offer_expires:form.offer_expires||null,place_id:form.place_id||null,maps_url:form.maps_url||null,address:form.address||null};
    const {data}=await api.post<Tip>('/community/tips',payload);
    let failed=0;
    for(const photo of myPhotos){
      const body=new FormData();body.append('file',photo);
      try{await api.post(`/community/tips/${data.id}/photos`,body,{timeout:30000})}catch{failed++}
    }
    setNotice(failed?`Submitted for review. ${failed} photo(s) could not upload; you can share another post or contact support.`:'Submitted for review. It will appear to the community after approval.');
    setForm(prev=>({...initial,city:prev.city}));setMyPhotos([]);setCandidates([]);setTab('mine');
   }catch(err){setError(errorMessage(err))}finally{setBusy(false)}
 }
 async function remove(id:number){if(!confirm('Delete your community post?'))return;try{await api.delete(`/community/tips/${id}`);void load()}catch(err){setError(errorMessage(err))}}
 async function report(id:number){const reason=prompt('What is inaccurate or inappropriate?');if(!reason)return;try{await api.post(`/community/tips/${id}/report`,{reason});setNotice('Thanks. The moderation team will review your report.')}catch(err){setError(errorMessage(err))}}
 const heading=kind==='restaurant'?'Favorite meals & places':'Offers & discounts';
 return <main className="page shell wide community-page-v157">
   <header className="community-hero-v157"><div><Link to="/more" className="breadcrumb">← More</Link><p className="eyebrow">GHM COMMUNITY · LOCAL KNOWLEDGE</p><h1>Share good finds. Help households discover more.</h1><p>Recommend a meal you enjoyed or share a genuine offer. Photos and prices are optional, and all posts are reviewed before publication.</p></div><div className="community-hero-icon-v157" aria-hidden="true">🤝</div></header>
   <nav className="community-kinds-v157" aria-label="Community categories"><button className={kind==='restaurant'?'active':''} onClick={()=>{setParams({type:'restaurant'});setTab('discover')}}>🍽️ Recommended meals</button><button className={kind==='offer'?'active':''} onClick={()=>{setParams({type:'offer'});setTab('discover')}}>🏷️ Offers & discounts</button></nav>
   <div className="community-tabs-v157" role="tablist" aria-label="Community workspace"><button className={tab==='discover'?'active':''} onClick={()=>setTab('discover')}>Explore</button><button className={tab==='share'?'active':''} onClick={()=>setTab('share')}>＋ Share a find</button><button className={tab==='mine'?'active':''} onClick={()=>setTab('mine')}>My submissions</button></div>
   {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="success" role="status">{notice}</div>}
   {tab==='share'?<form className="panel community-compose-v157" onSubmit={share}>
      <div className="community-section-title-v157"><div><p className="eyebrow">SHARE WITH THE COMMUNITY</p><h2>{kind==='restaurant'?'Recommend a dish':'Share an offer'}</h2><p>Only include information you know. You can type a place manually if suggestions aren't available.</p></div><span className="community-step-pill">1 · Place</span></div>
      <div className="community-form-grid-v157">
       <div className="community-place-picker-v157"><label>Restaurant or store name <input value={form.place_name} maxLength={180} required placeholder={kind==='restaurant'?'e.g. A favorite Indian restaurant':'e.g. Grocery store'} onChange={e=>setForm(p=>({...p,place_name:e.target.value,place_id:'',address:'',maps_url:''}))}/></label>
         {placeLoading&&<small>Finding matching places…</small>}
         {candidates.length>0&&<div className="community-place-options-v157" role="listbox" aria-label="Matching places">{candidates.map(c=><button type="button" key={c.place_id} onClick={()=>selectCandidate(c)}><strong>{c.name}</strong><small>{c.address||c.city}</small></button>)}</div>}
         {form.place_id&&<div className="community-place-confirm-v157">✓ Selected from Places results <button type="button" className="ghost" onClick={()=>setForm(p=>({...p,place_id:''}))}>Change</button></div>}
       </div>
       <label>City <input required value={form.city} maxLength={120} placeholder="City" onChange={e=>setForm(p=>({...p,city:e.target.value,place_id:''}))}/></label>
      </div>
      <div className="community-location-tools-v157"><button type="button" className="secondary" onClick={locate} disabled={locationBusy}>{locationBusy?'Checking…':'📍 Find places near me (optional)'}</button><small>{placeError||'Your precise location is only used for an optional lookup, not published.'}</small></div>
      <label>Full address <input value={form.address} maxLength={300} placeholder="Choose a suggested place or enter the address" onChange={e=>modify('address',e.target.value)}/></label>
      <div className="community-section-title-v157"><div><p className="eyebrow">YOUR FIND</p><h3>{kind==='restaurant'?'What did you enjoy?':'What is the offer?'}</h3></div><span className="community-step-pill">2 · Details</span></div>
      <label>{kind==='restaurant'?'Meal or dish name':'Offer headline'} <input required maxLength={180} value={form.title} placeholder={kind==='restaurant'?'e.g. Fafda and jalebi':'e.g. 25% off selected vegetables'} onChange={e=>modify('title',e.target.value)}/></label>
      {kind==='restaurant'?<fieldset className="community-diet-field-v157"><legend>Dietary categories <small>(only select what you know)</small></legend><div>{DIETS.map(d=><label key={d.value}><input type="checkbox" checked={form.diet_tags.includes(d.value)} onChange={e=>modify('diet_tags',e.target.checked?[...form.diet_tags,d.value]:form.diet_tags.filter(x=>x!==d.value))}/><span>{d.label}</span></label>)}</div><p className="small-muted">These labels are community reports, not verified food-safety or dietary guarantees. Confirm ingredients with the restaurant.</p></fieldset>:<div className="community-form-grid-v157"><label>Promo code (optional)<input value={form.offer_code} maxLength={80} onChange={e=>modify('offer_code',e.target.value)}/></label><label>Offer expiration (optional)<input type="date" value={form.offer_expires} onChange={e=>modify('offer_expires',e.target.value)}/></label></div>}
      <div className="community-price-grid-v157"><label>{kind==='restaurant'?'Price per item (optional)':'Advertised price (optional)'}<input inputMode="decimal" type="number" min="0" step="0.01" value={form.price_amount} placeholder="0.00" onChange={e=>modify('price_amount',e.target.value)}/></label><label>Currency <select value={form.currency_code} onChange={e=>modify('currency_code',e.target.value)}>{['CAD','USD','INR','GBP','EUR','AUD'].map(c=><option key={c}>{c}</option>)}</select></label><label>Tax basis<select value={form.tax_basis} onChange={e=>modify('tax_basis',e.target.value)}><option value="unknown">Not sure</option><option value="before">Before tax</option><option value="after">After tax</option></select></label></div>
      <label>Notes (optional)<textarea rows={3} maxLength={1600} value={form.notes} onChange={e=>modify('notes',e.target.value)} placeholder="What made it worth recommending? Any conditions or details?"/></label>
      <div className="community-upload-v157"><div><strong>Photos of the dish, menu, flyer or shelf label</strong><small>Up to 4 images · JPG, PNG or WebP · 5 MB each</small></div><label className="secondary community-file-button-v157">＋ Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{const files=Array.from(e.target.files||[]);setMyPhotos(prev=>[...prev,...files.filter(x=>x.size<=5*1024*1024&&['image/jpeg','image/png','image/webp'].includes(x.type))].slice(0,4));e.target.value=''}}/></label></div>
      {photos.length>0&&<div className="community-photo-strip-v157">{photos.map(({file,url},i)=><div key={`${file.name}-${i}`}><img src={url} alt={`Upload preview ${i+1}`}/><button type="button" onClick={()=>setMyPhotos(prev=>prev.filter((_,j)=>j!==i))} aria-label="Remove photo">×</button></div>)}</div>}
      <div className="community-submit-v157"><small>New tips are pending until Admin approves them. Never share private receipts or personal details.</small><button type="submit" className="primary" disabled={busy}>{busy?'Submitting…':'Submit for review'}</button></div>
   </form>:<>
      <div className="community-feed-head-v157"><div><p className="eyebrow">{tab==='mine'?'YOUR SUBMISSIONS':'FROM GHM HOUSEHOLDS'}</p><h2>{tab==='mine'?'What you shared':heading}</h2></div><div className="community-filters-v157"><input aria-label="Search community posts" placeholder="Search names and dishes" value={query} onChange={e=>setQuery(e.target.value)}/><input aria-label="Filter by city" placeholder="Filter city" value={filterCity} onChange={e=>setFilterCity(e.target.value)}/><button type="button" className="secondary" onClick={()=>void load()}>Refresh</button></div></div>
      {tips.length===0?<div className="panel community-empty-v157"><span>💬</span><h3>{tab==='mine'?'No submissions yet':'No approved recommendations yet'}</h3><p>Be among the first to contribute. GHM only displays moderated community submissions.</p><button className="primary" onClick={()=>setTab('share')}>Share a {kind==='restaurant'?'meal':'deal'}</button></div>:<div className="community-feed-grid-v157">{tips.slice(0,more?60:18).map(tip=><article className="panel community-tip-card-v157" key={tip.id}>
        <div className="community-tip-top-v157"><span>{tip.kind==='restaurant'?'🍽️ Favorite dish':'🏷️ Community offer'}</span><span className="community-status-v157">{tab==='mine'?tip.status:'User reported'}</span></div>
        {tip.images.length>0&&<div className="community-tip-images-v157">{tip.images.map((src,i)=><button key={`${src}-${i}`} type="button" onClick={()=>setSelectedPhoto(src)} aria-label={`Open image ${i+1}`}><img src={src} loading="lazy" alt={`Community photo ${i+1} of ${tip.title}`}/></button>)}</div>}
        <div className="community-tip-info-v157"><h3>{tip.title}</h3><strong>{tip.place_name}</strong><small>📍 {[tip.address,tip.city].filter(Boolean).join(' · ')}</small>{tip.diet_tags.length>0&&<div className="community-tags-v157">{tip.diet_tags.map(tag=><span key={tag}>{DIETS.find(d=>d.value===tag)?.label||tag}</span>)}</div>}{tip.price_amount!==null&&<p className="community-tip-price-v157">{tip.currency_code} {Number(tip.price_amount).toFixed(2)} <small>{tip.tax_basis==='unknown'?'Tax not specified':`${tip.tax_basis} tax`}</small></p>}{tip.offer_code&&<p><strong>Promo code:</strong> {tip.offer_code}</p>}{tip.offer_expires&&<p><strong>Until:</strong> {tip.offer_expires}</p>}{tip.notes&&<p>{tip.notes}</p>}</div>
        <div className="community-tip-foot-v157"><small>Shared {new Date(tip.created_at).toLocaleDateString()} · Verify prices, conditions and ingredients independently.</small><div>{tip.maps_url&&<a href={tip.maps_url} rel="noreferrer" target="_blank" className="secondary">Map</a>}{tip.is_mine?<button className="secondary" onClick={()=>void remove(tip.id)}>Delete</button>:<button className="secondary" onClick={()=>void report(tip.id)}>Report</button>}</div></div>
      </article>)}</div>}{tips.length>18&&!more&&<button type="button" className="secondary" onClick={()=>setMore(true)}>Show more</button>}
   </>}
   {selectedPhoto&&<div className="community-lightbox-v157" role="presentation" onClick={()=>setSelectedPhoto('')}><button type="button" onClick={()=>setSelectedPhoto('')} aria-label="Close photo">×</button><img src={selectedPhoto} alt="Full-size community submission"/></div>}
 </main>;
}
