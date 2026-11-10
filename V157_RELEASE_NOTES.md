# GHM v157 — Community recommendations, Money navigation and Admin organization

Base: GHM v156 CI build hotfix. **This is a source package for review and staging, not a certified production release.** Preserve existing `.env` credentials, your database, and the persistent upload volume.

## Issues addressed

- **Money / Custom:** The expense editing route is now constrained to an integer expense ID, so `PUT /houses/{house_id}/expenses/settings` no longer collides with the dynamic route. A real HTTP routing regression test covers switching to `month_mode=custom`.
- **Money / months:** Expense month detail pages have older/newer buttons and horizontal swipe gesture handling. Mobile account cards scroll horizontally with snap points; a normal vertical scroll is not interpreted as a month switch.
- **Festive meals:** The reminder checkbox label uses a dedicated flex layout, preventing narrow mobile text from rendering one letter per line.
- **Inventory barcode:** Expanded backend barcode decoding across rotated/contrasted camera photos and increased the browser's server-assisted camera scan attempts. The manual barcode entry remains available. **This change has NOT been validated with a real iPhone camera and should not be claimed to fix every scanner/browser.**
- **Stale mobile UI:** Updated service-worker shell cache version to v157; confirm latest bundle is deployed and the device reloads it.

## New community features

- `/community`: Explore restaurant dish recommendations and community-discovered offers/discounts. Reach it from More, Food Tonight, and the shopping-price screen.
- Add a restaurant or retailer by name + city. The form can suggest matching Google Places results and fill in the listed address, city and Maps link. It accepts manual entry if no match is found.
- Optional **Find places near me** action requests browser location permission. Coordinates are used only for that lookup and are not stored in the community post or sent as part of its public content. The server never requests the user's precise location by default.
- Share the meal/dish or offer title, dietary labels (vegetarian, non-vegetarian, vegan, no onion/garlic for Swaminarayan, Jain, unknown), optional amount and before/after-tax label, optional offer code and expiration date, notes, and up to four photos of dishes, menus or promotions.
- Photo safety: authenticated uploads, 5 MB per-photo limit, JPG/PNG/WebP only, image-size limit, re-encode to WebP, strips image metadata and uses persistent existing `/uploads` storage. Content is not automatically verified as accurate.
- Posts are **pending Admin approval** by default. The public feed shows only approved posts. Users can view/delete their own posts and report others; three unique reports hide a post pending re-review.
- Guardrails: maximum five submitted tips/user/24 hours; 30 paid Google Places lookups/user/day (if configured). Community tips are reports from users, not GHM endorsements or verified restaurant food safety claims.

## Admin reorganization

- New segmented Admin navigation: Overview, Merchandise & Orders, Community, Users & Feedback, Billing & Growth, Content & Festivals, and System.
- Community queue allows reviewing images and details; approve, reject, hide, and filter submissions. Existing tools stay within their relevant sections.
- The Overview includes shortcuts to high-frequency tasks.

## Deployment configuration

No new required environment variables. Optional restaurant autocomplete reuses existing `GOOGLE_PLACES_API_KEY` and Places API (New) access/billing already used by GHM Food Tonight; when unavailable, users can manually enter a place. The community rate-limit counts are per signed-in user and UTC day. Daily counter logic should be moved to an atomic Redis strategy if concurrent paid-lookups become significant.

The package adds three tables through existing SQLAlchemy model creation and `backend/app/db/dev_migrations.py` safeguards:

- `community_tips`
- `community_tip_reports`
- `community_place_lookup_counters`

Back up the managed Postgres database first; **do not** run `docker compose down -v`, drop tables, or delete the existing upload volume.

### Suggested deployment after GitHub Actions succeeds

```bash
cd /var/www/grocery-house-manager
git pull origin main
docker compose up -d --build backend frontend
docker compose ps
docker compose logs --tail=120 backend
```

Preserve all deployed `.env` files, and ensure your public GHM server routes `/uploads/...` to the existing uploads mount. The community feature requires authenticated accounts and the Admin section requires the existing Admin authorization.

## Validation in this work environment

- Python sources compiled.
- 5 targeted backend regression tests passed: user submissions remain private until approval, submission limits, validation, money route & custom HTTP setting, and image sanitization.
- 93 TypeScript/TSX files parsed with 0 syntax errors using a TypeScript parser.
- Full backend suite cannot be reliably evaluated here without the actual `python-jose` and Stripe dependencies. A test harness with local substitutes reported 68 passes and 1 environment-related authentication failure; the affected merchandise test passed when isolated. GitHub Actions with real dependencies is the release gate.
- Full frontend `npm ci && npm run build` could not be completed because dependencies were unavailable in the container. TypeScript syntax parsing **is not equivalent** to a successful production build.

## Required real-device / staging QA

1. Confirm GitHub Actions type-check/build and backend tests both green before deployment.
2. Log in on iPhone Safari; test barcode from live camera and a barcode photo using real grocery packaging at different angles. Confirm checksum, manual entry fallback, and no false product matches. Confirm iOS site camera permissions and HTTPS.
3. In Money open Expense Accounts, swipe left/right, and use explicit older/newer buttons. Switch month mode to Custom; confirm saved setting and account balances remain correct.
4. Test Festival reminder checkbox at 320px and 375px viewport widths, in both light and dark modes.
5. Create a community restaurant recommendation via autocomplete and via manually entered address; decline location permission and confirm form still works.
6. Share a community offer with price before tax, four photos, code, expiry; verify that nothing goes public until Admin approval, and photos do not retain EXIF metadata.
7. Admin review Approve/Hide/Reject, user Report and Delete, login privacy and 24-hour limits. Test images from iPhone HEIC where applicable: HEIC **is not supported** by this release; convert to JPG/PNG first.
8. Verify plans, Stripe, wallet and PrintKK merchandise checkout remain unaffected.

## Not implemented in this release

- Automatically identifying the customer's precise address without permission; that would be inappropriate and unreliable. User-triggered location lookup is supported instead.
- HEIC input conversion for community photos. Only JPG, PNG, WebP are accepted.
- Push notifications for new community posts, automatic price verification of user offers, and real-world barcode camera proof.
