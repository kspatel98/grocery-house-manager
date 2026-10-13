# GHM V121.1 — GitHub quality hotfix

This hotfix fixes the GitHub Actions frontend failure from V121.

## Fixes
- `ShoppingPage.tsx`: explicitly narrows the `bgTask` query value before passing it to `announceBackgroundResultHydrated`, fixing TypeScript error: `Argument of type 'string | null' is not assignable to parameter of type 'string'.`
- `.github/workflows/quality.yml`: upgrades `actions/setup-python@v5` to `actions/setup-python@v6` to avoid the Node.js 20 action-runtime deprecation warning shown by GitHub.

No database migration is required.
