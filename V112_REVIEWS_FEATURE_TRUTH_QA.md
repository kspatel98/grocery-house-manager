# V112 — Reviews, Feature Truth & One-Login QA

Built on V111 WebSocket Pool Hotfix.

## Reviews & ratings
- Added a dedicated Reviews & feedback page at `/reviews`.
- Reviews are discoverable from More, Profile and Support.
- Public review summary on the marketing Home links to the full review page.
- Users can submit, edit, make private/public, and delete their own 1–5 star review.
- Public reviews can show an admin reply.
- Added public read-only `/reviews/public` endpoint.
- Success-moment feedback now appears after successful Shopping, Receipt, Meal Plan and Kitchen/Inventory checks.
- Added one-tap private 👍 / 👎 feedback that never becomes a public review by itself.
- A public review is only created/updated when the user explicitly publishes stars + comment.
- Removed the permanent old "Don't ask again" behavior. "Maybe later" snoozes prompts for 14 days; prompts are throttled to avoid nagging.
- Old V94 localStorage dismissal keys no longer suppress the new V112 prompt.

## Truthful feature information
- Added explicit Weekly Flyer Intelligence row to the Plans feature matrix.
- Updated Privacy language to distinguish private quick feedback from public reviews.
- Added `backend/app/scripts/feature_truth_audit.py` to verify the 9 premium workflows have registered routes, premium metadata and provider configuration state.
- Added `V112_FEATURE_TRUTH_AUDIT.md` documenting what is code-backed vs provider-dependent.

## One-login QA
- Added `scripts/ghm_full_smoke_test.py`.
- Prompts for email/password once (password is not saved).
- Tests health, auth, bootstrap, house data, inventory, shopping, receipts, money, reviews, billing, premium try, reports/intelligence endpoints and provider capabilities.
- Premium-locked responses are reported as LOCKED rather than incorrectly marked broken.
- Includes a short concurrent authenticated read check for the connection-pool regression.
- Optional `--external` mode can call provider-backed product lookup/price/flyer/Food Tonight checks.
- Writes a timestamped JSON report.
- Added `V112_FULL_QA_CHECKLIST.md` for UI/write/camera/payment workflows that should not be automated against a real household by default.
