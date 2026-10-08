# V112 — Feature Truth Audit

This release separates **feature code**, **plan entitlement**, and **live-provider availability** so GHM does not claim more than the deployment can actually deliver.

## Premium workflows verified in code

| Feature | Minimum paid plan | Code path verified | Runtime dependency / truth note |
|---|---|---|---|
| Smart Receipt Scan | Basic Home | `POST /houses/{house_id}/receipts/upload` | JPG/JPEG/PNG only. Full provider extraction depends on the configured receipt OCR provider. Review is required before trusted household updates are saved. |
| Product Lookup | Basic Home | `GET /market/houses/{house_id}/product-lookup` | Universal lookup can work independently; official-store search depends on supported store/search-provider behavior and can return "not found" honestly. |
| Whole-List Comparison | Family Plus | `GET /insights/houses/{house_id}/shopping-lists/{list_id}/basket-comparison` | Uses supported saved/current evidence. Missing basket prices are not invented. |
| Live Grocery Price Compare | Family Plus | `POST /market/houses/{house_id}/price-compare` | Full live Canadian results require `APIFY_API_TOKEN`; saved household prices may be shown as fallback when available. |
| Weekly Flyer Intelligence | Family Plus | `GET /market/houses/{house_id}/flyers` | Requires a complete Canadian postal code and configured flyer provider (`APIFY_API_TOKEN`). |
| GHM Autopilot Planner | Family Plus | `POST /insights/houses/{house_id}/household-plan` | Uses household inventory/list/expiry context and an optional budget. It can only be as complete as the household data supplied. |
| Smart Stock-Up | Family Plus | `GET /insights/houses/{house_id}/stock-up` | Recommendations depend on actual household price/purchase history. No history means no strong stock-up claim. |
| Smart Nearby Stores | Household Pro | `GET /market/houses/{house_id}/shopping-lists/{list_id}/suggestions` | Exact nearby results use Google Places when configured. Without it, GHM may show conservative fallback chains and must not present them as exact nearby certainty. |
| Kitchen Vision | Household Pro | `POST /ai/houses/{house_id}/kitchen-vision` | Supports photos and short video when enabled. AI/provider configuration is required for full analysis; uncertain detections remain review-first and are not silently applied. |

## Other verified core capabilities

- Shared houses, owner/member roles, invitations, leave/kick/delete rules.
- Shared inventory with sections, quantity, price/store memory, low-stock/expiry states and household scopes.
- Shopping lists with To Buy / In Cart, receipt-assisted finish and direct finish.
- Receipt history, price memory and Receipt Guardian plan gating.
- Meals/recipes, community recipes, serving adjustment and review-first inventory consumption.
- Household money accounts, account participants, expenses, reimbursements and account-scoped activity.
- House Chat, reports, Savings Ledger, themes/appearance, support, billing and Premium Try.
- In-app reviews, admin replies and success-moment feedback prompts.

## Important deployment truth

A route being present in code does **not** mean a third-party provider is configured or currently returning data. Run:

```bash
cd /var/www/grocery-house-manager
docker compose exec backend python -m app.scripts.feature_truth_audit
```

The audit prints each premium workflow, required route, plan label and whether the relevant deployment provider is configured.

For runtime behavior with a real account, use:

```bash
python scripts/ghm_full_smoke_test.py
```

That script logs in once, tests core and house-scoped reads, reports locked features instead of falsely marking them broken, and writes a JSON report without storing the password.
