# V47 Market + Product Lookup Polish

## What changed

- Canadian price comparison is now postal-code-first.
  - The Prices page shows a Postal code field instead of a generic location field.
  - If postal code is blank, the browser asks for current location.
  - If location is allowed and Google Maps key is configured, the backend tries to resolve a postal code from coordinates.
  - If location is denied, the backend uses the user's saved profile city/country as a fallback label and still shows saved household prices when live rows are unavailable.

- Prices page now clearly shows live price connection status.
  - Connected when `APIFY_API_TOKEN` is configured.
  - Not connected when the token is missing.
  - Failure reason is returned safely without exposing secrets.

- Canadian live price results now include extra fields when the provider returns them:
  - store address
  - store URL
  - confidence explanation
  - source badge

- If live comparison fails or returns no rows, the response now falls back to saved household prices from receipt/inventory history.

- Product lookup now supports an optional Store name field.
  - Blank store = universal Open Food Facts lookup.
  - Walmart/Walmart Canada = best-effort Walmart Canada lookup by item number, product number, or product name.
  - Other stores show a clear message that store-specific lookup is not connected yet.

- Product lookup results now include an Add to inventory action.
  - Smart category/section is selected by product name.
  - User can later edit category, quantity, unit, price, expiry, and details.

- Header sticky fix.
  - The glass header is now `position: sticky` with high z-index and mobile horizontal navigation.

## Backend checks

- `python3 -m compileall -q backend/app` passed.

## Frontend build note

- Full frontend build could not be completed in this sandbox because npm dependency installation could not reliably download packages from the registry.
- `package-lock.json` uses the public npm registry entries, so Docker deployment should install normally on a real server.
