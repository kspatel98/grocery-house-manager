# V89 — Video-reviewed theme + Community Recipes

This update is based on the supplied full-site screen recording in both light and dark modes.

## Visual / brand changes

- Reworked the global light and dark contrast layer so pages use a calmer, slightly darker canvas and cards have stronger visual separation.
- Dark mode now avoids bright legacy card/modal "islands" across inventory, shopping, prices/flyers, expenses, receipts/reports, meals, support and related data views.
- Light mode has stronger borders, text hierarchy and focus states so pale cards no longer blend into the page.
- Standardized form controls, focus rings, primary/secondary/ghost buttons, dialogs and selected navigation states.
- Changed compact app branding to the square Grocery House Manager icon instead of compressing the full horizontal wordmark into small slots.
- Increased the logo footprint in the desktop sidebar, public header, mobile authenticated header and authentication screens.
- Added a darker green brand tile in both themes so the white-backed mark stays visible.
- Login/register now use the same logo artwork and treatment on both sides; the form-side logo is centered.

## Community Recipes

Users can now save recipes to their account instead of only to browser local storage.

- Create a recipe with name, base servings, meal type, cuisine, ingredients and detailed cooking steps.
- Add JPG, PNG or WebP dish images up to 6 MB. Uploaded files are verified as real image formats before storage.
- Choose Jain, Swaminarayan, vegetarian, vegan or non-vegetarian diet labels.
- Add cuisine/category labels such as Gujarati, Punjabi, South Indian, North Indian, breakfast, dessert and custom categories.
- Keep a recipe private or share it with the community at creation time.
- Share/unshare later from **My recipes**.
- Edit or delete only recipes owned by the signed-in user; the backend enforces ownership as well as the UI.
- Shared recipes appear under **Community recipes** with creator name/avatar and category tags.
- Community recipes can be searched by recipe, creator, cuisine and category.
- Shared/private user recipes use the existing inventory comparison and "add shortage / selected / full recipe" grocery-list workflow.
- Existing `ghm_custom_recipes` browser recipes can be imported to the signed-in account; local data is removed only after a complete successful import.

## Backend additions

- `community_recipes` database table and SQLAlchemy model.
- `GET /recipes/community`
- `GET /recipes/community/mine`
- `POST /recipes/community`
- `PATCH /recipes/community/{recipe_id}`
- `DELETE /recipes/community/{recipe_id}`
- `POST /recipes/community/{recipe_id}/image`
- `DELETE /recipes/community/{recipe_id}/image`

No new environment variables are required. Recipe images use the existing persistent `backend_uploads` Docker volume.

## Main files changed

- `frontend/src/styles.css`
- `frontend/src/pages/MealsPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/components/AppFrame.tsx`
- `frontend/src/components/PublicFrame.tsx`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/main.py`
- `backend/app/db/dev_migrations.py`
- `backend/app/api/community_recipes.py` (new)

## Validation performed in the supplied environment

- Backend Python source compiled successfully with `compileall`.
- New Pydantic create/output schemas and the SQLAlchemy model instantiated successfully with test data.
- Full frontend source completed a TypeScript syntax/transpile pass with TypeScript 5.8 using `--noCheck`.
- `styles.css` has balanced braces and parses with no top-level `tinycss2` errors.
- A normal `npm run build` could not be completed in this execution environment because the uploaded ZIP does not contain `node_modules` and outbound DNS to `registry.npmjs.org` is unavailable. The production Dockerfile will install the pinned dependencies from `package-lock.json` in an environment with package-registry access.

## Deploy

From the project root on the server:

```bash
docker compose up -d --build
```

The current startup flow already runs `Base.metadata.create_all()` plus the additive schema helper, so a missing `community_recipes` table is created automatically for the existing PostgreSQL setup. For a longer-term production migration workflow, move the same schema change into Alembic when the project adopts Alembic migrations.
