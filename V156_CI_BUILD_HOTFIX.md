# GHM v156 — GitHub Actions build hotfix (from v155)

## Changes

1. Removed the duplicated `const [adminView,setAdminView]=useState(...)` declaration in `frontend/src/components/AdminMerchOrdersPanel.tsx`. The v155 package declared it on consecutive lines, causing TS2451 redeclaration errors for `adminView` and `setAdminView` and preventing the frontend build.
2. CI now installs `libzbar0` and `tesseract-ocr` before backend tests. These are already installed by `backend/Dockerfile` and required to exercise the actual barcode decoder on the GitHub Ubuntu runner. This removes a known runtime mismatch, but **the original backend exit-code-2 traceback was unavailable publicly**, so this may not be its only cause.
3. The backend test command writes `backend-test-results.log` and uploads it as an Actions artifact named `ghm-backend-test-diagnostics` whenever a GitHub Actions backend job fails. This captures the real traceback for further investigation.

## Checks carried out here

- 91 frontend TypeScript/TSX source files parsed via the TypeScript compiler API, with zero parsing errors.
- Verified exactly one `adminView`/`setAdminView` state declaration in the merchandise admin orders panel.
- 66 backend tests passed in an isolated local test harness **using temporary substitutes for unavailable third-party authentication and Stripe libraries**. Those substitutes are NOT shipped in this ZIP.
- Python source compilation passed.
- Full TypeScript type-check, Vite production build, and GitHub Ubuntu tests **cannot be claimed as passed** until GitHub Actions runs with real dependencies. `node_modules` was not installed in the working environment and the package registry was unreachable.

## Installation

1. Back up your current checkout and database. Replace the repository source with the contents of this ZIP; do not overwrite `.env` files or other secrets.
2. Commit and push to GitHub.
3. In GitHub Actions → GHM quality gate, verify **both** frontend and backend jobs turn green before deploying. If backend still fails, download `ghm-backend-test-diagnostics` from that workflow run and inspect `backend-test-results.log` — share the first error traceback to fix the actual remaining cause.
4. After all checks pass, on the server:

   ```bash
   cd /var/www/grocery-house-manager
   git pull origin main
   docker compose up -d --build backend frontend
   docker compose ps
   ```

## No database migration or API configuration change

This hotfix only touches the duplicated React state declaration and the CI workflow. It doesn't alter Stripe payment handling, PrintKK, products, orders, database models, or real customer payment records.
