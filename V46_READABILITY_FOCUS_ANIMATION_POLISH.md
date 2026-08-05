# V46 Readability, Focus, and Animation Polish

## What changed

- Improved the Scan receipt module card so "Review before saving" is readable on the featured card.
- Improved the receipt review studio background, header contrast, labels, and mobile field labels.
- Removed the nested recent activity card layout on the house dashboard.
- Member actions now scroll/focus users directly to the opened members drawer.
- Invite actions now scroll/focus users to the copied invite message.
- Activity modal now receives focus after opening.
- Main app and public page navigation now scrolls to the top after route changes.
- Header and footer received stronger professional visuals:
  - sticky animated glass header
  - animated gradient underline
  - polished navigation pills
  - animated logo treatment
  - graphical footer panels and hover effects
- Added reduced-motion support so users who prefer less motion are respected.

## Checks

- Backend Python compile check passed.
- Modified frontend files were syntax-checked with the TypeScript compiler API.
- Full frontend production build was not completed in the sandbox because npm dependency installation used an unavailable internal package registry.
