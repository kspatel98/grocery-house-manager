"""Optional official sitemap metadata index for source-linked vegetarian discovery.

Only discovers outbound URL references and derives a title from the URL slug.
Never copies site recipe methods, ingredients, images, videos or structured recipe markup.
Not executed during app startup. Run explicitly on the server when permitted.
"""
from __future__ import annotations

import hashlib
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, unquote
from typing import Callable

from sqlalchemy.orm import Session
from app.models import LinkedRecipeSource

SOURCE_DOMAIN = "www.vegrecipesofindia.com"
SITEMAP_INDEX = "https://www.vegrecipesofindia.com/sitemap_index.xml"
MAX_SITEMAPS = 25
MAX_URLS = 4000
MAX_BYTES = 4_000_000


def official_url(url: str) -> bool:
    try:
        u = urlparse(url)
        return u.scheme == "https" and u.hostname in {SOURCE_DOMAIN, "vegrecipesofindia.com"} and not u.username and not u.password and u.port in (None, 443)
    except ValueError:
        return False


def recipe_sitemap(url: str) -> bool:
    if not official_url(url):
        return False
    leaf = urlparse(url).path.rsplit('/', 1)[-1].lower()
    return bool(re.fullmatch(r"post-sitemap(?:[0-9]+)?\.xml", leaf))


def parse_xml_locs(contents: bytes) -> tuple[str, list[str]]:
    if len(contents) > MAX_BYTES:
        raise ValueError("Sitemap exceeds size limit")
    root = ET.fromstring(contents)
    name = root.tag.rsplit('}', 1)[-1]
    if name not in {'sitemapindex', 'urlset'}:
        raise ValueError('Not a sitemap XML document')
    locs = [str(n.text or '').strip() for n in root.iter() if n.tag.rsplit('}', 1)[-1] == 'loc']
    return name, locs


def slug_title(url: str) -> str:
    part = unquote(urlparse(url).path.rstrip('/').rsplit('/', 1)[-1])
    part = re.sub(r'[^a-zA-Z0-9-]+', ' ', part)
    part = re.sub(r'-(?:how-to-make|recipe).*$', '', part, flags=re.I)
    words = re.sub(r'[-\s]+', ' ', part).strip().title()
    return words[:180]


def category_from_slug(title: str) -> tuple[str, str]:
    name = title.lower()
    if re.search(r'\b(kheer|halwa|barfi|burfi|ladoo|laddu|peda|cake|kulfi|sweet|payasam|gulab jamun|rasgulla|shrikhand)\b', name):
        return 'Desserts & Sweets', 'dessert'
    if re.search(r'\b(dosa|idli|upma|appam|pongal|uttapam|poha|paratha|thepla|puri|cheela|chilla)\b', name):
        return 'Breakfast & Breads', 'breakfast'
    if re.search(r'\b(chutney|pickle|raita|dip|sauce|salad|rasam|soup)\b', name):
        return 'Sides & Condiments', 'light'
    if re.search(r'\b(pakora|pakoda|tikki|samosa|vada|momos|snack|bhajiya|sandwich)\b', name):
        return 'Snacks & Street Food', 'light'
    return 'Vegetarian Dishes', 'proper'


def import_public_url_index(db: Session, fetch: Callable[[str], bytes], max_urls: int = MAX_URLS, delay: float = 0.0) -> dict:
    """Fetch only publisher's sitemap index and post-sitemaps; leave imported content link-only.

    Caller supplies a guarded fetcher restricted to same-domain HTTPS. No automatic repeat.
    """
    kind, indexes = parse_xml_locs(fetch(SITEMAP_INDEX))
    if kind != 'sitemapindex':
        raise ValueError('Expected a sitemap index')
    children = [url for url in indexes if recipe_sitemap(url)][:MAX_SITEMAPS]
    if not children:
        raise ValueError('No post-sitemap links found; publisher may have changed sitemap layout')
    existing_urls = {r[0].rstrip('/') for r in db.query(LinkedRecipeSource.source_url).all()}
    existing_slugs = {r[0] for r in db.query(LinkedRecipeSource.slug).all()}
    added = scanned = 0
    for child in children:
        if scanned >= max_urls:
            break
        if delay:
            time.sleep(delay)
        kind, locs = parse_xml_locs(fetch(child))
        if kind != 'urlset':
            continue
        for url in locs:
            if scanned >= max_urls:
                break
            scanned += 1
            if not official_url(url):
                continue
            norm_url = url.rstrip('/')
            path = urlparse(url).path
            if path.count('/') != 2 or path.startswith('/recipes/') or norm_url in existing_urls:
                continue
            title = slug_title(url)
            if len(title) < 3:
                continue
            slug = 'source-' + hashlib.sha256(norm_url.encode()).hexdigest()[:20]
            if slug in existing_slugs:
                continue
            cuisine, meal_kind = category_from_slug(title)
            db.add(LinkedRecipeSource(slug=slug, title=title, cuisine=cuisine, meal_kind=meal_kind,
                                      ghm_recipe_id='', source_name="Dassana's Veg Recipes", source_url=url,
                                      video_on_source=False,
                                      summary='Read the original recipe, detailed method and any available video on the author’s website.'))
            existing_urls.add(norm_url)
            existing_slugs.add(slug)
            added += 1
            if added % 300 == 0:
                db.commit()
    db.commit()
    return {'sitemaps': len(children), 'urls_checked': scanned, 'added': added, 'total_indexed': len(existing_urls)}
