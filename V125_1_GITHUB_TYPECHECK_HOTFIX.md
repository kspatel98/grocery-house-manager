# GHM V125.1 — GitHub Type-check Hotfix

This release keeps the complete V125 Ask GHM chat-first redesign and fixes the GitHub Actions TypeScript failure:

`This comparison appears to be unintentional because the types '"plan" | "today" | "insights" | "spend" | "protect"' and '"intelligence"' have no overlap.`

## Root cause

V125 renders the Ask GHM chat-first screen in an early branch when `workspace === 'intelligence'` and returns immediately. In the remaining dashboard branch, TypeScript therefore narrows `workspace` to every other workspace. A legacy navigation button still tested `workspace === 'intelligence'` only to set its active CSS class. That comparison can never be true in that branch, so TypeScript 5.6 correctly rejected it.

## Fix

The stale active-state comparison was removed from the lower dashboard navigation button while retaining its click handler:

- Ask GHM still opens normally with `chooseWorkspace('intelligence')`.
- The chat-first Ask GHM screen remains unchanged.
- No database migration is required.

## Validation

- No `TS2367` / “types have no overlap” diagnostic remains.
- No `TS1117` duplicate object-property diagnostic is present.
- Backend Python compilation passes.
