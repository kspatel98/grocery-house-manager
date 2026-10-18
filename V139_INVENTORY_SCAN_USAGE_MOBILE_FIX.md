# GHM v139 — Inventory Delete, Grocery Scan, Usage Counters, Mobile Ask

**Base:** v138 Smart Scan Plans SEO Mobile. **Plan amounts and quotas were NOT changed.**

## Inventory deletion
- Removes shopping-list rows and store prices referencing the deleted product explicitly in one database transaction.
- Preserves receipt and Kitchen Vision observations but unlinks historical product IDs, avoiding FK failures in older production databases.
- On error rolls back and returns a meaningful error. The frontend disables duplicate delete submissions and shows the actual server error. Users confirm that removal affects shopping lists.
- Production verification: delete both a never-used product and a product appearing in a shopping list, receipt and kitchen scan; confirm receipt history remains intact.

## Written-list scanner
- For written lists only, when enhanced-image inference returns no rows, retry **once** with the unenhanced JPEG; successful scans do not retry. A failed retry keeps the first response and permits manual correction.
- The fallback can incur a second inference-provider request, but is bounded to one extra request for the same monthly image-scan credit. Monitor usage and costs.
- Provide manual addition of rows without spending an additional credit after zero-result recognition.
- Improve error/warning readability with theme-specific opaque foreground/background contrasts.
- Recognition is still dependent on the configured DigitalOcean model. **No promise of 100% handwritten accuracy.** Verify actual problem image in staging; if still zero, collect backend model name, redacted error details, provider response format, and test a higher-quality vision model.

## Feature-usage indicators
- Read-only `GET /houses/{house_id}/feature-usage` returns counters for grocery scans, Ask GHM, Kitchen Vision, fresh product lookups, included receipt scans, and both daily and monthly paid price/flyer runs.
- Displays contextual limits on Shopping, the Ask GHM conversation, Kitchen Vision, and Prices/Flyers.
- Monthly AI counts are shared across all houses of the paying house owner. Paid provider counts are per house and cached results do not consume these provider-run counters.
- Counter automatically refreshes when paid workflows succeed, on focus and on account refresh. Existing receipt-scan quota remains on the Receipt workspace.
- Display is read-only; it does not trigger paid APIs. It fetches the backend database, not a client-side estimate.

## Mobile Ask GHM
- Move usage into the transcript tools area (not the composer).
- Reserve the bottom navigation space only on the chat app root rather than again on its nested desktop shell. The composer now sits at the end of the chat viewport.
- Validate on iOS Safari, Android Chrome, and desktop device emulation with keyboard closed/open and both dark/light modes. The exact safe-area behavior needs real-device checking.

## Plan and cost review
- Keep Basic $1.99 CAD, Family Plus $4.99 CAD and Household Pro $6.99 CAD monthly; this build does NOT alter plan limits or billing tiers.
- Current Pro maximum monthly heavy-user workloads include 300 AI responses, 25 grocery scans, 10 Kitchen Vision scans, 10 receipts, 250 lookup runs, and 30 new paid provider requests *per house* (10 houses possible). This might exceed $6.99 gross revenue for some heavy users; track provider requests, usage by plan and unit economics before claiming profitability. 
- Before wider release, consider one cross-house paid-price request cap for the owner; current price/flyer quota is per-house and 10 owned houses multiply the maximum paid requests. This is a material cost risk; do not silently change billing benefits before user approval.

## Checks
- `python -m compileall -q backend/app`
- `PYTHONPATH=backend pytest -q backend/tests/test_v139_scan_fallback.py` (2 tests passed in authoring environment)
- Frontend TypeScript parser found 0 syntax errors in the changed TS/TSX files.
- Full frontend production build was not completed because `npm ci --offline` lacked cached packages (`yallist`); backend suite was blocked by missing `python-jose` and `passlib` locally. Run `npm ci && npm run build` and full pytest in CI.

## Deploy safely
1. Back up production DB; keep current `.env` secrets untouched.
2. Upload/copy only project source files, push to GitHub; ensure GitHub Actions and unit tests pass.
3. Staging: test inventory deletion with related records; handwritten list; scanned image error; quota displays; mobile Ask GHM composer.
4. On DigitalOcean, use `git pull origin main` and `docker compose up -d --build` with the existing server configuration.
5. Check `docker compose ps`, backend logs and `/health/ready`. Do not infer successful deployment from a ZIP alone.
