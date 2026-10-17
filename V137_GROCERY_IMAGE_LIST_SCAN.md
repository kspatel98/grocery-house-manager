# GHM v137 — Scan Groceries (product-photo vs handwritten/printed-list)

Based on **v136 Combined UX & Price Safety**. All v136 improvements are included.

## User flow

Use **Scan groceries** from **Inventory** or **Shopping Lists**. The popup has two deliberate modes:

- **Products**: Take or upload one image showing actual grocery products. Detect visible products/packages/produce. Choose **Inventory** or **Shopping list**. No list or stock update happens until the user reviews and confirms the extracted rows.
- **Written list**: Take or upload an image/screenshot of a printed or handwritten grocery list. The only allowed destination is a **Shopping list**; saving never increases inventory. Users can select an existing active list or create a new list.

Scan JPG, PNG or WebP images up to 8 MB. The server normalizes orientation and resizes images to 2000 px before the vision call. Up to 60 lines are returned per scan. Uploaded photos are processed in memory for the inference provider and are not stored by this feature in GHM's uploads directory.

### Review controls

Each detected row can be unchecked, edited, and assigned a quantity/unit. Low-confidence or ambiguous rows require explicit review. GHM attempts exact-name-and-unit matching against existing shared inventory; manually changing a name or unit clears the match. Duplicate name/unit pairs must be combined or unchecked. New products are placed in a suggested category (or a selected existing section). No live store prices are requested.

New products added to a shopping list have **zero stock** and appear as **to buy**. Only confirmed physical-product photo imports to **Inventory** increase stock. Imports are applied atomically and respect existing house product and active-list plan limits. Existing shopping-list entries are combined using quantities instead of creating duplicate entries. All operations require membership in the house.

## Provider setup

Uses the existing DigitalOcean vision model configuration already used by Kitchen Vision:

- `DIGITALOCEAN_AI_ENABLED=true`
- `DIGITALOCEAN_INFERENCE_KEY=...`
- `DIGITALOCEAN_VISION_MODEL=...` (a model that accepts visual inputs and generates JSON)
- `DIGITALOCEAN_INFERENCE_BASE_URL=...`

An image scan makes **one potentially billed AI inference request per uploaded image**, regardless of how many rows are detected, and **no price-provider requests**. This version does not introduce separate per-plan camera-scan credits or persistent image-inference caching. Consider adding those protections and publishing limits before making the feature available to many users. The v136 trip-provider limits remain unchanged.

Output for handwriting is best effort, especially mixed-language or low-contrast photos. Users always need to confirm the preview. No stock or list writes occur when recognition fails, the user closes the popup, or the API is unavailable.

## Files

- `backend/app/utils/grocery_image_scan.py` — image preparation, AI prompt and output validation
- `backend/app/api/grocery_scan.py` — preview and atomic apply endpoints
- `backend/app/main.py` — route registration
- `frontend/src/components/GroceryPhotoScan.tsx` — scan-mode/target modal, upload and review
- `frontend/src/pages/ShoppingPage.tsx` and `InventoryPage.tsx` — entry points
- `frontend/src/theme-v137.css` and `main.tsx` — responsive light/dark styles
- `frontend/public/sw.js` — service worker cache version bump
- `backend/tests/test_grocery_scan.py` — unit and SQLite workflow tests

### API

`POST /houses/{house_id}/grocery-scan/preview` multipart (`image`, `mode=products|written_list`) returns recognized draft lines and warnings. This call never modifies household groceries. It can incur inference cost.

`POST /houses/{house_id}/grocery-scan/apply` JSON with the reviewed `items`, `mode`, `destination`, and optional `list_id`. `written_list` is restricted to `shopping` on the server. Items are checked for duplicates, ownership, plan limits and compatible units, then persisted together.

## Validation and deployment

Backend Python compilation and four updated frontend files' TSX syntax parsing passed. Six focused backend tests passed using a local test-runner substitute for the missing `python-jose` dependency; the ZIP includes real application imports and the original `python-jose` requirements specification. **A full Vite production build and complete test suite were not performed** because frontend `node_modules` and some Python runtime dependencies were not installed and this execution environment could not reach package registries.

Recommended steps: preserve production `backend/.env`, commit the modified source to GitHub, run CI, then update the droplet with `git pull origin main` and `docker compose up -d --build`. Test one printed shopping list, one handwritten list (including Gujarati/Hindi if needed), and one photo of multiple physical products. Check all three workflows and backend logs before advertising the feature.
