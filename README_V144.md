# GHM v144: vegetarian source-linked recipe library

## Scope of this release

- Adds **11 manually verified source links** to *Dassana's Veg Recipes* (www.vegrecipesofindia.com), across Gujarati, Punjabi, North Indian, Maharashtrian, and South Indian cuisines.
- These are **curated starting links**, not a copy or full index of that website. The source site may contain thousands of additional recipes not included here.
- Adds a searchable/category-filterable section to House → Meals & Recipes.
- Each linked entry opens a **GHM-authored recipe card** with inventory matching, adjustable quantities and servings, shopping-list shortcuts, and House Chat sharing. Two missing GHM dishes were authored independently (Vegetable Pulao and Palak Paneer).
- Source links open the author's full original instructions and, where verified, videos on the original page. **There is no copying, hosting, transcoding, bulk scraping, or embedding of the source's images, video, instructions, or recipe measurement table.** Existing GHM food images, not images from the third-party website, decorate cards.
- A distinct source attribution note explains that GHM quantities and directions are *independent shopping-planning suggestions*, not the exact original recipe. Users must verify diet/allergens and exact ingredients on the source page.

## Backend data and routing

- Adds `linked_recipe_sources` via SQLAlchemy metadata, automatically created at normal healthy backend startup.
- The initial 11 links seed idempotently and don't overwrite existing records. No existing household or community recipe data is changed.
- Authenticated `GET /recipes/linked?q=&cuisine=` returns metadata and outbound URLs only. This endpoint does not fetch the third-party website.
- Source links are restricted to HTTPS `vegrecipesofindia.com` hosts; there is no user-supplied remote URL fetch.
- Source metadata lives in `backend/app/api/linked_recipe_seeds.json`. Future additions should have verified valid source URLs, a GHM-authored recipe with a matching ID, and reviewed licensing. Existing source records aren't overwritten automatically.

## Frontend

- `frontend/src/pages/MealsPage.tsx`: new linked recipe section, filters, source attribution, deep link in House Chat (`?linked=<slug>`), reuse of full GHM meal card.
- `frontend/src/recipes.ts`: two independent GHM recipes to back source links.
- `frontend/src/theme-v144.css`: light/dark responsive design and reduced-motion defaults; imported in `main.tsx`.

## Deployment and smoke tests

1. Preserve production `backend/.env`, `frontend/.env`, and server-specific Compose settings.
2. Upload/commit the package changes to your GitHub main branch; verify GitHub Actions completes a frontend build.
3. On DigitalOcean run `git status` and resolve any local edits safely before `git pull origin main`.
4. Run `docker compose up -d --build`, then `docker compose ps`, and check backend logs and database readiness.
5. Open House → Meals & Recipes → **Vegetarian inspiration**. Search for Khaman and Palak Paneer. Open a card and test servings, shortages, ingredient addition and share-to-chat deep links. Confirm the external source action opens the intended original page in another tab.
6. Test in light/dark themes on mobile and desktop.
7. The provided test `PYTHONPATH=backend python backend/tests/test_v144_source_linked_recipes.py` checks idempotency and safe links with SQLite.

## Validation and limitations

- Python backend compiled, all 11 GHM recipe IDs mapped, new SQLite catalog regression test passed, and edited React/TypeScript files passed syntax parsing.
- A full frontend build couldn't be completed here due to unavailable/incomplete dependency installation; test in GitHub Actions before deploying to production.
- No live PostgreSQL/production deployment was performed, and no bulk data, instructions, imagery, or video were copied from the third-party site.
- Linking to a third-party website does not guarantee perpetual availability of its pages. Further reuse of that site's protected content requires permission/licensing.
