# GHM V122.1 — GitHub duplicate translation hotfix

## CI failure fixed
GitHub Actions reported TS1117 twice in `frontend/src/localizationV118.ts`:

- `Message your household…`
- `Add reaction`

Both strings already existed earlier in the localization object. V122 accidentally added a second copy of each at the bottom of the file.

## Fix
Removed only the duplicate V122 definitions and retained the existing Gujarati, Hindi and French translations.

## Validation
- Re-ran TypeScript parsing and confirmed there are **no remaining TS1117 duplicate-property errors**.
- Backend/runtime logic is unchanged.
- No database migration is required.
