# V49 — Official store internet product lookup

## What changed

Product lookup now searches official Canadian store pages more intelligently when the user enters a store name and item number/name.

Example:

- Store: `Costco`
- Item number: `1953954`

The backend now tries:

1. The store's public search/product pages.
2. Official-store web search queries such as `site:costco.ca "1953954" Costco Canada`.
3. The official product page returned from search.
4. Structured page data, meta tags, or safe search-result fallback details.

If a product page is found, the UI shows the official product link and a clear note asking the user to confirm price/availability.

## Supported store filters

- Costco Canada
- Walmart Canada
- No Frills
- Real Canadian Superstore
- Loblaws
- Save-On-Foods
- Metro
- Food Basics
- FreshCo

## Optional production search keys

The no-key fallback uses public search pages and may be blocked by some networks/search engines. For more reliable production lookup, add one provider key:

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
BING_WEB_SEARCH_API_KEY=
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
```

Bing Web Search API or Google Programmable Search Engine makes store item-number lookup much more reliable.

## Important limitation

Some store pages do not expose current price or inventory unless the user selects a warehouse/store, signs in, or the site renders content only in browser JavaScript. In that case, the app still shows the official product link and asks the user to confirm details.
