# v77 localization TypeScript fix

Fixed a duplicate key in `frontend/src/localizationCatalog.ts`.

- Kept the existing `Requested quantity` translation entry.
- Removed the duplicate entry that caused TypeScript error TS1117.
- Scanned the `exact` localization object for additional duplicate keys; none remain.

After replacing the project, run:

```bash
cd frontend
npm ci
npm run build
```
