# GHM V132 — Ask GHM + Automatic Trip Check production pass

## Ask GHM

- Ask GHM is now a true full-page conversation surface beneath the normal GHM app header.
- Removed the large nested chat-card feeling.
- User questions align right; GHM answers align left with the GHM identity.
- Empty state starts as a real GHM greeting with quick prompts rather than a dashboard landing card.
- The composer is a dedicated bottom grid row, not an overlay/sticky element inside the transcript.
- Composer remains flush to the bottom on desktop and directly above mobile bottom navigation.
- Chat scrolling cannot put text underneath the composer.
- Programmatic focus no longer calls `scrollIntoView()` on the composer, preventing the input from jumping upward.
- Conversation autoscroll targets only the chat scroller.
- A submitted question appears immediately while GHM is working.
- Existing context picker, microphone, background-task return, follow-up memory, result focusing and New Conversation confirmation remain intact.

## Automatic Trip Check — correctness

- Recipe/shopping quantities are normalized again on the backend before list insertion (for example 250 g -> 0.25 kg).
- Implausible list quantities stop Trip Check before any paid provider call.
- Live retailer package prices are no longer multiplied blindly by grams/kg/ml/L.
- Explicit unit prices such as `$1.69/kg` are converted to the shopping-list unit.
- Package sizes are used to calculate the number of packages actually required.
- Unsafe unit/package relationships are skipped instead of guessed.
- Live result identity validates `matched_product_name`; the provider's echoed search query is no longer treated as proof of a correct product match.
- Implausibly high whole-basket/store totals are excluded from recommendations and surfaced for review.

## Automatic Trip Check — Apify cost control

- Live-price cache is now sharded by **product + regional location + retailer filter**, not by the entire basket.
- Canadian postal codes share paid price results at the FSA (first 3 characters) level while the provider call still receives the full postal code.
- A valid cached result is never repurchased merely because:
  - another household asks for it,
  - the basket contains a different combination of products,
  - the user taps Refresh,
  - or another request uses a different full postal code in the same FSA.
- Missing/expired products are batched into one provider run, up to 15 products.
- Successful no-match results are cached for a shorter period to avoid repeatedly paying for the same failed lookup.
- PostgreSQL advisory locks prevent concurrent backend workers from purchasing the same product/FSA lookup at the same time.
- Automatic Trip Check limits flyer retrieval to 5 preferred/relevant merchants instead of 12.
- Flyer cache is shared at the FSA level and uses a DB-wide advisory lock to prevent concurrent duplicate runs.
- Force refresh means “refresh stale/missing”; it does not invalidate paid data that is still valid.
- Provider credential/billing details are no longer shown to normal users.

## Automatic Trip Check — UI

- Store details stay collapsed after an automatic check; the user sees the recommendation summary first.
- Shared-cache reuse is shown with a small `Shared live-price cache reused` indicator.
- Quantity problems display a review state instead of an absurd trip total.
- Price sanity failures display a blocked/review state instead of a false cheapest-store recommendation.
- Flagged price details remain reviewable without triggering another provider lookup.

## Configuration

- `MARKET_MAX_COMPARE_ITEMS` default: 15.
- `APIFY_PRICE_CACHE_HOURS` remains the normal successful-result TTL (default 24 hours).
- `APIFY_PRICE_NEGATIVE_CACHE_HOURS` default: 6 hours.
- Automatic flyer check uses at most 5 merchants; the dedicated flyer feature can retain its broader configured limit.

## Database

No schema migration is required. The shared cache uses the existing `external_price_cache` table.
