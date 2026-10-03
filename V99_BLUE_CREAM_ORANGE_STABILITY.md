# Grocery House Manager V99 — Blue, Cream & Orange + Stability

V99 is a deliberate visual reset and interaction-reliability release. It does not add another permanent feature area. It replaces the accumulated green theme with a coordinated blue/cream/orange system, fixes the shared overlay behavior that made **Tell GHM** and **Prepare my order** appear unresponsive, and makes production database compatibility work less capable of blocking login.

## 1. Brand palette reset

### Light mode
- Warm cream page canvas and raised surfaces.
- Ocean/navy blue for primary actions, navigation and structure.
- Orange for premium/attention/food accents.
- Deep navy typography instead of green/black mixtures.
- Warm cream rather than stark white wherever a softer surface improves hierarchy.

### Dark mode
Dark mode is designed independently instead of inheriting light-mode values:
- Deep ink/navy page background.
- Layered blue elevation for cards and sheets.
- Cream-white primary text.
- High-contrast cool gray-blue supporting text.
- Orange used selectively for premium/attention states.
- Dedicated dark borders, focus rings, inputs, navigation and overlays.

Representative tokens:

```text
Light canvas       #F7F0E5
Light surface      #FFFDF9
Primary blue       #1F66A8
Deep navy          #10375F
Accent orange      #F28B2B

Dark canvas        #071321
Dark surface       #0F2237
Dark raised        #172F49
Primary light blue #7FB8E7
Dark accent orange #FF983F
Primary dark text  #FFF8EE
```

Static contrast checks for core pairs are intentionally strong:
- light body text / light canvas: ~10.7:1
- light muted text / light surface: ~4.75:1
- dark body text / dark canvas: ~16:1
- dark muted text / dark surface: ~9:1
- orange / dark canvas: ~8.7:1
- blue primary / dark canvas: ~8.8:1

The legacy CSS files were also migrated away from green brand literals, rather than relying only on one final override file. This prevents isolated historical screens from reverting to the previous palette.

## 2. Theme attributes now stay synchronized

Historical GHM screens used both:

```html
data-theme="dark"
```

and:

```html
data-ghm-theme="dark"
```

V99 sets both attributes from the same theme state. This removes a major source of mixed light/dark islands.

The browser/PWA theme colors are also updated to the new cream/navy family.

## 3. Tell GHM — root cause fixed

V98 mounted Tell GHM through the shared `OverlayPortal`, but the project did not contain the required base `.overlay-backdrop` positioning layer. The dialog could therefore be inserted into `document.body` without becoming a reliable fixed full-screen sheet, making the button appear to do nothing on some screens.

V99 adds the real shared overlay foundation:
- fixed viewport positioning
- correct high z-index
- safe-area padding
- scroll containment
- dark/light backdrop treatment
- mobile bottom-sheet behavior
- click-outside close
- Escape-compatible close controls

Tell GHM also gains deterministic routing for common requests so it remains useful even when the DigitalOcean Household Agent is not configured or temporarily unavailable.

Examples routed without requiring the AI agent:
- restaurants / takeout / Swaminarayan / Jain -> Food Tonight
- grocery store / supermarket -> Food Tonight grocery suggestions
- receipt -> Receipt Scan
- fridge / pantry / kitchen -> Kitchen Vision
- low/out-of-stock / add-to-list -> Shopping
- guests / meal plan / busy week -> Plan
- expenses / reimbursements -> Expenses
- inventory / what is at home -> Home
- price / flyer / deals -> Market

For requests that do need the Household Agent, failure now leaves a useful fallback action instead of a dead modal.

## 4. Prepare my order — now always produces a visible result

The restaurant order-preparation flow still prefers live Place Details + official restaurant/menu evidence. If the richer Place Details request fails after the shortlist was already displayed, V99 no longer leaves the action looking dead.

It now falls back to the shortlist's safe place context and creates conservative ordering guidance while explicitly stating that ingredient details are not verified.

For Swaminarayan mode the fallback wording remains strict:

> I follow a Swaminarayan diet. I cannot have onion or garlic, including in sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings or garnishes. Can this dish be prepared without onion and garlic, and can you please confirm those ingredients are not already in the base sauce?

The online-order checklist also reminds the user to select no-onion/no-garlic options when present and to call the restaurant if a base sauce or gravy cannot be confirmed.

GHM never treats vegetarian as proof of Swaminarayan compliance.

## 5. Login and production-data resilience

V98 introduced live/ready health endpoints and database reconnect behavior. V99 addresses a second weakness in the legacy compatibility schema helper.

Previously, many historical additive schema statements ran inside one all-or-nothing transaction. One optional legacy migration error could poison that transaction and keep the entire backend marked not ready, even when PostgreSQL itself was reachable and the login/account tables were usable.

V99 now:
- verifies PostgreSQL connectivity independently with `SELECT 1`
- isolates each legacy compatibility statement behind a savepoint
- logs/skips one incompatible optional statement instead of aborting all later statements
- allows the API to become ready after a successful database connection and best-effort compatibility pass
- reports a schema-warning count from `/health/ready`
- keeps failed schema statements visible in backend logs for cleanup

This is a recovery improvement, not a substitute for proper migrations. Moving GHM to versioned Alembic migrations remains the recommended next infrastructure step before larger-scale production growth.

## 6. Logged in but data did not load

Account bootstrap failures are no longer silently swallowed.

If authentication succeeds but the household bootstrap request fails, the signed-in shell shows a visible recovery banner with:
- a plain-language explanation
- the actual API error message
- **Retry household data**

This separates a household-data refresh problem from a login problem and avoids showing apparently empty screens with no explanation.

## 7. Service worker / stale deployment protection

The shell cache version is bumped to V99 and registration requests an update check. This reduces the chance that an installed PWA continues to display an older theme or older JavaScript after deployment.

## 8. Service requirements

V99 introduces no new paid service dependency.

### Google Places API (New)
Needed only for live Food Tonight restaurant/food-store discovery. Keep `GOOGLE_PLACES_API_KEY` configured with Places API (New) and billing enabled. If it is absent, Food Tonight remains hidden rather than breaking the main app.

### DigitalOcean AI / Household Agent
No plan change is required. Deterministic Tell GHM routing works without the agent. Free-form Household Agent answers require the existing agent configuration and access key.

### DigitalOcean Managed PostgreSQL
Do not upgrade the database plan merely because of the earlier 502/login symptoms. V99 fixes application startup/migration behavior that could create those symptoms. Scale PostgreSQL only when DigitalOcean metrics show actual CPU, memory, connection, storage or sustained latency pressure.

### Instacart / Uber Eats / DoorDash
Not required. V99 remains suggestion/preparation-first rather than turning GHM into another checkout marketplace.

### Tabscanner, Apify, Stripe, Resend, TheMealDB, Open Food Facts
No V99-specific plan upgrade is required.

## 9. Deployment

Back up the production PostgreSQL database first.

Keep the real production `backend/.env`. Do **not** overwrite it with `.env.example`.

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

Then verify:

```bash
curl -i https://grocery-house-manager.com/api/health/live
curl -i https://grocery-house-manager.com/api/health/ready
```

Expected normal state:

```text
/health/live  -> 200
/health/ready -> 200
```

A non-zero `schema_warnings` count means the database is connected and GHM is running, but one or more historical compatibility statements should be reviewed in backend logs.

## 10. Validation performed for this package

- Python backend compilation
- focused backend regression suite: 5/5
- SQLAlchemy model graph/in-memory schema: 31 tables
- 60 TS/TSX application source files syntax/transpile checked with zero diagnostics
- V97/V98/V99 CSS structural validation
- core light/dark token contrast checks
- legacy green-brand literal audit/migration across CSS
- final ZIP integrity test

A complete `npm ci && npm run build` could not be reproduced in the artifact environment because package installation timed out. A partial `node_modules` was removed before packaging. GitHub Actions / the deployment Docker build remains the authoritative full frontend build gate.
