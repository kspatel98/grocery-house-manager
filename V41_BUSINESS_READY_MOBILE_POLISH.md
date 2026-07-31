# V41 Business-ready mobile polish

This version focuses on production-level mobile usability and clearer customer-facing language.

## Included
- Sticky mobile header/navigation stays accessible while scrolling.
- Header/nav is horizontally scrollable on small phones instead of cutting menu items.
- Global overflow guards prevent large receipt/reports/shopping data from pushing the page off-screen.
- Receipt review rows become mobile cards with visible labels, so users do not need to zoom out.
- Saved receipt history now displays uploaded receipt photos with extracted content.
- Receipt-derived product prices are recorded using the actual receipt date, not upload date.
- Shopping list suggested-price badges are more graphical and show source: receipt price, live compare, or saved price.
- Suggested receipt prices are based on receipt date and remain considered recent only for the configured recent window.
- User-facing receipt wording was simplified and technical language was reduced.

## Deploy
```bash
docker compose down
docker compose up -d --build
```
