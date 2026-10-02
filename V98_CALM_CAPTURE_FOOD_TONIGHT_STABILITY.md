# Grocery House Manager V98 — Calm Capture, Food Tonight & Stability

## Release goal
V98 applies the strongest interaction lessons from the Family Manager onboarding benchmark without turning GHM into a grid of unrelated modules. The everyday surface remains calm: **Today → Plan → Shop → Home**. Advanced systems appear contextually only when useful.

## 1. Stability-first backend and login recovery
- FastAPI no longer has to complete database initialization successfully before the HTTP process can stay alive.
- Database initialization/schema reconciliation runs with retry/backoff.
- `/health/live` checks that the API process is alive without depending on PostgreSQL.
- `/health/ready` reports whether household data is ready.
- While PostgreSQL is reconnecting, protected API requests return a clear HTTP 503 with `Retry-After` instead of letting Caddy surface an opaque 502.
- Login checks service readiness first and explains that existing household data has not been deleted.
- GET requests can retry short-lived 502/503/network failures automatically.
- A global service-status banner provides a manual Retry action.
- Docker health checks and dependency ordering were tightened.

**Important:** these changes improve graceful recovery. They do not replace database backups or remove the need to inspect backend logs if readiness remains unhealthy.

## 2. Universal Capture — “Tell GHM”
A contextual capture sheet is available from the signed-in app:
- **Say it** (Web Speech API where supported)
- **Type it**
- **Scan receipt**
- **Scan kitchen**

Obvious requests are routed deterministically:
- “find food / restaurant / takeout” → Food Tonight
- “food store / grocery store” → Food Tonight store suggestions
- “scan receipt” → Receipt Scan
- “scan fridge / pantry / kitchen” → Kitchen Vision

Other requests can be sent to existing GHM Household Intelligence. No silent inventory or purchase action is performed.

## 3. Simplified first-run capture
The onboarding step that teaches GHM about the home now lets the user choose the easiest first signal:
- Scan a receipt
- Scan part of the kitchen
- Add a few essentials

GHM does not force a long preference survey before showing value.

## 4. Contextual Food Tonight — suggestion-only
Food Tonight is intentionally **not** another permanent marketplace module. It appears only when Google Places is configured and is reachable from Plan/Today or Tell GHM.

Users can request:
- Nearby restaurants
- Nearby food/grocery stores
- Vegetarian
- Vegan
- Jain
- **Swaminarayan — no onion / no garlic**

The first discovery request uses a lean Google Places Text Search field mask to control cost. Richer place/menu analysis is requested only when the user asks to prepare an order.

### Menu and dietary safety
For Jain/Swaminarayan guidance, V98 distinguishes:
- **Verified from official menu/site evidence**
- **May be possible with modification — confirm**
- **Uncertain / avoid assuming**

Vegetarian status alone is never treated as proof that a dish contains no onion or garlic.

When official menu text is available, GHM can use the existing GHM Vision/Inference service to structure menu evidence conservatively. If evidence is unavailable, it does not invent dishes.

For Swaminarayan ordering, V98 provides a ready-to-copy script such as:

> I follow a Swaminarayan diet. I cannot have onion or garlic, including in sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings or garnishes. Can this dish be prepared without onion and garlic, and can you please confirm those ingredients are not already in the base sauce?

The guide also gives steps for online ordering and links to official/Maps sources where available.

### No checkout integration in V98
V98 does **not** add Instacart, Uber Eats or DoorDash checkout. The value here is preparation and decision support, not another marketplace. This keeps GHM focused and avoids exposing unsupported merchant/cart assumptions.

## 5. Weekly Household Brief
The Today experience gains a compact weekly brief covering:
- products at home
- use-before-expiry items
- expired items requiring review/discard
- next-trip count
- verified value/savings

It is meant to answer “what matters this week?” without opening every specialist feature.

## 6. Household routines
Plan includes quick presets:
- Normal week
- Busy week
- Guests coming
- Going away

These adjust planning inputs without creating another full settings page.

## 7. Contextual advanced features
V98 continues the progressive-disclosure product philosophy:
- Food Tonight appears as a small related action, not a top-level module.
- Kitchen Vision stays connected to Home/Universal Capture.
- deeper planning tools stay behind Plan.
- receipt and price systems surface their conclusions before their machinery.

## 8. Background-work UX principle
Long-running intelligence screens now explicitly tell users when they can continue using GHM. V98 does **not** claim that every current planning request has become a durable server-side background job; persistent job infrastructure should be added separately where required.

## Required configuration
### Existing secrets
Preserve the production `backend/.env` from the current deployment. Do not replace it with `.env.example`.

### Food Tonight
Food Tonight requires the existing `GOOGLE_PLACES_API_KEY` to have **Places API (New)** enabled and billing enabled in the Google Cloud project.

No Instacart key is required.

Optional V98 settings:
```env
FOOD_PLACES_ENABLED=true
FOOD_PLACES_RADIUS_METERS=8000
FOOD_PLACES_MAX_RESULTS=8
FOOD_PLACES_CACHE_MINUTES=30
FOOD_MENU_FETCH_TIMEOUT_SECONDS=10
```

If Google Places is not configured, Food Tonight stays hidden and the rest of GHM works normally.

## Deployment safety
1. Back up the production PostgreSQL database before a release.
2. Preserve the real `backend/.env`.
3. Deploy:

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

4. Verify API process health:

```bash
curl -fsS https://grocery-house-manager.com/api/health/live
```

5. Verify household data readiness:

```bash
curl -i https://grocery-house-manager.com/api/health/ready
```

Expected when ready: HTTP 200.

If `/health/live` is 200 but `/health/ready` remains 503, **do not delete volumes or reset the database**. Inspect:

```bash
docker compose logs --tail=250 backend
```

## Service audit — October 2026
### Google Places API (New)
**Needed only for Food Tonight.** If your existing Google key already has Places API (New) enabled and billing attached, no new key is required. V98 uses field masks and lean initial discovery to control cost.

### DigitalOcean Inference / GHM Household Agent
No plan change is required by V98. V98 reuses the existing inference connection for conservative official-menu interpretation when available. The feature still works in reduced mode without menu AI analysis.

### DigitalOcean Managed PostgreSQL
Do not upgrade solely because of the previous 502/login issue. V98 fixes application startup/readiness behavior. Scale the DB only if real DigitalOcean metrics show connection, CPU, memory or storage pressure.

### Tabscanner
No immediate upgrade is required. The current Starter plan is suitable for testing/small usage; upgrade only as real receipt volume approaches the plan allowance.

### Resend
No immediate upgrade is required while verification/reset/transactional email remains below the free-plan limits. Move to Pro when daily/monthly production email volume approaches the free quota or you need the higher operational limits.

### Apify
No V98 plan change is required. Continue monitoring actor availability and usage/cost for grocery/flyer workloads.

### Stripe
No service-plan upgrade is required for V98.

### Open Food Facts
No new credential is required.

### TheMealDB
No change is required for the current integration in V98.

### Google Custom Search
No change is required for V98. Food Tonight does not depend on Custom Search for its primary place discovery.

### Instacart Developer Platform
**Not required by V98.** Checkout/order preparation was deliberately left out so the app stays focused.

### DigitalOcean Spaces
Still optional. V98 does not require Spaces for Food Tonight.

## Validation performed in this artifact environment
- Backend Python compilation: passed
- Backend regression tests: **5/5 passed**
- SQLAlchemy isolated schema creation: **31 tables**
- Frontend TS/TSX syntax/transpile validation: **60 source files, 0 syntax diagnostics**
- CSS brace/structural balance: passed for historical, V97 and V98 theme layers

A complete FastAPI host smoke test could not run in this artifact environment because the host Python environment does not have `google-auth` installed. The Docker backend requirements already pin `google-auth==2.37.0`, so the normal container build installs it.

The authoritative `npm ci && npm run build` should still be run by the GitHub quality gate or normal Docker build because this artifact workspace does not contain the project's installed frontend dependencies.
