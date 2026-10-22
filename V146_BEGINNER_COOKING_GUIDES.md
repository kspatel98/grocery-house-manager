# Grocery House Manager v146 — Beginner Cooking Guides

## What changed

- All **63 built-in GHM recipes** now show 18–21 sequential, independently written guidance steps instead of only a few brief sentences.
- The **11 GHM planning cards linked to Dassana's Veg Recipes** have been **rewritten individually**, with 18–20 practical steps per dish covering preparation, order of operations, estimated heat/time, texture checks, serving and safe storage. Dishes: Khaman, Khandvi, Paneer Butter Masala, Masala Dosa, Vegetable Pulao, Chole, Dal Tadka, Palak Paneer, Pav Bhaji, Rajma Masala and Idli Sambar.
- The other 52 built-in recipes keep their existing dish-specific technique sequence, surrounded by new preparation, measuring, hygiene, heat-handling, doneness, serving and storage guidance. These are **not** claimed to be fully reauthored professional methods; they are a first beginner-readability upgrade and should be reviewed individually for technique accuracy before marketing as authoritative.
- Recipe steps show an interactive progress indicator and checkboxes, with a Restart steps action. Progress is temporary UI state; it is not saved when the app is reloaded.
- Khaman now lists fruit salt (ENO) needed for the described instant method. The Idli Sambar ingredient list includes optional tamarind for the described souring variation.
- All previously linked recipes, shopping-list integrations, inventory checks, recipe sharing, and the v145 Wallet UI are preserved.
- The third-party publisher's steps, photographs and videos are **not copied**. Unmapped source-only recipe entries still link directly to the author's page for detailed instructions.

## Files

- `frontend/src/recipeBeginnerGuides.ts` — eleven original full guided methods.
- `frontend/src/recipeBeginnerScaffold.ts` — beginner prep/finishing guidance for the remaining built-in recipes.
- `frontend/src/recipes.ts` — selects long-form methods, updates two ingredients.
- `frontend/src/pages/MealsPage.tsx` — checkable steps and progress.
- `frontend/src/theme-v146.css` — responsive/light-dark styling for the method area.
- `frontend/src/main.tsx` — imports new stylesheet.
- `frontend/scripts/check-beginner-recipes.cjs` — basic coverage regression test.
- `frontend/package.json` — `npm run check:recipes` script.

## Validation and testing

Verified locally:
- `63 built-in recipes passed; 11 source-linked planning recipes have 18+ original beginner steps.`
- Every built-in recipe now has 18–21 English steps, with the same count for Gujarati, Hindi and French (localization is glossary-based and should receive fluent-language QA).
- TypeScript/TSX syntax parsing passes for edited files.
- Source package integrity checked.

Not verified:
- **Full frontend production build**: included `frontend/node_modules` was incomplete and `npm ci` failed; the local TypeScript build reported missing `@types/react` and other packages. Run a fresh install/build in GitHub Actions or a clean CI runner.
- Live cooking steps with real users and completeness of every optional ingredient. A kitchen usability review should test every dish, starting with the eleven feature-linked recipes.

## Installation

1. Back up source and production configuration. Do not upload `.env` secrets to GitHub.
2. Commit the changed source (do not upload `node_modules`) to GitHub `main`.
3. Let GitHub Actions install dependencies and run `npm run build` and `npm run check:recipes` under `frontend`.
4. Deploy with `git pull origin main` and `docker compose up -d --build` after checking `git status` and preserving local modifications.
5. Test a Khaman and Idli Sambar GHM cooking card on desktop and mobile, tick steps, restart progress, scale servings, and add ingredients to a list.
6. Confirm all existing House Chat, inventory, linked-original recipes and Wallet flows still work.

## Copyright and safety

GHM instructions are independently written. Source-linked recipes may vary from the author's precise cooking method or ingredient quantities; verify on the original page. Times are approximate. Never force-open a pressure cooker. Undercooked red kidney beans are unsafe; boil thoroughly and cook until tender. Prevent raw poultry cross-contamination and use a food thermometer for its doneness.
