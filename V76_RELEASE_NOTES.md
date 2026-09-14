# Grocery House Manager v76

## Highlights

- Flyer data is cached until its real flyer expiry instead of a fixed 36-hour timer.
- 7-day fallback caching when validity dates are unavailable.
- Default flyer merchant cap reduced to 12 for better Apify cost control.
- Flyer result capacity raised to 1,200 active deal rows.
- Full flyer directory grouped by store/current flyer with **Show all deals**.
- Matching flyer offers appear directly alongside relevant shopping-list items.
- Exact flyer validity filtering: expired offers are not presented as current.
- Global English / Gujarati / Hindi / French language switching across public and signed-in pages.
- Full built-in recipe ingredient localization for 52 ingredients.
- Recipe cooking steps, meal categories, and diet labels localize with the selected language.
- User-entered data and retailer/store/product names remain unchanged.

See `V76_FLYER_CACHE_FULL_LOCALIZATION.md` for configuration and behavior details.
