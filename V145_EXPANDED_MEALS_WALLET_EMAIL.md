# GHM v145 — Expanded Vegetarian Links & Wallet Header

Base: v144. No changes to subscriptions, House Tokens balances, credits, or payments.

## Meals updates

- 36 source-linked individual dishes seeded automatically at startup (11 previously integrated GHM cooking cards + 25 additional independently linked dishes). They are source-link discovery, NOT 36 copied or fully integrated recipe instructions.
- Existing 11 GHM recipes retain GHM-authored quantities, interactive grocery-list actions, and House Chat.
- Additional dishes open the original author’s full cooking guide, steps, photos, and available videos. No copying/hosting of third-party recipe methods, images, video, or ingredient tables.
- Direct category links to the publisher's index across rice, Indian breads, dal, snacks, South/North Indian, desserts, eggless baking, vegan, and no-onion/no-garlic. Category links are outbound, not imported recipes.
- Search, backend pagination, category filters; no hard 100-row limit. Original-source entries never silently use inaccurate GHM grocery estimates.

## Optional sitemap-based link-only import (one-time, not scheduled)

The repo ships `backend/sync_recipe_source_index.py`. It *only* reads the publisher's public XML sitemap and adds outbound recipe URLs with slug-derived titles. It does not request individual recipe pages and does not import protected instructions, photos, videos, or ingredient data.

From the Docker host, after you have deployed and confirmed the backend is healthy:

```sh
# Check the publisher's sitemap structure without changing the database.
docker compose exec backend python sync_recipe_source_index.py --dry-run

# When that reports post-sitemaps, optionally import at most 1,500 URL references.
docker compose exec backend python sync_recipe_source_index.py --limit 1500 --delay 1
```

The script has an allowlisted HTTPS host, bounded document size, capped sitemap count and URL count, and deduplicates existing links. Re-running it is safe against duplicate URLs. Respect the source site's access restrictions, robots requirements, and publishing terms. If the sitemap changes, redirects, or returns 403, the tool fails without trying to bypass it. **No copyrighted source text or images are downloaded**.

For broader coverage after checking performance and publisher restrictions, you can change `--limit` to at most `4000` and run it again. This still cannot guarantee every recipe is indexed or reachable. The author's site remains the definitive source and GHM should attribute the links.

### Important limitation

The optional import does not auto-produce interactive ingredient shopping plans for every linked dish. Complete GHM cooking cards require separate independently written and tested data, or a commercial licence from the original publisher.

## Wallet header

The top-bar Wallet shortcut (mobile and desktop) now uses a drawn wallet icon. The original green-and-gold branded GHM Token remains inside the wallet as a currency image. Colours respond to light and dark themes.

## Residential mailing address for promotional offers

No home address has been added or logged. GHM's marketing-email sending requirement remains unchanged: `GHM_BUSINESS_MAILING_ADDRESS` must be set to a real address and the sender must confirm an appropriate consent basis, sender identification, and unsubscribe mechanism. Using a residence is possible, but recipients and anyone they forward mail to will see it; the address could also be shared publicly. The CRTC confirms a different valid mailing address can be used if it is reachable and valid for 60 days. Only set the variable in the private server environment when comfortable; never commit a residential address into GitHub.

## Validation

- Backend Python source compilation: passed.
- v144 link-catalog regression test: passed with 36 starter links.
- v145 sitemap metadata-index safety test: passed with mocked XML, duplicate protection and untrusted URL rejection.
- Modified TSX TypeScript syntax transpilations: passed.
- Full production frontend build and live sitemap import against the publisher: not verified in this environment.

## Deployment

Push the updated source to GitHub; preserve the server `.env` files and any local customizations. In your DigitalOcean working directory, run `git status` first; if there are local changes to tracked files, review or stash those deliberately before `git pull origin main`.

Then `docker compose up -d --build` and `docker compose ps`. Test Meals search, 11 existing interactive cards, source-only links, header icon, and verify backend health. To index more recipes, run the optional sitemap import after deployment, not as part of normal app boot.
