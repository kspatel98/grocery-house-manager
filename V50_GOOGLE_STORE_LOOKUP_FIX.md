# v50 — Google Store Product Lookup Fix

This update makes store product lookup easier to debug and more reliable when using Google Programmable Search.

## What changed

- Store-specific lookup now returns a visible **Lookup check** on the Prices page.
- The app now clearly tells you when:
  - `GOOGLE_SEARCH_API_KEY` is present but `GOOGLE_SEARCH_CX` is missing.
  - Google search is connected.
  - Google returned zero results.
  - Results were returned but none were official store links.
- Google Custom Search now uses `siteSearch` with each official store domain instead of relying only on `site:domain` text in the query.
- Item-number searches now try more query forms:
  - exact item number
  - `item <number>`
  - `item number <number>`
  - `item #<number>`
  - `partNumber <number>`
- Official product-page results are no longer rejected just because Google's snippet does not repeat the item number.
- Google CSE image metadata is used when available.

## Required production settings

Google product lookup needs both values, not just the API key:

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_CX=your_programmable_search_engine_id
```

In Google Programmable Search, the search engine should be allowed to search the entire web, or at least include the supported store domains such as `costco.ca`, `walmart.ca`, `nofrills.ca`, `realcanadiansuperstore.ca`, `loblaws.ca`, `saveonfoods.com`, `metro.ca`, `foodbasics.ca`, `freshco.com`, and `voila.ca`.

## Example

Product lookup:

- Store name: `Costco`
- Store item number: `1953954`

Expected result should show an official Costco product link when Google returns it. The page should also show Lookup check details explaining each provider result.
