"""Run in backend container: python sync_recipe_source_index.py --dry-run or --limit 2000
Only imports links and slug-derived labels, not source recipe content.
"""
import argparse
import requests
from app.api.linked_recipe_index import import_public_url_index, official_url, MAX_BYTES
from app.db.session import SessionLocal


def fetch(url: str) -> bytes:
    if not official_url(url):
        raise ValueError('Untrusted URL')
    response = requests.get(url, timeout=(7, 20), allow_redirects=False,
                            headers={'User-Agent': 'GroceryHouseManager-SourceLinkDiscovery/1.0 (contact: support@grocery-house-manager.com)'}, stream=True)
    response.raise_for_status()
    if 300 <= response.status_code < 400:
        raise ValueError('Redirects not accepted for sitemap imports')
    chunks = []
    total = 0
    for chunk in response.iter_content(chunk_size=65536):
        total += len(chunk)
        if total > MAX_BYTES:
            raise ValueError('Oversized sitemap response')
        chunks.append(chunk)
    return b''.join(chunks)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=1500)
    parser.add_argument('--delay', type=float, default=1.0)
    parser.add_argument('--dry-run', action='store_true')
    options = parser.parse_args()
    if not 1 <= options.limit <= 4000:
        parser.error('--limit must be between 1 and 4000')
    if options.delay < .5:
        parser.error('--delay must be >= 0.5 seconds')
    with SessionLocal() as db:
        if options.dry_run:
            from app.api.linked_recipe_index import parse_xml_locs, SITEMAP_INDEX, recipe_sitemap
            kind, links = parse_xml_locs(fetch(SITEMAP_INDEX))
            print({'kind': kind, 'post_sitemaps': [u for u in links if recipe_sitemap(u)]})
        else:
            print(import_public_url_index(db, fetch, max_urls=options.limit, delay=options.delay))
