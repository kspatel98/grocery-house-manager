# V129.1 — selectedHouse CI hotfix

Fixes the frontend TypeScript build failure introduced in V129:

- `Cannot redeclare block-scoped variable 'selectedHouse'.`

`AssistantPage.tsx` had two `const selectedHouse = ...` declarations in the same component scope. V129.1 keeps the earlier declaration used by entitlement logic and removes the later redundant declaration. No product behavior or plan gating was changed.

No database migration is required.
