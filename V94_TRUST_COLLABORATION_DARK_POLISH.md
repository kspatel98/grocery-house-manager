# Grocery House Manager V94 — Trust, Collaboration, Community & Dark-Mode Polish

V94 builds on V93.1 and focuses on retention, trust, shared-household utility, community reuse, food-safety correctness, and the dark-mode issues visible in the supplied screen recording.

## 1. In-app review flow with less friction

- Replaced the old success review prompt with an inline 1–5 star experience.
- Users do not have to leave their current workflow to rate the experience.
- Optional feedback field adapts to the rating:
  - 1–3 stars: asks what should be fixed.
  - 4–5 stars: asks what worked well.
- Users can update an existing review from the same prompt.
- Prompt remains dismissible and supports "Don't ask again".
- Prompt frequency is rate-limited so it does not appear repeatedly.
- Review requests now trigger after meaningful success moments including:
  - completed shopping trip,
  - reviewed/saved receipt,
  - generated household meal plan,
  - completed Kitchen Vision inventory check.
- Any honest rating receives the same small thank-you benefit: an in-app household optimization tip pack. There is no incentive tied to a higher score.

## 2. Public admin replies to reviews

- Added persistent admin reply fields to reviews.
- Admin can publish or update a professional response from the Admin dashboard.
- Public review cards show the Grocery House Manager reply below the user's review.
- Admin dashboard highlights reviews still awaiting a reply and displays the total outstanding count.
- Existing user edit/delete and admin delete behavior remains available.

## 3. Stronger household collaboration

The app already supported shared Grocery Homes, invites and shopping-list live updates. V94 extends the existing live-refresh hook to more household workflows:

- Inventory
- Meals
- Shopping
- Receipt history
- Receipt scanning workspace
- Expenses
- Main household dashboard

When house activity changes on another device, these screens can refresh through the existing WebSocket update channel instead of requiring users to navigate away and back.

## 4. Barcode automation is easier to discover

The inventory product form already supported camera barcode detection. V94 exposes it directly from the Inventory hero:

- `Scan barcode`
- `Add product`

Opening through `Scan barcode` starts the product flow with a prominent camera-scanning callout.

Receipt scanning and inventory auto-population remain part of the existing receipt workflow.

## 5. Household Templates Community

New reusable template system for organic sharing and repeat household workflows.

Users can create templates for:

- shopping frameworks,
- meal prep,
- holidays,
- household routines,
- other repeatable checklists.

Features:

- private or community-shared templates,
- title, description, type and checklist items,
- discover/search shared templates,
- edit/delete own templates,
- use count,
- one-click `Use in this house`,
- automatically reuses the current active grocery list or creates one,
- creates missing inventory products when necessary while respecting plan product limits,
- skips items already active on the shopping list,
- logs template application as house activity so collaboration refresh can propagate,
- `Copy to share` creates creator-friendly text for Instagram, TikTok, WhatsApp or other channels.

The backend uses exact case-insensitive product matching when applying a template so `%` or `_` characters in community text cannot act as SQL LIKE wildcards.

## 6. Expired-food safety hardening

Expired products are no longer treated as usable meal inventory.

- Meals page excludes `is_expired` products from ingredient availability and "can make now" calculations.
- Digital Twin skips expired products when building depletion/usable-stock predictions.
- Household Agent receives usable inventory and expired inventory in separate fields.
- Agent context explicitly states that expired items must never be recommended for eating/cooking/use.
- Expired items are review/discard items only.
- Products that are approaching expiry can still be prioritized while they are still within their valid date.
- Existing Weekly Assistant already separates `expired` from `expiring soon`; V94 preserves this safety boundary.

## 7. GHM-owned AI product naming

Cloud-provider names were removed from normal user-facing UI.

Users now see:

- GHM Vision Engine / GHM Kitchen Vision
- GHM Household Intelligence
- GHM AI Infrastructure
- Private scan storage

Provider-specific environment-variable names and backend integration code remain internal because they are required for authentication and infrastructure.

## 8. Dark mode — exact requested visual corrections

### Global workflow card treatment

Primary workflow cards now use the requested dark surface where needed:

```css
background: linear-gradient(137deg, #214727, #0e2019 58%, #10231e);
```

The screen recording was sampled during this release. Additional missed inner surfaces are now explicitly covered, including:

- house connected-workflow tiles,
- active-list utility row,
- activity rows,
- receipt library cards,
- receipt metadata tiles,
- receipt quantity/unit-price/total tiles,
- pricing feature-access cells,
- expense monthly-book cards,
- expense total/metric cells,
- expense balance formula,
- expense ledger cells,
- reimbursement cards,
- empty-state cards.

Text inside these surfaces is forced to light readable shades and locked pricing cells no longer remain faded white in dark mode.

### Exact requested selectors

- `.product-media`
  - `linear-gradient(135deg, #004d30, #004f34)`

- `.extra-scan-visual-frame`
  - background `#c0c26b`
  - animation duration `2s`
  - image fills the available frame
  - stretch/height rules added to remove the dark strip under the extra-scan notification artwork

- Premium text
  - `#ff7e1f`

- Premium crown circle
  - `#16432f`

- `.language-picker` in dark mode
  - `#12251e`

- `.footer-brand-stack` and `.footer-links` in dark mode
  - background `#0e1d17`
  - `2px solid white` border

- `.flyer-local-filter-panel`
  - background `#12211b`
  - `margin-bottom: 10px`
  - `1px solid white`
  - `transform-style: preserve-3d`
  - typo alias `.flyer-local-filer-panel` covered defensively as well

## 9. Review moderation schema additions

New review fields:

- `admin_reply`
- `admin_replied_at`
- `admin_replied_by_id`

Existing local databases receive additive migration statements through the project's development migration helper.

## 10. New template schema/API

New `household_templates` table and API router:

- `GET /templates`
- `POST /templates`
- `PUT /templates/{template_id}`
- `DELETE /templates/{template_id}`
- `POST /templates/{template_id}/apply?house_id=...`

## Validation performed

- All backend Python modules pass `py_compile`.
- SQLAlchemy mapper configuration succeeds for the full model graph.
- All 53 TypeScript/TSX source files pass syntax/transpile validation with TypeScript 5.8.3.
- `styles.css` parses with zero top-level CSS errors and balanced braces.
- Full local FastAPI import is not available in the current workspace because the host Python environment does not have `google-auth` installed. The project already declares `google-auth==2.37.0` in `backend/requirements.txt`, so the normal Docker build installs it.

## Deployment

Keep your production `backend/.env` and other secrets. Do not overwrite them with `.env.example`.

```bash
docker compose down
docker compose up -d --build
```
