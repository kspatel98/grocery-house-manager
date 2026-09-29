# Grocery House Manager V97 — Premium Household World + Unified Theme System

V97 is a visual/product-experience release built on V96. It does **not** change the production database schema or require any new backend secret.

## Product goal

GHM should feel like a deep household operating system that is calm to use, not a collection of unrelated grocery utilities. V97 adds a richer premium interaction layer only where it helps users understand the connected system, while keeping forms, tables, receipts, expenses and editing workflows clean and functional.

## New GHM Household World

A new interactive `HouseholdWorld` component appears in:

- the public homepage hero;
- the signed-in Today experience.

The home sits at the centre and four real GHM workflows connect around it:

- Kitchen — Kitchen Map / inventory truth;
- Plan — meals + household forecast;
- Shop — list + price / preference intelligence;
- Value — verified savings / reports.

In signed-in mode the nodes display real household signals such as items to buy, use-before-expiry count, expired items requiring review, and verified monthly savings.

The visual uses flowing connection paths, depth, glass surfaces and subtle motion, but contains no coins, points, avatars, game rewards or decorative interactions that do not map to a real product action.

## Light palette

- Canvas: `#f4f7f1`
- Deep canvas: `#e9efe8`
- Surface: `#ffffff`
- Soft surface: `#eef4ee`
- Strong surface: `#e2ece4`
- Primary forest: `#176b45`
- Deep forest: `#0d4c31`
- Bright green: `#35a86d`
- Gold: `#d6a94f`
- Accent olive-gold: `#c0c26b`
- Text: `#17241d`
- Muted text: `#607166`
- Border: `#d3dfd6`

The light theme intentionally uses warm ivory/sage rather than cold blue-gray SaaS surfaces.

## Dark palette

- Canvas: `#07130f`
- Deep canvas: `#091a14`
- Base surface: `#10231b`
- Soft surface: `#142d22`
- Elevated surface: `#173126`
- Signature card gradient: `linear-gradient(137deg, #214727 0%, #0e2019 58%, #10231e 100%)`
- Primary green: `#6ed39a`
- Bright green: `#45c780`
- Gold: `#f2c86d`
- Text: `#edf7f1`
- Muted text: `#b0c2b7`
- Border: `#355745`

Dark mode is now intentionally dark across the page, cards, forms and nested surfaces. It no longer depends on isolated page-specific white/light cards.

## Existing requested brand details preserved

- Premium text: `#ff7e1f`
- Crown circle: `#16432f`
- Language picker: `#12251e`
- Footer brand stack / links: `#0e1d17` + `2px solid white`
- Inventory `.product-media`: `linear-gradient(135deg, #004d30, #004f34)`
- Flyer local filter panel: `#12211b`, white border, 10px bottom margin, preserve-3d
- Extra scan visual frame: `#c0c26b`, 2s animation and full-height coverage

## Consistency layer

The new `frontend/src/theme-v97.css` is imported **after** the historical stylesheet. It defines shared visual tokens and normalizes:

- page/canvas backgrounds;
- primary / secondary / danger buttons;
- inputs, selects and textareas;
- panels and cards;
- product cards;
- profile and household surfaces;
- shopping/list rows;
- expenses and receipt surfaces;
- tables;
- modal/dialog surfaces;
- sidebar/topbar/header;
- mobile bottom navigation;
- public navigation;
- Kitchen Map;
- feature landing pages;
- pricing surfaces;
- footer / parent-company presentation.

This is intentionally a new design-system layer instead of another set of scattered fixes in `styles.css`.

## Kitchen Map visual polish

Kitchen Map remains a real workflow, not a game. V97 gives the storage-zone area a more spatial connected-map treatment, selected-zone depth, consistent surfaces, and theme-aware coverage visuals while preserving V96's rules:

- not visible != gone;
- multiple identical physical items stay multiple;
- repeated frames of the same physical object are deduplicated;
- important changes require approval.

## Accessibility / performance

- no heavy 3D engine added;
- no image-generation runtime dependency;
- no WebGL requirement;
- rich visual is CSS + inline SVG;
- all world nodes are real keyboard-focusable links;
- `prefers-reduced-motion` disables the flowing-path animation and hover transitions;
- existing route lazy loading remains unchanged;
- theme changes update browser `theme-color` dynamically.

## PWA theme update

`site.webmanifest` now uses the V97 palette:

- theme color `#0d4c31`
- background `#f4f7f1`

## Deployment

No new database migration and no new environment variable are required.

Preserve the real production `backend/.env`, then rebuild normally:

```bash
docker compose down
docker compose up -d --build
```

## Validation performed in the artifact workspace

- backend Python compilation passed;
- backend focused regression suite: 5/5 passed with isolated test settings;
- 57 application TS/TSX files passed TypeScript transpile/syntax diagnostics;
- `theme-v97.css` parsed without top-level CSS parser errors and has balanced braces;
- an authoritative `npm ci && npm run build` could not be completed because package download timed out and left incomplete `node_modules`; this partial install is removed before packaging and the GitHub quality gate remains the authoritative production build check.
