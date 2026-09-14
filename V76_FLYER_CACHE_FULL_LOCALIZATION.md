# v76 — Flyer expiry cache + full-site localization

## Weekly flyer cost control

The weekly flyer cache now follows the actual validity dates returned by the flyer feed.

- A date-only `validTo` such as `2026-09-16` is treated as valid through the end of that day.
- A cached postal-code/merchant flyer payload is reused until the earliest active flyer in that payload expires.
- If the provider returns no usable expiry date, the fallback cache is 7 days (`FLYER_CACHE_HOURS=168`).
- Merchant discovery remains cached for 7 days.
- Expired or not-yet-valid flyer rows are excluded immediately from the public result set.
- Default automatic merchant coverage is capped at 12 merchants to keep a once-weekly Canadian region refresh comfortably inside a small Apify allowance in normal use.

Recommended environment values:

```env
APIFY_FLYER_ACTOR_ID=scrapersdelight/flipp-flyer-digest
FLYER_CACHE_HOURS=168
FLYER_MERCHANT_CACHE_HOURS=168
FLYER_TIMEOUT_SECONDS=120
FLYER_MAX_MERCHANTS=12
FLYER_MAX_RESULTS=1200
```

The cache is stored in the existing PostgreSQL `external_price_cache` data model. A normal user refresh does not call Apify again while the corresponding flyer cache is still valid unless `force_refresh` is deliberately used.

## Full flyer browsing

Prices now includes an expanded weekly flyer directory:

- deals are grouped by merchant and flyer id;
- each group shows its validity window and number of returned deals;
- the first group rows are concise by default;
- **Show all deals** expands the complete returned deal set for that flyer;
- search can still narrow the flyer catalog to a specific grocery item;
- bundle/multi-product advertisements remain visible as offers, but are excluded from exact whole-basket arithmetic when they are not a safe SKU match.

The default result cap is raised to 1,200 active deal rows so the app can show substantially fuller multi-store flyer coverage without making a new provider request for each search.

## Shopping-list flyer matches

Shopping suggestions now expose a matching weekly flyer card directly beside relevant grocery-list items when available. The card can include:

- requested grocery item;
- flyer store;
- advertised product and brand;
- flyer price / raw advertised price;
- discount text;
- product image when supplied by the feed;
- flyer validity dates;
- requested quantity context.

The basket comparison still only totals flyer rows when package-size matching is safe.

## Full-site language switching

The language selector remains available from the top-right of public and authenticated layouts and persists in `localStorage` under `ghm_language`.

Supported languages:

- English
- ગુજરાતી (Gujarati)
- हिन्दी (Hindi)
- Français (French)

v76 expands localization from navigation/Meals into a global application translation layer. It translates built-in UI text and common dynamic UI messages across Home, houses, inventory, shopping, meals, recipes, receipts, receipt history, prices, flyers, reports, plans, profile, support, public pages, privacy/terms/refund pages, buttons, filters, form labels, placeholders, titles, and accessibility labels.

Important data rule: user-entered or external data such as custom house names, custom notes, emails, store names, product names returned by retailers, receipt text, and custom recipe names are preserved as entered rather than being machine-altered.

### Recipes

- Built-in recipe titles remain language-aware.
- All 52 built-in ingredient names now have Gujarati, Hindi, and French labels.
- Detailed step-by-step methods receive language-specific cooking text.
- Meal categories and diet tags (Jain, Swaminarayan/no onion-no garlic, vegetarian, vegan, non-vegetarian) render in the selected language.
- Quantities and serving scaling remain numeric and unchanged by translation.

## Deployment notes

No database migration is required for the flyer-cache change because the existing external price cache is reused.

After deployment, restart the backend and rebuild/redeploy the frontend. Keep `APIFY_API_TOKEN` only in backend environment variables; never expose it in Vite/frontend variables.
