# GHM V128 — Outcome-first onboarding and activation

V128 applies the strongest product lessons from PantryAI without copying its UI or narrowing GHM's product scope.

## What changed

### 1. New value-first onboarding
New/empty Grocery Homes now receive a six-screen personalization flow:
1. Choose up to three outcomes that matter most.
2. Choose the biggest household grocery frustration.
3. Select the household's cooking rhythm.
4. Describe what normally happens to grocery receipts.
5. Indicate where recipes currently live.
6. Review a personalized first GHM focus.

The questionnaire is intentionally outcome-first rather than feature-first. Users are not taught every GHM tool during setup.

### 2. Preferences persist with the Grocery Home
The existing `houses.onboarding_preferences_json` field is now used to store onboarding goals and habits.

New API:
- `POST /insights/onboarding/preferences`

No new database column or migration is required because the preferences field already existed in the project.

### 3. Existing active households are protected
V128 does not force the new questionnaire on established households. A home that already contains meaningful activity (inventory, receipts, an active shopping list, or multiple members) is treated as already past the personalization stage.

### 4. Activation before Premium
After personalization, the setup asks the user to perform one real action:
- Scan a receipt
- Add five groceries
- Use Kitchen Vision

Then it asks for one real shopping list.

Only after the Grocery Home has useful context does the completion card suggest:
- Ask GHM something real
- Try one Premium workflow

Premium Try remains success-based and does not require a payment card.

### 5. Public marketing simplified
The landing page now leads with the consumer outcome:
- what your home has
- what it needs
- what it buys
- what it cooks
- what it spends

A simple four-step explanation was added:
Scan or add → Know → Plan → Save time.

### 6. Pricing language simplified
Plans are now positioned around outcomes:
- Free Starter: organize the household
- Basic + Family: automate the household
- Household Pro: optimize the household

The existing detailed plan and feature matrix remains available below.

### 7. Localization
New V128 onboarding, activation, public marketing and pricing copy has Gujarati, Hindi and French translations in the existing localization system.

## Validation
- Backend tests: 19/19 passed
- Backend Python compilation passed
- 75 frontend TS/TSX source files syntax-transpiled with zero errors
- Duplicate object-literal keys: 0
- V128 CSS brace validation passed

## Files substantially changed
- `backend/app/schemas.py`
- `backend/app/api/insights.py`
- `frontend/src/types.ts`
- `frontend/src/components/FirstRunSetup.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/PricingPage.tsx`
- `frontend/src/localizationV118.ts`
- `frontend/src/main.tsx`
- `frontend/src/theme-v128.css`
