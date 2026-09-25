import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import type { House, HouseholdTemplate, HouseholdTemplateApplyResponse } from '../types';

const TYPE_LABELS: Record<string,string> = { shopping:'Shopping framework', meal_prep:'Meal prep', holiday:'Holiday', household:'Household routine', other:'Other' };

export default function TemplatesPage(){
  const { houseId } = useParams();
  const id = Number(houseId);
  const [house,setHouse]=useState<House|null>(null);
  const [templates,setTemplates]=useState<HouseholdTemplate[]>([]);
  const [search,setSearch]=useState('');
  const [title,setTitle]=useState('');
  const [type,setType]=useState('shopping');
  const [description,setDescription]=useState('');
  const [itemsText,setItemsText]=useState('');
  const [shared,setShared]=useState(true);
  const [editing,setEditing]=useState<HouseholdTemplate|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  async function load(){
    try{
      const [h,t]=await Promise.all([api.get<House>(`/houses/${id}`),api.get<HouseholdTemplate[]>('/templates',{params:{search:search||undefined}})]);
      setHouse(h.data);setTemplates(t.data);setError('');
    }catch(err){setError(errorMessage(err));}
  }
  useEffect(()=>{void load();},[id]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),300);return()=>window.clearTimeout(timer);},[search]);

  const myCount=useMemo(()=>templates.filter(row=>row.can_edit).length,[templates]);

  function reset(){setEditing(null);setTitle('');setType('shopping');setDescription('');setItemsText('');setShared(true);}
  function startEdit(row:HouseholdTemplate){setEditing(row);setTitle(row.title);setType(row.template_type);setDescription(row.description||'');setItemsText(row.items.join('\n'));setShared(row.is_shared);window.scrollTo({top:0,behavior:'smooth'});}
  async function save(){
    const items=itemsText.split(/\n|,/).map(row=>row.trim()).filter(Boolean);
    if(!title.trim()||!items.length){setError('Add a template title and at least one item.');return;}
    try{setBusy(true);setError('');const payload={title:title.trim(),template_type:type,description:description.trim()||null,items,is_shared:shared};
      if(editing)await api.put(`/templates/${editing.id}`,payload);else await api.post('/templates',payload);
      setMessage(editing?'Template updated.':'Template created. You can keep it private or share it with the community.');reset();await load();
    }catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  async function apply(row:HouseholdTemplate){
    try{setBusy(true);setError('');const {data}=await api.post<HouseholdTemplateApplyResponse>(`/templates/${row.id}/apply`,null,{params:{house_id:id}});setMessage(data.message);window.dispatchEvent(new Event('account:refresh'));void api.post('/analytics/event',{event_name:'template_applied',house_id:id,event_context:'community_template'}).catch(()=>undefined);}
    catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  async function remove(row:HouseholdTemplate){if(!confirm(`Delete ${row.title}?`))return;try{await api.delete(`/templates/${row.id}`);await load();}catch(err){setError(errorMessage(err));}}
  async function shareTemplate(row:HouseholdTemplate){
    const text=`${row.title}
${row.description||'Reusable household template'}

${row.items.map(item=>`• ${item}`).join('\n')}

Created with Grocery House Manager · ${window.location.origin}`;
    try{await navigator.clipboard.writeText(text);setMessage('Template share text copied. You can post it to Instagram, TikTok, WhatsApp, or anywhere you share household ideas.');}catch{setMessage(text);}
  }

  return <main className="page shell wide template-community-page cinematic-page">
    <header className="page-hero creative-hero template-community-hero"><div><Link to={`/houses/${id}`} className="breadcrumb">← {house?.name||'Home'}</Link><p className="eyebrow">HOUSEHOLD TEMPLATES COMMUNITY</p><h1>Build it once. Reuse it every time.</h1><p>Create shopping frameworks and preparation checklists for holidays, parties, weekly routines, moving days or any repeatable household task. Share only when you want to.</p></div><div className="template-community-hero-stat"><strong>{myCount}</strong><small>your templates</small></div></header>
    <HouseContextSwitcher currentHouseId={id} currentHouseName={house?.name} section="templates" />
    {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
    <section className="template-community-layout">
      <article className="panel template-editor-card"><p className="eyebrow">{editing?'EDIT TEMPLATE':'CREATE A TEMPLATE'}</p><h2>{editing?'Update your framework':'Save a repeatable household flow'}</h2><div className="template-editor-grid"><label>Title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Example: Diwali dinner shopping" /></label><label>Type<select value={type} onChange={e=>setType(e.target.value)}><option value="shopping">Shopping framework</option><option value="meal_prep">Meal prep</option><option value="holiday">Holiday</option><option value="household">Household routine</option><option value="other">Other</option></select></label></div><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this template useful for?" /></label><label>Items / checklist<textarea className="template-items-input" value={itemsText} onChange={e=>setItemsText(e.target.value)} placeholder={'Milk\nBread\nPaper plates\nDessert ingredients'} /></label><button type="button" className={`autopilot-toggle ${shared?'on':''}`} onClick={()=>setShared(v=>!v)}><strong>{shared?'Shared with community':'Private template'}</strong><small>{shared?'Other users can discover and copy it.':'Only you can see it.'}</small></button><div className="template-editor-actions"><button className="primary" type="button" onClick={save} disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create template'}</button>{editing?<button className="secondary" type="button" onClick={reset}>Cancel</button>:null}</div></article>
      <article className="panel template-library-card"><div className="panel-title-row"><div><p className="eyebrow">DISCOVER & REUSE</p><h2>Community frameworks</h2></div><input className="template-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search templates…" /></div><div className="template-community-grid">{templates.map(row=><article className="template-community-card" key={row.id}><header><span>{TYPE_LABELS[row.template_type]||'Template'}</span>{row.is_shared?<b>Community</b>:<b>Private</b>}</header><h3>{row.title}</h3><p>{row.description||'Reusable household checklist.'}</p><div className="template-item-preview">{row.items.slice(0,8).map(item=><small key={item}>✓ {item}</small>)}{row.items.length>8?<small>+ {row.items.length-8} more</small>:null}</div><footer><span><strong>{row.uploader_name}</strong><small>{row.uses_count} uses</small></span><div><button className="primary small-button" onClick={()=>apply(row)} disabled={busy}>Use in this house</button><button className="secondary small-button" onClick={()=>shareTemplate(row)}>Copy to share</button>{row.can_edit?<><button className="secondary small-button" onClick={()=>startEdit(row)}>Edit</button><button className="secondary small-button danger-button" onClick={()=>remove(row)}>Delete</button></>:null}</div></footer></article>)}{!templates.length?<div className="autopilot-empty-insight"><span>🧺</span><strong>No matching templates yet</strong><p>Create the first reusable framework for this use case.</p></div>:null}</div></article>
    </section>
  </main>;
}
