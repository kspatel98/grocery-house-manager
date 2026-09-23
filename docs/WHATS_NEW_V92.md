# Grocery House Manager v92 — Choice-Aware Autopilot polish

This update applies the latest product-direction request with a focus on:

- **Household choice controls** inside Autopilot
  - Strategy mode: Balanced / Lowest cost / Premium-familiar / Convenience
  - Max stores per trip
  - Preferred stores
  - Allow higher-cost preferred options
  - Allow split trips
  - Learning toggle so the system can adapt from real household choices
  - Community-recipe influence toggle

- **Choice-aware trip options**
  - Cost Saver
  - Balanced
  - My Usual / Premium
  - Users can intentionally choose a more expensive option
  - The app records that decision and updates the household pattern summary

- **Learning & pattern memory**
  - New decision log table stores Autopilot decisions by house/user
  - Household pattern summary explains what the system is learning

- **Kitchen Check Beta improvement**
  - Visible label matches
  - Review list
  - Possible new package clues
  - Suggested next actions
  - Still conservative: never deletes inventory automatically

- **Dark mode readability refresh**
  - Dark backgrounds for page/card/form areas
  - Better light text contrast
  - Stronger dark surfaces for key workflow cards
  - Improved readability for inputs, badges, chips and secondary buttons

## Main code areas touched
- `backend/app/models.py`
- `backend/app/db/dev_migrations.py`
- `backend/app/schemas.py`
- `backend/app/api/insights.py`
- `frontend/src/types.ts`
- `frontend/src/pages/AssistantPage.tsx`
- `frontend/src/styles.css`

## Notes
- The learning system is intentionally lightweight and explainable.
- It captures user preference signals without forcing them.
- Existing workflows remain unchanged; these additions sit on top of the current Autopilot experience.
