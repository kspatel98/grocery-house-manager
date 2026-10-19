# GHM v143 – Search visibility foundations and GHM Guides

## What changed

- **21 public entrypoints:** `frontend/scripts/prerender-public.mjs` produces route-specific **initial HTML** (title, description, canonical, social metadata, on-page summary). This is build-time HTML, not full React SSR; the existing React app replaces the initial public-page content on load. All existing authenticated app routes are unchanged.
- **Public guide content hub:** `/guides` and `/guides/{slug}` are full **server-rendered HTML** served through the existing FastAPI backend. Google can read guides even without executing JavaScript.
- **Six original starter articles** covering handwritten lists, roommate grocery cost splitting, pantry tracking, cooking from available food, receipt organization, and shared family lists. These are practical starter guides, not claims of proven rankings or traffic.
- **Admin > GHM Guides:** create, edit, preview, upload cover images, save drafts or publish. Articles are stored in PostgreSQL, so publishing guide edits does not require a frontend deploy.
- **Dynamic guides sitemap:** `/guides-sitemap.xml` includes only published guides, with update dates. `robots.txt` references both the existing core sitemap and this one.
- **Private route noindex:** Caddy sets `X-Robots-Tag: noindex, nofollow` for protected SPA routes.
- The public navigation and footer link to the new Guides hub.

## Deployment / staging steps

1. Back up and preserve the existing DigitalOcean `backend/.env` and `frontend/.env`; do **not** overwrite production secrets with sample files.
2. Commit the v143 source changes to GitHub. On the server, run `git status` before `git pull`; reconcile local tracked-file changes rather than using `git reset --hard`.
3. Run `docker compose up -d --build` after pull, then check `docker compose ps` and `docker compose logs --tail=100 backend`.
4. On initial backend startup, `GuideArticle` table is created through the existing `Base.metadata.create_all` process and six guides are inserted only if no guide records exist. Existing data is not overwritten.
5. Confirm `https://grocery-house-manager.com/guides` returns full HTML and six visible guides, even with JavaScript disabled.
6. Confirm `https://grocery-house-manager.com/guides-sitemap.xml` returns XML, and `https://grocery-house-manager.com/sitemap.xml` continues to work.
7. Verify individual feature pages return correct initial title, canonical and description by viewing **page source** (`curl -L -s https://.../receipt-scanner | head`) rather than relying only on Inspector after React boots.
8. Log in as GHM platform admin and test Admin > GHM Guides: create draft, preview, upload image, publish, edit, and check the dynamic sitemap. Log out and confirm unpublished drafts cannot be opened.
9. In Google Search Console: submit `sitemap.xml` and `guides-sitemap.xml`; inspect `/guides` and important feature URLs. Check Page indexing, impressions and clicks over 60–90 days. Indexing and traffic are not guaranteed.

## Verification completed in this build environment

- Python backend compileall passed.
- Focused SQLite tests passed for seeding, rendering, draft privacy, sanitized Markdown and dynamic sitemap.
- Build-time HTML generator created 21 page entrypoints and a metadata test verified the handwritten-scanner page canonical/title/description.
- The three modified frontend TSX files passed TypeScript **syntax/transpile** checks.
- **Full frontend production build not verified:** `npm ci` could not finish in the container; the resulting incomplete `node_modules` prevented a full `tsc -b && vite build` test. Validate in GitHub Actions and staging before production.
- Live Caddy routing, real PostgreSQL migrations, Search Console indexing, and live image upload still require staging verification.

## SEO notes / limits

- Static public-page generation is run **after** `vite build` as part of `npm run build` and works with the existing static Vite preview service. Verify direct deep-link requests on staging; the deployed frontend must serve the route's `index.html` instead of the SPA fallback.
- The guides use an independent backend renderer to avoid requiring a Git deployment for article changes.
- No invented SoftwareApplication ratings, fake review stars, guaranteed savings, or deprecated HowTo-rich-result promises were added.
- The first six guides are short practical starting points; expand them over time with original screenshots, examples and first-hand knowledge.
- Search Console metrics are **not** pulled into Admin in this release. Google Search Console remains the source of truth for actual impressions and clicks.
