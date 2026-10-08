# V112 — Full GHM QA Checklist

Use a dedicated test household when possible. The automated smoke test covers non-destructive API health. The tasks below cover user-visible behavior that still needs a person because it includes images, payments, maps, camera access or visual UX.

## 1. Account & reliability
- Log in with email/password once. Expect Home without repeated Preparing/Reconnecting loops.
- Refresh 5 times, open two browser tabs and one phone. Expect no QueuePool timeout and no lost household data.
- Leave one tab open for 10+ minutes, switch away and back. Live household updates should reconnect without holding DB connections indefinitely.
- Run `docker compose logs backend --since=30m | grep -Ei "QueuePool|pool exhausted|connection timed|Traceback"`. Expect no pool exhaustion during normal use.

## 2. House & members
- Create/join a test house, invite a second account, verify roles and member list.
- Owner can remove a member; non-owner cannot delete the house.
- Non-owner can leave the house.

## 3. Inventory
- Add section and product, edit quantity/store/price/low-stock threshold, then reload.
- Verify low-stock, out-of-stock and expiry states.
- Check light and dark mode; all text and controls must remain readable on desktop and phone.

## 4. Shopping
- Create a list, add inventory and manual items, change quantities, move items To Buy → In Cart.
- Confirm the manual-product form never clips on desktop or mobile.
- Tap Shopping done. Verify the two choices: Scan receipt & finish / Finish without receipt.
- Finish without receipt and confirm only In Cart quantities reach inventory once.
- Finish with receipt and confirm list data stays linked, missing/extra receipt products require review, and inventory is not doubled.

## 5. Smart Receipt Scan — Basic+
- Upload a clear JPG/PNG receipt.
- Verify progress, store/date/items/discount/tax/total review and uncertain lines.
- Confirm saved receipt appears in history, trusted prices enter household history, and optional expense flow works.
- Try an unsupported image type and verify a clear validation message.
- After a successful receipt, confirm the in-app quick feedback prompt can appear and never blocks the saved result.

## 6. Product Lookup — Basic+
- Search by product name and barcode/item number.
- Search with a supported store and without a store.
- Verify exact/likely/not-found states are honest and source details are visible.
- Add a confirmed result to inventory and verify duplicate protection.

## 7. Whole-List Comparison — Family+
- Prepare a shopping list with items that have saved/current price evidence.
- Verify one-store and two-store recommendations only claim complete totals when all required items have coverage.
- Verify missing prices remain visibly missing instead of being guessed.

## 8. Live Grocery Price Compare — Family+
- Use a Canadian postal code and 2–5 products.
- Verify store, package/size, source/freshness and fallback state.
- If provider is disconnected, expect a truthful "not connected" message plus saved-price fallback when available.

## 9. Weekly Flyer Intelligence — Family+
- Enter a full Canadian postal code.
- Verify merchant discovery, valid date range, no expired deals, shopping-list matching and item detail.
- Verify flyer location vs exact store location is not misrepresented.

## 10. Autopilot Planner — Family+
- Test normal week / busy week / guests / away-style inputs.
- Verify days at home, servings, use-soon food, optional budget and grocery gaps affect the result.
- Leave/reopen the page and verify the latest useful result is not unnecessarily lost.

## 11. Smart Stock-Up — Family+
- Use products with several price-history entries.
- Verify a stock-up suggestion explains current price vs household history and gives conservative quantity.
- Product with too little history should not get overconfident wording.

## 12. Smart Nearby Stores — Pro
- Allow precise location once; compare with saved city fallback.
- Verify exact map/provider results are distinguished from generic fallback chains.
- For an active list, confirm list relevance/coverage appears in the recommendation.

## 13. Kitchen Vision — Pro
- Test 2–4 photos, crowded pantry, fridge, duplicate packages and partially hidden products.
- Test short video if enabled.
- Verify same physical product across frames is not double-counted, uncertain detections remain for review, and nothing is silently deleted.
- Apply selected changes and verify only approved inventory updates occur.

## 14. Meals & recipes
- Open Gujarati/Indian/community recipes, change servings and confirm quantities scale.
- Check diet tags in light/dark mode.
- Add all / manual / shortages-only to shopping list.
- Confirm meal consumption is review-first before inventory is deducted.

## 15. Food Tonight
- Search restaurants/food stores using saved city and current location.
- Check dietary-mode caution for Jain/Swaminarayan results.
- Verify provider-disabled/missing-key state is truthful instead of a fake result.

## 16. Money accounts
- Test Automatic mode: new month account should be available when month changes.
- Test Custom mode: no account appears until created manually.
- Rename a month/custom account and edit included participants.
- Temporarily exclude a member; verify new expenses cannot accidentally include them. Add them later and verify old expenses remain unchanged.
- Open one account and verify its expenses, reimbursements and activity are scoped to that account.
- Lock account as owner and verify add/edit/delete is prevented until unlocked.

## 17. House Chat
- Send messages from two accounts, refresh, reply/react if available, delete own message where permitted.
- Confirm floating Chat button works on desktop and mobile without covering important controls.

## 18. Reports / Savings Ledger / Weekly report
- Complete receipt + shopping + expense activity.
- Verify reports reflect real data and distinguish verified savings from estimates/open opportunities.
- Weekly Household Report should summarize only information GHM actually has.

## 19. Reviews & ratings
- Open Reviews & feedback from More/Profile/Support.
- Submit 1–5 stars + comment, edit it, toggle public/private, delete it.
- Admin can view/reply/delete.
- Complete Shopping, Receipt, Meal Plan and Kitchen check. Verify success feedback is shown only after a successful action, is dismissible, and is throttled rather than repeatedly interrupting the user.
- Quick 👍/👎 should record private product feedback immediately; only the explicit star-review submit should become a public review.

## 20. Billing / Premium Try
- Free account sees one Premium Try chooser and can change selection before success.
- Failed/cancelled provider action does not consume the try.
- Successful chosen workflow consumes it once.
- Verify Basic/Family/Pro feature locks match the Plans page and house-owner plan model.
- Test Stripe checkout only in test mode before production changes.

## 21. Appearance / responsive UX
- Test System / Light / Dark and all GHM visual styles.
- Check desktop 1366×768, tablet, iPhone-size and narrow Android-size layouts.
- No horizontal page scroll, no two confusing vertical scrollbars, no hidden More header, no clipped forms, no pale text on pale cards.
- All modal/sheet close buttons and primary actions should remain reachable without swipe-and-hold behavior.
