# V113 focused QA checklist

Use this after deployment in addition to the existing V112 full smoke test / QA documents.

## 1. App entry and navigation

1. Sign in and click **Open app** from the public site.
   - Expected: `/houses` opens first.
2. Open a house.
   - Expected: local tabs show **Today / Home / Money / Activity** and are readable in light and dark mode.
3. Click **Today** inside the house.
   - Expected: URL includes `?tab=today` and Today content stays open.
4. Check global desktop/mobile navigation.
   - Expected: **Home / Plan / Shop / Scan / More**; no duplicate global Today item.

## 2. Shopping

1. Open Shop and start **New list**.
   - Expected: a visible Cancel action exists and returns cleanly to the list workspace.
2. In manual product creation, test at 1366px, 768px and ~390px width.
   - Expected: product name/category/unit/quantity/price controls remain fully visible; no horizontal page scroll.
3. Open an active list and use **Share to House Chat**.
   - Expected: message appears with a linked shopping-list card.

## 3. Inventory density

1. Populate 8–12 products with images and without images.
2. Compare desktop, tablet and phone.
   - Expected: cards are medium/compact, labels/actions remain readable, and cards do not consume excessive vertical space.

## 4. Meals

1. Open recipe library in light and dark mode.
   - Expected: recipe name, cuisine/category and inventory readiness percentage are readable.
2. Open recipe detail.
   - Expected: diet tags, inventory %, serving control, ingredient rows and detailed steps are readable in both themes.
3. On phone, inspect ingredient information.
   - Expected: no forced horizontal desktop table; ingredient information fits the screen.
4. Share a recipe to House Chat.
   - Expected: chat card opens that exact recipe again.

## 5. Kitchen Vision

1. Open Kitchen Vision in dark mode.
2. Inspect the file chooser / capture area.
   - Expected: it uses the dark themed surface; no unrelated white file panel.

## 6. Receipt Scan

1. Open Receipt Scan in light then dark mode.
   - Expected: proper left/right page margin; workspace is medium-width; title, description, step bar and action links are readable.
2. Inspect Upload / Trip details / Preview.
   - Expected: all three follow the same surface language and none uses unreadable white-on-white/pale-on-white text.
3. On phone/tablet.
   - Expected: workspace becomes one column and no horizontal page scrolling occurs.

## 7. House Chat privacy and interaction

Use two different household accounts A and B.

1. A posts a message; B posts another.
2. A opens B's message.
   - Expected: A cannot delete B's message.
3. A deletes A's own message.
   - Expected: deletion succeeds.
4. Reply to a specific message.
   - Expected: reply preview identifies the quoted message/member.
5. React to a message with multiple emoji from A and B.
   - Expected: counts aggregate correctly; tapping the same emoji again toggles that user's reaction off.
6. Use **+ Attach from GHM**.
   - Expected: active lists, recent receipts and saved recipes can be attached.
7. From Food Tonight, share a restaurant result.
   - Expected: rich restaurant card appears in chat and returns to Food Tonight when opened.

## 8. Money integrity

Use a disposable test Money account.

1. Enter $10 split equally among 3 people.
   - Expected: shares are $3.34 / $3.33 / $3.33 (or deterministic equivalent) and total is exactly $10.00.
2. Enter a custom split whose cents do not add exactly to the total.
   - Expected: Save remains unavailable / backend rejects it until the exact cent matches.
3. Use the historical reimbursement regression:
   - Kartik +$58.75
   - Devil +$8.75
   - Nainesh -$16.25
   - Jay -$51.25
   - Expected: suggested transfers settle exactly to $0 for every person; no cent remains/lost.
4. Mark only part of a suggested reimbursement sent.
   - Expected: amount cannot exceed the current suggestion; pending payment prevents duplicate recommendation; accounting balance changes only as designed after confirmation.
5. Attempt to introduce another currency into an existing CAD Money account (API/manual test if exposed).
   - Expected: GHM rejects mixed-currency accounting rather than summing incompatible amounts.

## 9. Flyers & Prices

1. Enter a valid supported postal code.
2. Inspect **Available flyer stores for this postal code** in both themes.
   - Expected: heading, description, retailer chips and selection states are clearly readable.

## 10. Landing page

1. Test 1366px, 1920px and phone widths.
   - Expected: consistent left/right gutter; no section touches the viewport edge.
2. Inspect the closed-loop flow.
   - Expected: feature names such as Receipt Scan / Inventory / Kitchen Vision / Recipes remain visible.
3. Inspect the value / “Why pay monthly?” area.
   - Expected: title, body text and supporting values remain readable in light and dark mode.

## Automated regression

Run the existing safe production smoke test:

```bash
python3 scripts/ghm_full_smoke_test.py
```

For provider-backed checks:

```bash
python3 scripts/ghm_full_smoke_test.py --external --postal-code L9C3M4
```

Run backend tests inside the backend container/source environment:

```bash
PYTHONPATH=. pytest -q tests
```

Expected V113 backend result: **12 passed**.
