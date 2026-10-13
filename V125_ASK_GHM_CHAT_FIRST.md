# GHM V125 — Ask GHM Chat-First Household AI

V125 turns Ask GHM into a focused household-aware conversation workspace instead of placing the conversation beneath the Digital Twin dashboard.

## Ask GHM
- `Ask GHM` is now the primary Household AI conversation screen.
- Compact household selector, Household Insights shortcut and New Conversation control.
- Conversation-first layout on desktop and mobile.
- Recent turns stay connected so follow-up questions can be asked naturally.
- Contextual action buttons appear after answers and link to the relevant GHM workflows.
- The old Digital Twin / forecast dashboard is moved to a separate **Household Insights** workspace.
- Global Chat / Tell GHM floating buttons are hidden while Ask GHM is open so the AI conversation has a clear workspace.

## Automatic reasoning mode
GHM detects the likely intent of the current question:
- Intelligence — explanation / decisions
- Plan — meals / routines
- Save — prices / spending
- Protect — expiry / receipts / safety signals

The detected mode is shown as a compact chip. Users can override it and return to Auto.

## Household context picker
The `+` button beside the Ask GHM composer lets the user control which household records are brought into a turn:
- Inventory
- Shopping list
- Recent receipts
- Recent expenses
- Saved recipes

If the user does not choose manually, GHM selects the useful context categories automatically based on the question mode.

## Voice + composer
- Voice input is built directly into Ask GHM.
- Follow-up composer stays available at the bottom of the conversation.
- Ctrl/Cmd + Enter sends from desktop.
- Tell GHM deep-question redirects still land directly in the Ask GHM composer with the original question preserved.

## Backend Household Intelligence context
The Household Agent request now supports `mode` and `context_sources`.
The backend can include recent receipts, expenses and the user's saved recipes in addition to inventory, active shopping list and Digital Twin signals.
The AI prompt now explicitly requests consumer-ready formatting, evidence-based explanations and conservative safety language.

## Navigation
- `/assistant?view=intelligence` → Ask GHM chat
- `/assistant?view=insights` → Household Insights / Digital Twin
- Plan / Shop smarter / Protect remain separate operational workspaces.
- App shell titles and active navigation now distinguish Ask GHM from Plan.

## Validation
- Backend Python compile: pass
- Backend test suite: 19/19 pass
- Frontend TS/TSX syntax transpilation: pass across 75 source files
- Duplicate object-literal key scan: 0
- V125 CSS brace validation: pass

No database migration is required.
