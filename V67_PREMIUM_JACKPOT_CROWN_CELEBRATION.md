# V67 — Premium Jackpot + Crown Celebration

## Premium header treatment
- Premium badge now has a restrained animated golden shimmer and glow.
- Crown uses a larger gold crown treatment that spans the upper portion of the profile avatar instead of appearing as a tiny icon.
- Crown has a recurring sparkle highlight and soft gold glow.
- These visuals remain exclusive to:
  - active admin-granted premium access (Basic, Family, or Household Pro), or
  - active Household Pro subscriptions.
- Basic Home and Family Plus paid subscriptions still do not receive the crown/badge unless the access itself is admin-granted.

## Premium award moment
- A newly crown-eligible account receives a one-time grand Premium Jackpot celebration.
- Celebration includes jackpot-style reels, confetti, animated crown/badge reveal, congratulatory copy, and Crown Member rarity.
- Crown and badge animate from the celebration card into their actual live header positions using measured DOM target positions.
- A Skip animation action is included so the effect never traps or slows the user.
- `prefers-reduced-motion` is respected.
- The award is remembered per user and award type in local storage so normal visits do not replay the celebration.

## Real rarity count
- `/account/bootstrap` now returns `premium_crown_stats` with:
  - `total_users`
  - `crown_users`
- Crown user count includes only active admin-granted premium users and eligible Household Pro users.
- Basic/Family paid users are not included in the crown population.
- The celebration uses these live values for: “one of X Crown Members out of Y total users.”
