# V102 — One Free Premium Try

## Goal

Free Starter users can choose **one eligible premium experience** and use the real workflow **one successful time for free**. No card is required and using the try never starts a subscription.

This is designed to let a household experience premium value before deciding whether it is worth paying for.

## Rules

- Available to Free Starter accounts only.
- One Premium Try per account.
- The user chooses the premium experience.
- Choosing a feature does **not** consume the try.
- The user may change the selection until a successful premium workflow is completed.
- Failed, empty, unavailable, or cancelled attempts do not consume the try.
- The server records the successful use, so clearing browser storage does not reset it.
- House-level Premium Try workflows run only in a house owned by the Free user, matching GHM's owner-plan model.
- After use, the result can remain visible, but running the premium workflow again requires the appropriate subscription (or another applicable paid entitlement such as extra receipt scans).

## Eligible experiences

The chooser includes workflow-sized premium experiences that can produce a meaningful one-time result:

1. Smart Receipt Scan — Basic Home
2. Product Lookup — Basic Home
3. Whole-List Comparison — Family Plus
4. Live Grocery Price Compare — Family Plus
5. Weekly Flyer Intelligence — Family Plus
6. GHM Autopilot Planner — Family Plus
7. Smart Stock-Up — Family Plus
8. Smart Nearby Stores — Household Pro
9. Kitchen Vision — Household Pro

Passive subscription entitlements such as higher storage/house/member limits are not presented as a one-time try because they cannot be meaningfully experienced once without permanently changing account limits.

## User experience

### Dedicated chooser

`/premium-try` explains the offer in plain language:

> Try one premium feature once — free.

It groups options by the result a user wants, lets them choose an owned house, explains which paid tier would continue the workflow, and allows changing the choice before successful use.

### Contextual invitations

The Premium Try is surfaced where it is useful rather than only on a pricing page:

- More / mobile control centre
- Plans / Pricing
- How GHM Helps
- Receipt Scan
- Shopping / Whole-List Comparison
- Nearby store suggestions
- Market / Product Lookup
- Market / Live Price Compare
- Weekly Flyers
- GHM Autopilot Planner
- Smart Stock-Up
- Kitchen Vision

If the selected feature is opened, the primary action clearly states that the free Premium Try will be used and asks for confirmation where appropriate.

## Backend enforcement

User fields:

- `premium_try_feature`
- `premium_try_started_at`
- `premium_try_used_at`
- `premium_try_house_id`

The additive dev migration adds these columns to existing databases. Production deployments should apply the equivalent database migration before or with the backend rollout.

The client sends `X-GHM-Premium-Try: <feature_key>` only when the user explicitly starts the selected free workflow. The backend validates eligibility, selection, ownership and success before marking the try used.

Multi-step Kitchen Vision permits its immediate apply/review continuation for a short follow-up window after the successful trial scan.

## Conversion principle

After a user receives a real result, GHM should explain what the feature accomplished and which plan allows repeating it. The Premium Try never auto-subscribes and does not require a payment method.

## Validation

Run before deployment:

```bash
cd backend
PYTHONPATH=. pytest -q
PYTHONPATH=. python -m compileall -q app
```

Frontend deployment should use the normal project install/build pipeline:

```bash
cd frontend
npm ci
npm run build
```
