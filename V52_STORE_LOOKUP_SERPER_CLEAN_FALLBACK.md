# V52 Store lookup repair

This update fixes the product lookup flow that returned only the store search link for item numbers such as Costco item `1953954`.

## What changed

- Store lookup now tries broad human-style web searches before strict `site:` searches.
- Added optional Serper provider for reliable Google-style results when Google Custom Search JSON API returns `403`.
- Added optional Brave Search and Jina Search providers.
- Reduced long technical diagnostics shown to users.
- Improved official store product-page parsing, especially Costco pages that include item numbers in page text rather than JSON.
- If Google Custom Search returns `403`, the message clearly says that the Custom Search JSON API is blocked/not enabled and recommends Serper as the production fallback.

## Recommended env for reliable store item-number search

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
SERPER_API_KEY=your_serper_api_key_here
```

Optional backups:

```env
BING_WEB_SEARCH_API_KEY=
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
BRAVE_SEARCH_API_KEY=
JINA_API_KEY=
```

## Test

```bash
docker compose exec backend python -m app.scripts.test_store_lookup --store Costco --item 1953954
```

Expected: an official Costco product result should appear if the configured search provider returns the indexed Costco product page.
