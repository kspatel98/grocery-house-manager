import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';

type Guide = {id:number;slug:string;title:string;description:string;category:string;body_markdown:string;image_url:string|null;published:boolean;updated_at:string};
type Draft = Omit<Guide,'id'|'updated_at'>;
const empty:Draft={slug:'',title:'',description:'',category:'Household guides',body_markdown:'',image_url:null,published:false};

export default function AdminGuidesPanel(){
  const [articles,setArticles]=useState<Guide[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [draft,setDraft]=useState<Draft>({...empty});
  const [previewHtml,setPreviewHtml]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [open,setOpen]=useState(false);
  const load=async()=>{const response=await api.get<Guide[]>('/guides-admin/articles');setArticles(response.data)};
  useEffect(()=>{load().catch(()=>setMessage('Could not load guide articles.'));},[]);
  const change=<K extends keyof Draft>(key:K,value:Draft[K])=>{setDraft(prev=>({...prev,[key]:value}));setMessage('');setPreviewHtml('');};
  const choose=(post?:Guide)=>{setSelected(post?.id??null);setDraft(post?{slug:post.slug,title:post.title,description:post.description,category:post.category,body_markdown:post.body_markdown,image_url:post.image_url,published:post.published}:{...empty});setPreviewHtml('');setMessage('');setOpen(true)};
  const uploadImage=async(file:File)=>{
    setBusy(true);setMessage('');
    try{
      const form=new FormData();form.append('file',file);
      const response=await api.post<{url:string}>('/guides-admin/upload-image',form,{headers:{'Content-Type':'multipart/form-data'}});
      change('image_url',response.data.url);
      setMessage('Image uploaded. Save the article to use it.');
    }catch(error){setMessage(errorMessage(error))}finally{setBusy(false)}
  };
  const save=async()=>{
    setBusy(true);setMessage('');
    try{
      if(selected)await api.put(`/guides-admin/articles/${selected}`,draft);
      else await api.post('/guides-admin/articles',draft);
      await load();setMessage(draft.published?'Article published. Check it on the Guides page.':'Draft saved; only admins can access it.');
    }catch(error){setMessage(errorMessage(error));}finally{setBusy(false)}
  };
  const preview=async()=>{
    setBusy(true);setMessage('');
    try{const response=await api.post<{html:string}>('/guides-admin/preview',draft);setPreviewHtml(response.data.html)}
    catch(error){setMessage(errorMessage(error))}finally{setBusy(false)}
  };
  return <section className="ghm-guides-admin-v143" aria-label="GHM Guides publishing">
    <div className="ghm-guides-heading-v143"><div><h2>GHM Guides · SEO content</h2><p>Publish helpful public articles with unique page titles, descriptions and indexable HTML. Published updates appear without GitHub deployments.</p></div><button className="primary" type="button" onClick={()=>choose()}>+ New guide</button></div>
    <div className="ghm-guides-rows-v143">{articles.map(post=><button key={post.id} type="button" onClick={()=>choose(post)} className="ghm-guides-item-v143"><strong>{post.title}</strong><span>{post.published?'Published':'Draft'} · /guides/{post.slug}</span></button>)}</div>
    {open&&<div className="ghm-guides-editor-v143">
      <div className="ghm-guides-heading-v143"><h3>{selected?'Edit guide':'New guide'}</h3><button className="secondary" type="button" onClick={()=>setOpen(false)}>Close</button></div>
      <label>Page title<input value={draft.title} maxLength={180} onChange={e=>change('title',e.target.value)} /></label>
      <label>URL slug<input value={draft.slug} placeholder="e.g. family-grocery-list-tips" maxLength={130} onChange={e=>change('slug',e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))}/></label>
      <label>Search description<textarea rows={2} maxLength={320} value={draft.description} onChange={e=>change('description',e.target.value)}/></label>
      <label>Category<input value={draft.category} onChange={e=>change('category',e.target.value)} /></label>
      <label>Optional hero image URL<input placeholder="https://... or /uploads/..." value={draft.image_url??''} onChange={e=>change('image_url',e.target.value||null)}/></label>
      <label>Upload a cover image (JPG, PNG or WebP; max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadImage(file)}}/></label>
      <label>Article content (Markdown: ## headings, **bold**, - lists and [links](/path))<textarea rows={16} value={draft.body_markdown} onChange={e=>change('body_markdown',e.target.value)}/></label>
      <label className="ghm-guides-toggle-v143"><input type="checkbox" checked={draft.published} onChange={e=>change('published',e.target.checked)}/> Publish publicly and add to sitemap</label>
      <div className="ghm-guides-actions-v143"><button type="button" className="secondary" disabled={busy} onClick={preview}>Preview</button><button type="button" className="primary" disabled={busy} onClick={save}>{busy?'Working…':selected?'Save changes':'Create guide'}</button>{selected&&draft.published&&<a href={`/guides/${draft.slug}`} target="_blank" rel="noreferrer">View published guide ↗</a>}</div>
      {message&&<p role="status" className="ghm-guide-message-v143">{message}</p>}
      {previewHtml&&<iframe title="Guide preview" sandbox="" srcDoc={previewHtml} className="ghm-guide-preview-v143"/>}
    </div>}
  </section>
}
