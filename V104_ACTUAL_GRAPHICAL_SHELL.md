# V104 — Actual Graphical Shell Activation

This release fixes the reason V103 could still look like the older app even though V100–V102 features were present.

## Root cause
V103 contained the newer V100/V101/V102 code, but the logged-in experience still defaulted to the older `Today` shell (`v95`/`v98`) and the old house hero was rendered above every tab. The new graphical Home existed only as a secondary `?tab=home` view, so most users could deploy the latest code and still see an interface that looked almost unchanged.

## What changed
- Graphical Home is now the default house view.
- The old V95 household hero is no longer shown above Home; Home gets a dedicated blue/cream/orange graphical hero.
- House/grocery artwork has its own isolated visual area and cannot overlap the Home statistics.
- The post-login Houses screen now has a visibly graphical V104 hero.
- Mobile bottom navigation is now `Home / Plan / Shop / Today / More`, removing the ambiguous old `Today / ... / Home` order.
- Existing mature specialist pages (Inventory, Receipts, Expenses, Meals, Market, Kitchen Vision, etc.) remain unchanged in behavior.
- Mobile More keeps the V100/V101/V102 graphical control centre and now shows `GHM design build V104` so deployment can be verified immediately.
- Service-worker cache bumped to `ghm-shell-v104`.
- Service-worker registration now uses `updateViaCache: none` to reduce stale-shell problems after deployment.

## Deployment
From the extracted V104 project folder:

```bash
docker compose down
docker compose build --no-cache frontend backend
docker compose up -d
```

After deployment, open **More** on mobile. If it shows `GHM design build V104`, the new frontend is actually being served.
