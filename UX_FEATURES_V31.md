# Grocery House Manager v31 UX and plan-access update

This update focuses on making the app easier for normal household users to understand and use.

## User-facing changes

- Added a clearer colored feature-access section on the Plans page.
- Plan features now show what is included and what is locked until Free Starter, Basic Home, Family Plus, or Household Pro.
- Removed developer-facing wording from the market tools UI.
- Market page now explains tools by plan instead of mentioning backend API configuration.
- House members now appear near the top of House and Grocery List pages.
- Full member list opens in a right-side drawer that takes about 35–40% of desktop screen width and includes a close button.
- Activity feed now shows only the latest few activities by default.
- Added “See all activity” modal for full activity history.
- Profile password change now has a Clear / cancel button.
- Support and marketing copy now include updated plan and market-tool features.

## Performance changes

- Grocery-list product picker now has a search field and only renders the first 80 matching products at a time.
- Shopping-list item edits now update the visible list using the API response instead of reloading every house/product/member/activity endpoint for every small change.
- House/product images are lazy-loaded in inventory cards.
- Live-refresh websocket events are debounced to avoid repeated full reloads during bursts of activity.
- Activity API calls were reduced from large lists to compact recent lists for normal page display.

## Plan access model

- Free Starter: join invited houses and use features unlocked by the owner’s plan.
- Basic Home: create/manage houses, receipts, store-price history, product lookup, low-stock/expiry highlights.
- Family Plus: Basic features plus best-store comparison, Canadian price comparison for supported retailers, monthly household expense view.
- Household Pro: Family features plus nearby store suggestions and larger household/history limits.
