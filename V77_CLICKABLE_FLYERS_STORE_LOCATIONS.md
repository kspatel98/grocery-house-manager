# v77 — Clickable Flyer Deals, Nearest Store Locations, and Working Filters

## What changed

### Clickable flyer items
- Every deal card in **Prices → Weekly Flyers** is now clickable.
- Matching flyer cards shown beside a shopping list are also clickable.
- Clicking opens a detail modal with:
  - advertised product and brand
  - price / raw flyer price
  - discount when supplied
  - valid-from / valid-to dates
  - flyer postal-code area
  - requested shopping-list quantity (when opened from Shopping)
  - nearest retailer location when available
  - Google Maps action
  - source-deal action when the configured flyer provider supplies a source URL

### Store location honesty
The current `scrapersdelight/flipp-flyer-digest` data is postal-code / merchant scoped and does not guarantee that a deal belongs to one exact physical branch. v77 therefore keeps these concepts separate:

- **Flyer area** = the postal code used to retrieve the flyer.
- **Nearest store location** = a separate Google Places lookup for that retailer and postal-code area.

The UI never calls the nearest branch the issuing branch.

If `GOOGLE_PLACES_API_KEY` is configured, Grocery House Manager attempts to resolve a formatted address and Google Maps URL. Location results are cached for 30 days. If Places is not configured or cannot resolve the retailer, the UI keeps the flyer area and provides a Maps search link instead of inventing an address.

### Working flyer store filters
The old static retailer chips were removed.

After a valid Canadian postal code is entered, the frontend now calls:

`GET /api/market/houses/{house_id}/flyer-merchants?postal_code=...`

This uses the flyer actor's `listMerchantsOnly` discovery mode and returns the stores actually available for that postal code. The UI sends the discovered stable merchant ID when available, which is more reliable than a hard-coded display name.

- Merchant discovery is cached using the existing 7-day merchant cache.
- Users can select up to 12 stores at a time to preserve the existing Apify cost-control policy.
- Leaving all stores unselected uses the provider's local grocery-store set.
- The manual **Refresh local stores** action refreshes the discovery cache on demand.

## Backend additions
- `FlyerMerchantOut`
- `FlyerMerchantsOut`
- `/market/houses/{house_id}/flyer-merchants`
- cached nearest-store resolution for flyer merchants
- optional flyer `source_url` normalization for providers that expose one
- store address / Maps URL returned on flyer deal rows
- store address / Maps URL returned on shopping-list flyer matches

## Environment
No new required secret was added.

Existing optional setting used for exact nearby addresses:

```env
GOOGLE_PLACES_API_KEY=your-google-places-key
```

Without it, flyer pricing still works normally; only exact nearest-address resolution is unavailable.
