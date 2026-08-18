# v54 Notification, Reviews, and Profile Header Polish

## Added

- Horizontal notification picture slider on the Houses page.
- Automatic 3-second sliding with manual control dots.
- New-user Basic Home offer notification:
  - Visible only when the account is not subscribed.
  - Visible only while the 14-day new-user offer is active.
  - Shows remaining days before the offer expires.
- Community statistics notification:
  - Total website users.
  - Users joined this month.
  - Overall average rating.
  - Best positive public review comment.
- User review system stored in the database:
  - Users can save/update one public review.
  - Public reviews are shown on the Houses page.
  - Summary API powers the website statistics notification.
- Profile moved out of the main header navigation.
- Profile is now shown as a circular top-right avatar button.
- If no profile image exists, the app displays a styled AI avatar/initials circle.

## Backend

New table:

- `site_reviews`

New endpoints:

- `GET /reviews/summary`
- `GET /reviews`
- `POST /reviews`

## Frontend

Updated:

- `frontend/src/components/AppFrame.tsx`
- `frontend/src/pages/HousesPage.tsx`
- `frontend/src/types.ts`
- `frontend/src/styles.css`

## Checks

- Backend Python compile check passed.
- Frontend production build was not completed in this sandbox because npm dependency installation was unavailable here.
