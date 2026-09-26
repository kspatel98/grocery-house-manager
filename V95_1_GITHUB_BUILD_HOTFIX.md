# V95.1 — GitHub Build Hotfix

## Fixed
- Fixed the V95 TypeScript deployment blocker in `HousePage.tsx`: a household-member tooltip could evaluate to `null`, but the HTML `title` attribute accepts `string | undefined`. It now always has a safe string fallback.
- Updated the quality workflow from `actions/checkout@v4` to `@v5` and `actions/setup-node@v4` to `@v5`.
- Pinned CI runners to Ubuntu 24.04 to avoid the announced `ubuntu-latest` image migration changing the build environment unexpectedly.

## Why GitHub failed
The build error was:

`Type 'string | null | undefined' is not assignable to type 'string | undefined'.`

The failing expression was the new household member preview tooltip. `member.email` can be `null`, so the value passed to `title` was not guaranteed to be a string.

## Deploy
Preserve the production `backend/.env`, then rebuild normally after pushing this release.
