# V53 Google-only store lookup

This update keeps official store item-number lookup on Google only.

## What changed

- Removed Serper/Brave/Jina recommendations from user-facing lookup messages.
- Store lookup now uses Google Custom Search JSON API first.
- A limited Google search-page fallback remains for official store links.
- Diagnostics now clearly explain missing Google API key, missing Search Engine ID, or Google 403 permission problems.

## Required backend env

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_CX=your_programmable_search_engine_id
```

## Google setup requirements

The Google Cloud project that owns the API key must have Custom Search JSON API enabled. The Programmable Search Engine ID must be able to search official store domains, for example:

- costco.ca
- walmart.ca
- nofrills.ca
- realcanadiansuperstore.ca
- loblaws.ca
- metro.ca
- foodbasics.ca
- freshco.com
- voila.ca

## Test

```bash
docker compose exec backend python -m app.scripts.test_store_lookup --store Costco --item 1953954
```
