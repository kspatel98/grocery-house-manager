import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
export type FestivalMeal = {id:number;name:string;festival_date:string;region:string;dishes:string[];reminder_days:number;active:boolean};
const preferenceKey='ghm_festival_meal_reminders_enabled';
export default function FestivalMealAdvisor({houseId,onCook}:{houseId:number;onCook:(dish:string)=>void}){
 const [enabled,setEnabled]=useState(()=>localStorage.getItem(preferenceKey)==='yes');
 const [items,setItems]=useState<FestivalMeal[]>([]);
 useEffect(()=>{
   if(!enabled)return;
   let active=true;
   const load=()=>api.get<FestivalMeal[]>('/festival-meals/upcoming').then(({data})=>{if(active)setItems(data||[]);}).catch(()=>{if(active)setItems([]);});
   void load();const timer=window.setInterval(load,6*60*60*1000);
   return()=>{active=false;window.clearInterval(timer);};
 },[enabled]);
 return <section className="panel v147-festival-panel" aria-label="Festival meal planning">
   <div className="panel-title-row"><div><p className="eyebrow">SEASONAL COOKING · OPTIONAL</p><h2>Festival meal planner</h2><p>Plan traditional favorites before your weekly grocery trip. Choose a homemade recipe or explore a ready-made option.</p></div>
     <label className="v147-festival-opt"><input type="checkbox" checked={enabled} onChange={event=>{const value=event.target.checked;setEnabled(value);localStorage.setItem(preferenceKey,value?'yes':'no');window.dispatchEvent(new Event('ghm:festival-preference'));if(!value)setItems([]);}}/> Remind me about festival meals</label>
   </div>
   {!enabled?<p className="small-muted">Enable reminders to show relevant upcoming celebrations, optionally 7 days ahead. GHM does not infer your cultural or religious preferences.</p>:null}
   {enabled&&!items.length?<p className="small-muted">No configured festival is within its reminder window. GHM checks the calendar when you use the app and while it remains open.</p>:null}
   {enabled&&items.length>0?<div className="v147-festival-grid">{items.map(item=><article key={item.id}><small>{new Date(`${item.festival_date}T12:00:00`).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})} · {item.region}</small><h3>{item.name}</h3><p>Ideas for your next shopping trip:</p>
     {item.dishes.map(dish=><div className="v147-festival-dish" key={dish}><strong>{dish}</strong><div><button type="button" className="secondary" onClick={()=>onCook(dish)}>Check ingredients & cook</button><Link className="secondary center-link" to={`/houses/${houseId}/food?mode=restaurant&q=${encodeURIComponent(dish)}`}>Find ready-made ↗</Link></div></div>)}
     <small>Ready-made search shows nearby options, not confirmed menu availability. Festival dates vary by community and location; verify dates with your local calendar.</small>
   </article>)}</div>:null}
 </section>;
}
