"""Public server-rendered content hub and authenticated editor.

Public pages are HTML from the first response, without waiting for React. User
Markdown is HTML-escaped before any formatting. Drafts are never public.
"""
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import escape as xml_escape
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.admin import require_admin
from app.db.session import get_db
from app.models import GuideArticle, User

SITE='https://grocery-house-manager.com'
router=APIRouter(tags=['Public guides'])
api_router=APIRouter(prefix='/guides-admin',tags=['Admin guides'])


def seed_guides(db: Session):
    """Idempotent initial data, never overwrites admin changes or deleted content."""
    if db.scalar(select(GuideArticle.id).limit(1)) is not None:
        return
    seeds=json.loads(Path(__file__).with_name('guide_seeds.json').read_text(encoding='utf-8'))
    for row in seeds:
        db.add(GuideArticle(**row))
    db.commit()


def clean_link(value: str) -> str:
    value=value.strip()
    if (value.startswith('/') and not value.startswith('//')) or value.startswith('https://'):
        return value
    return '#'


def inline_md(value: str) -> str:
    # Escape first: never render raw user HTML or script markup.
    value=html.escape(value)
    value=re.sub(r'\[([^\]\n]{1,150})\]\(([^\)\s]{1,400})\)',lambda m:f'<a href="{html.escape(clean_link(html.unescape(m.group(2))),quote=True)}">{m.group(1)}</a>',value)
    value=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',value)
    value=re.sub(r'\*(.+?)\*',r'<em>\1</em>',value)
    return value


def render_markdown(value: str) -> str:
    blocks=[]
    paragraph=[]
    listing=[]
    def flush_paragraph():
        if paragraph:
            blocks.append('<p>'+ ' '.join(map(inline_md,paragraph)) +'</p>')
            paragraph.clear()
    def flush_list():
        if listing:
            blocks.append('<ul>'+''.join('<li>'+inline_md(item)+'</li>' for item in listing)+'</ul>')
            listing.clear()
    for raw in value.splitlines():
        line=raw.strip()
        if not line:
            flush_paragraph();flush_list();continue
        if line.startswith('## '):
            flush_paragraph();flush_list();blocks.append('<h2>'+inline_md(line[3:])+'</h2>')
        elif line.startswith('### '):
            flush_paragraph();flush_list();blocks.append('<h3>'+inline_md(line[4:])+'</h3>')
        elif line.startswith('- '):
            flush_paragraph();listing.append(line[2:])
        else:
            flush_list();paragraph.append(line)
    flush_paragraph();flush_list()
    return '\n'.join(blocks)


def visible_image(img: str | None) -> str | None:
    if not img:return None
    candidate=img.strip()
    if candidate.startswith('/uploads/') or candidate.startswith('/brand/') or (candidate.startswith('https://') and urlparse(candidate).hostname):
        return candidate
    return None


def doc_html(title: str, description: str, canonical_path: str, content: str, *, schema:dict|None=None, noindex:bool=False, social_image:str|None=None) -> str:
    title=html.escape(title[:180]); description=html.escape(description[:320]);canonical=SITE+canonical_path
    logo=SITE+'/brand/grocery-house-manager-logo.png'
    image=visible_image(social_image)
    image=(SITE+image) if image and image.startswith('/') else image or logo
    script=f'<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace("<","\\u003c")}</script>' if schema else ''
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} | Grocery House Manager</title><meta name="description" content="{description}">
<link rel="canonical" href="{html.escape(canonical,quote=True)}"><meta name="robots" content="{'noindex,nofollow' if noindex else 'index,follow,max-image-preview:large'}">
<meta property="og:site_name" content="Grocery House Manager"><meta property="og:type" content="article"><meta property="og:title" content="{title}">
<meta property="og:description" content="{description}"><meta property="og:url" content="{html.escape(canonical,quote=True)}">
<meta property="og:image" content="{html.escape(image,quote=True)}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png">{script}
<style>
:root{{color-scheme:light dark}}*{{box-sizing:border-box}}body{{margin:0;font:16px/1.75 system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f5ee;color:#17362b}}a{{color:#176b4e;text-underline-offset:3px}}nav{{background:#143e31;color:#fff;box-shadow:0 2px 20px #0001}}nav .wrap{{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:12px 22px}}nav a{{color:#fff;text-decoration:none;font-weight:600}}nav img{{width:38px;height:38px;object-fit:contain;background:#fff;border-radius:9px}}.brand{{display:flex;align-items:center;gap:10px}}.wrap{{max-width:990px;margin:auto;padding:0 22px}}main{{padding:38px 0 70px}}h1{{font-size:clamp(2rem,5vw,3.3rem);line-height:1.16;letter-spacing:-.035em;margin:13px 0 20px}}h2{{font-size:1.42rem;line-height:1.25;margin:34px 0 12px}}h3{{font-size:1.14rem}}p,li{{max-width:75ch}}.eyebrow{{font-size:.8rem;letter-spacing:.13em;text-transform:uppercase;font-weight:750;color:#428165}}.lead{{font-size:1.16rem;color:#466052;line-height:1.65}}.prose{{background:#fff;padding:clamp(20px,4vw,44px);border:1px solid #d7e6dc;border-radius:21px;margin-top:30px}}.prose h2:first-child{{margin-top:0}}.cardgrid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:28px 0}}.card{{display:block;background:#fff;padding:23px;border-radius:16px;border:1px solid #d5e5dc;text-decoration:none;color:inherit}}.card:hover{{border-color:#76a78d}}.card strong{{font-size:1.12rem;display:block;color:#204d39;line-height:1.4}}.card p{{font-size:.92rem;color:#556b5f}}.cta{{display:inline-block;padding:13px 21px;border-radius:12px;background:#20694b;color:#fff;text-decoration:none;font-weight:700}}.prose img{{max-width:100%;height:auto;border-radius:12px}}footer{{border-top:1px solid #d3e0d8;background:#eaf2eb;padding:30px 0;font-size:.85rem}}footer a{{margin-right:18px}}@media(prefers-color-scheme:dark){{body{{background:#101916;color:#e5f1e9}}.lead{{color:#b5ccbe}}.prose,.card{{background:#1b2922;border-color:#3e5848;color:#e5f1e9}}.card strong{{color:#e5f1e9}}.card p{{color:#b7c8bc}}footer{{background:#17251d;border-color:#344e3c}}a{{color:#9addb9}}nav a,.cta{{color:#fff}}}}</style></head><body>
<nav><div class="wrap"><a class="brand" href="/"><img src="/brand/grocery-house-manager-icon.png" alt=""><span>Grocery House Manager</span></a><a href="/guides">GHM Guides</a><a href="/login">Open GHM</a></div></nav>
<main class="wrap">{content}</main>
<footer><div class="wrap">Grocery House Manager · SupremDas Group <p><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/support">Support</a><a href="/guides">All guides</a></p>Practical household organization, without invented savings or guaranteed AI results.</div></footer></body></html>'''


def card(article:GuideArticle):
    return f'<a class="card" href="/guides/{html.escape(article.slug,quote=True)}"><span class="eyebrow">{html.escape(article.category)}</span><strong>{html.escape(article.title)}</strong><p>{html.escape(article.description)}</p>Read guide →</a>'


@router.get('/guides',response_class=HTMLResponse)
@router.get('/guides/',response_class=HTMLResponse,include_in_schema=False)
def index(db:Session=Depends(get_db)):
    posts=db.scalars(select(GuideArticle).where(GuideArticle.published.is_(True)).order_by(GuideArticle.updated_at.desc())).all()
    layout='<span class="eyebrow">Free household resources</span><h1>GHM Guides: Shop smarter and run a calmer home</h1><p class="lead">Practical ideas for groceries, shared expenses, pantry tracking and planning meals around what is already in your kitchen.</p>'
    layout+='<section class="cardgrid" aria-label="Guides">'+''.join(card(a) for a in posts)+'</section>'
    layout+='<p>New to GHM? Explore <a href="/how-it-works">how it works</a> or <a href="/pricing">compare plans</a>.</p>'
    schema={'@context':'https://schema.org','@type':'CollectionPage','name':'GHM Guides','url':SITE+'/guides'}
    return HTMLResponse(doc_html('GHM Guides – Grocery Lists, Household Budgets and Meal Planning','Practical guides for digital grocery lists, pantry tracking, meal planning, shared household expenses and receipt management.','/guides',layout,schema=schema),headers={'Cache-Control':'public,max-age=120'})


@router.get('/guides/{slug}',response_class=HTMLResponse)
def detail(slug:str,db:Session=Depends(get_db)):
    article=db.scalar(select(GuideArticle).where(GuideArticle.slug==slug,GuideArticle.published.is_(True)))
    if not article:raise HTTPException(status_code=404,detail='This guide is not published.')
    date=article.updated_at
    if date.tzinfo is None:date=date.replace(tzinfo=timezone.utc)
    layout=f'<a href="/guides">← All guides</a><p class="eyebrow">{html.escape(article.category)}</p><h1>{html.escape(article.title)}</h1><p class="lead">{html.escape(article.description)}</p>'
    img=visible_image(article.image_url)
    if img:layout+=f'<img src="{html.escape(img,quote=True)}" alt="Illustration for {html.escape(article.title,quote=True)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:18px" loading="lazy">'
    layout+=f'<article class="prose">{render_markdown(article.body_markdown)}</article>'
    layout+='<section style="margin-top:35px"><h2>Try these ideas with GHM</h2><p>Keep inventory, shopping and household costs connected. Review AI-assisted results before saving changes.</p><a class="cta" href="/how-it-works">Explore GHM features</a></section>'
    schema={'@context':'https://schema.org','@type':'Article','headline':article.title,'description':article.description,'datePublished':article.created_at.isoformat(),'dateModified':date.isoformat(),'author':{'@type':'Organization','name':'Grocery House Manager'},'publisher':{'@type':'Organization','name':'SupremDas Group'},'mainEntityOfPage':SITE+'/guides/'+article.slug}
    return HTMLResponse(doc_html(article.title,article.description,'/guides/'+article.slug,layout,schema=schema,social_image=img),headers={'Cache-Control':'public,max-age=120'})


@router.get('/guides-sitemap.xml',include_in_schema=False)
def sitemap(db:Session=Depends(get_db)):
    posts=db.scalars(select(GuideArticle).where(GuideArticle.published.is_(True))).all()
    result=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">','<url><loc>'+SITE+'/guides</loc></url>']
    for article in posts:
        updated=article.updated_at.date().isoformat()
        result.append('<url><loc>'+xml_escape(SITE+'/guides/'+article.slug)+'</loc><lastmod>'+updated+'</lastmod></url>')
    result.append('</urlset>')
    return Response('\n'.join(result),media_type='application/xml',headers={'Cache-Control':'public,max-age=300'})


class ArticleInput(BaseModel):
    slug:str=Field(min_length=3,max_length=130)
    title:str=Field(min_length=10,max_length=180)
    description:str=Field(min_length=30,max_length=320)
    category:str=Field(default='Household guides',max_length=80)
    body_markdown:str=Field(min_length=100,max_length=40000)
    image_url:str|None=None
    published:bool=False

    @field_validator('slug')
    @classmethod
    def validate_slug(cls,value):
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',value):
            raise ValueError('Use lowercase letters, numbers and hyphens.')
        return value

    @field_validator('image_url')
    @classmethod
    def validate_image(cls,value):
        if value and not visible_image(value):
            raise ValueError('Use an HTTPS URL or a GHM /uploads/ image path.')
        return value


def serialize(article):
    return {key:getattr(article,key) for key in ['id','slug','title','description','category','body_markdown','image_url','published','created_at','updated_at']}


@api_router.get('/articles')
def list_articles(db:Session=Depends(get_db),user:User=Depends(require_admin)):
    return [serialize(post) for post in db.scalars(select(GuideArticle).order_by(GuideArticle.updated_at.desc())).all()]


@api_router.post('/articles',status_code=201)
def create_article(body:ArticleInput,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    if db.scalar(select(GuideArticle.id).where(GuideArticle.slug==body.slug)):
        raise HTTPException(409,'This URL slug already exists.')
    article=GuideArticle(**body.model_dump())
    db.add(article);db.commit();db.refresh(article)
    return serialize(article)


@api_router.put('/articles/{article_id}')
def update_article(article_id:int,body:ArticleInput,db:Session=Depends(get_db),user:User=Depends(require_admin)):
    article=db.get(GuideArticle,article_id)
    if not article:raise HTTPException(404,'Article not found')
    existing=db.scalar(select(GuideArticle.id).where(GuideArticle.slug==body.slug,GuideArticle.id!=article_id))
    if existing:raise HTTPException(409,'This URL slug already exists.')
    for key,value in body.model_dump().items():setattr(article,key,value)
    article.updated_at=datetime.now(timezone.utc)
    db.commit();db.refresh(article)
    return serialize(article)


@api_router.post('/preview')
def preview(body:ArticleInput,user:User=Depends(require_admin)):
    layout=f'<p class="eyebrow">{html.escape(body.category)} — preview</p><h1>{html.escape(body.title)}</h1><p class="lead">{html.escape(body.description)}</p><article class="prose">{render_markdown(body.body_markdown)}</article>'
    return {'html':doc_html(body.title,body.description,'/guides/'+body.slug,layout,noindex=True)}

@api_router.post('/upload-image')
async def upload_guide_image(file: 'UploadFile' = File(...), user:User=Depends(require_admin)):
    """Store a validated article cover in the persistent upload volume."""
    import io
    import secrets
    from PIL import Image, UnidentifiedImageError
    from app.core.config import settings
    if file.content_type not in {'image/jpeg','image/png','image/webp'}:
        raise HTTPException(415,'Use JPG, PNG or WebP images.')
    content=await file.read(5*1024*1024+1)
    if len(content)>5*1024*1024:
        raise HTTPException(413,'Image must be 5 MB or smaller.')
    try:
        Image.MAX_IMAGE_PIXELS=20_000_000
        with Image.open(io.BytesIO(content)) as img:
            img.verify()
        with Image.open(io.BytesIO(content)) as img:
            img.thumbnail((1600,1200))
            out=io.BytesIO()
            img.convert('RGB').save(out,'WEBP',quality=85,method=4)
    except (UnidentifiedImageError,ValueError,OSError,Image.DecompressionBombError):
        raise HTTPException(400,'This image could not be decoded safely.')
    storage=Path(settings.upload_dir)/'guides'
    storage.mkdir(parents=True,exist_ok=True)
    name=f'{secrets.token_hex(18)}.webp'
    (storage/name).write_bytes(out.getvalue())
    return {'url':'/uploads/guides/'+name}
