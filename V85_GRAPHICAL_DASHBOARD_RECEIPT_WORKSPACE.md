# v85 — Graphical Dashboard & Receipt Workspace

This release keeps the v84.1 production API routing hotfix and redesigns the authenticated desktop/tablet experience around the visual concept supplied by the product owner.

## Connected home dashboard
- Responsive three-column desktop workspace for Expenses, Meals, Receipts, Flyers and Inventory.
- Live current-month household expense totals, current user's share/paid/net position and reimbursement suggestions.
- Lightweight CSS category spending visual with real expense data.
- Inventory-aware meal readiness using built-in recipe ingredients against current inventory.
- Real-food-photo cards for the dashboard meal preview.
- Regional Indian cuisine cards and direct links to the complete Meals page.
- Latest receipt card uses actual saved receipt rows/total when available.
- Connected flow strip: Inventory → Shopping → Meals → Receipts → Expenses → Savings.
- Tablet layout collapses intelligently to two columns; mobile stacks to one column.

## Receipt Scan workspace
- New graphical workbench inspired by the supplied concept.
- Desktop: receipt image upload / trip details / result explanation side by side.
- Tablet: two-column workbench with result area below.
- Mobile: one-column focused scanner with nonessential preview hidden.
- Selected receipt image preview before scan.
- Clear workflow steps: Upload & scan → Review → Update inventory → Add to expenses.
- Existing scan limits, extra scans, shopping-list reconciliation, inventory updates, manual price entry and expense linking remain intact.
- Review area remains editable and becomes card-based on tablets/phones rather than forcing a wide table.

## Navigation & viewport safety
- Desktop navigation now uses compact icon + label items, with Expenses promoted to primary navigation.
- More uses a static ellipsis, no moving arrow.
- Tablet header automatically becomes more compact before switching to mobile navigation.
- Mobile bottom navigation reserves page space and respects safe-area insets.
- Focus dialogs/forms are constrained to the real viewport; internal content scrolls instead of putting controls behind the header or bottom nav.

## Compatibility
- v84.1 same-origin `/api` production routing is retained.
- Existing reimbursement cent-based math and tests are retained.
- Existing English/Gujarati/Hindi/French global localization remains active; key new v85 labels were added to the localization catalog.
