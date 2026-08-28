# V72 — Active Home switching + reliable desktop More

## Why this release exists
V71 simplified the app navigation, but two workflow problems remained for users with multiple Homes:

1. Inventory and Shopping inherited the first Home when opened from global navigation and did not provide a fast Home switcher.
2. The desktop More menu could be clipped or fail to behave consistently inside the sticky application header.

V72 fixes both at the navigation/context level.

## Active Home behavior
- Inventory and Shopping now include a compact **Working in** Home selector.
- Users with multiple Homes can switch Home without returning to the Home list first.
- The selected Home is saved locally as `ghm_active_house_id` and becomes the remembered context for global Inventory, Shopping, Assistant, Scan Receipt, and Receipt History links.
- Visiting any `/houses/:houseId/...` route also updates the remembered active Home.
- Account bootstrap validates the remembered Home against the user's current memberships. If access was removed, the app safely falls back to the first available Home and updates the remembered value.
- Switching Home clears page-local Inventory filters and Shopping list state before loading the new Home so stale data is not displayed under the new context.
- A **Manage Homes** shortcut remains next to the selector for users who want the full Home-management page.
- Single-Home users see the current Home context without unnecessary switching controls.

## Desktop More menu
- Replaced native `<details>` behavior with a controlled React menu.
- Opens and closes reliably by click.
- Closes after choosing an item, clicking outside, pressing Escape, or navigating.
- Includes Profile along with the secondary app destinations.
- Fixes desktop header overflow/clipping so the popover can render above page content.
- Preserves the V71 mobile More bottom sheet unchanged.
- Adds focus-visible styling and ARIA menu semantics.

## Validation
- Backend Python compilation passes.
- All frontend TS/TSX source files pass TypeScript syntax transpilation.
- Full stylesheet parses with zero CSS syntax errors.
- A full npm production build still depends on installing the locked frontend dependencies; dependency installation timed out in this packaging environment and partial dependency files were removed before packaging.
