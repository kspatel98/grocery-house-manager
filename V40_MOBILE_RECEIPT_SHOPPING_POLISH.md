# v40 Mobile Receipt + Shopping Polish

Updates included:

- Receipt scan/review now stays inside the mobile viewport so users should not need to zoom out.
- Mobile header/nav is more compact and horizontally scrollable instead of forcing the page wider.
- Saved receipt history is visible in the receipt section; users can open past receipts and see extracted content, totals, and product rows.
- Shopping-list suggested price badges are kept compact and clearly show the source, such as Last receipt or Live compare.
- Live price comparison remains in a separate scrollable popup.
- Added mobile CSS safeguards to prevent horizontal page overflow.

Deploy:

```bash
docker compose down
docker compose up -d --build
```
