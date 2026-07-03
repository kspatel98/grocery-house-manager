# Architecture

## Main entities

- User: email/password or Google-authenticated account.
- House: shared household workspace.
- HouseMember: user-house relationship and role.
- Invite: temporary token that creates a join link.
- Section: editable grocery inventory category.
- Product: inventory item with quantity and helpful metadata.
- ShoppingList: active or completed grocery trip.
- ShoppingListItem: product selected for a trip, with requested quantity, bought quantity, message, and cart status.

## Inventory update rule

When the user clicks **Shopping done**, the backend confirms the request and only adds quantities from items marked `in_cart`.

Example:

- Inventory has `Milk bags = 3`
- Shopping list requested `Milk bags = 3`
- User changes bought quantity to `5`
- User checks Milk into cart
- User clicks Shopping done
- Inventory becomes `Milk bags = 8`

## Why PostgreSQL

The data is relational: users join houses, houses contain sections/products, and shopping list items reference existing products. PostgreSQL makes membership checks, sorting, filtering, and inventory updates straightforward.


## v13 branding and production notes

- SupremDas Group is the parent company/brand.
- Grocery House Manager is the product/app name.
- Frontend public assets include logo, favicon, web manifest, and Stripe product image.
- The production frontend container builds the optimized Vite bundle at startup using environment variables from `frontend/.env`, then serves with `vite preview`.
- Basic Home public price is $1.99 CAD/month; discounts should be handled by Stripe coupons/promotion codes rather than hardcoded launch pricing.
