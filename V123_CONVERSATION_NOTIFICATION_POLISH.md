# GHM V123 — Conversation + Notification Return + Mobile Chat Polish

## House Chat
- Mobile delete confirmation is now a compact centered dialog with the app blurred behind it.
- Composer input is taller and auto-grows for multi-line messages.
- `+`, message input and Send stay aligned on desktop and mobile.
- Reply still scrolls/focuses the message box.
- The `+` button now opens a full attachment picker instead of only a few recent records.
- Attachment picker supports shopping lists, receipts, recipes and shared expenses with category filters and search.
- Desktop hover sounds were removed.
- Mobile/touch audio arming is more reliable so interaction tones work after user interaction.

## Background-result notifications
- Clicking a ready-result notification stores a pending focus request before navigation.
- The destination watches for the actual hydrated result for up to 60 seconds.
- Result focus uses a MutationObserver + hydration event so one notification click should both navigate and focus/highlight the ready result.
- Assistant query parameters (`q`, `bgTask`, `focus`, `from`) are preserved when its house context initializes; this fixes a major reason focus was lost on first navigation.

## Tell GHM → Ask GHM
- Deep-question redirects now add an explicit `focus=ask` instruction.
- Ask GHM uses a real textarea ref with retries so redirected text is scrolled into view and focused reliably.

## Household Intelligence conversation
- Ask GHM now supports follow-up conversation instead of replacing the previous answer.
- Recent conversation turns are kept in session storage per household.
- A **New conversation** control clears context when the user wants to start fresh.
- Follow-up requests send recent user/assistant history to the backend Household Intelligence endpoint.
- Responses are rendered as organized headings, paragraphs and lists instead of raw blocks of text.
- Backend prompting explicitly asks for direct answers, short sections, bullets when useful, concrete household evidence and a concise `Next option` rather than raw/provider output.

## Tell GHM response presentation
- Quick Guidance uses the same structured answer renderer for clearer headings, bullets and short paragraphs.

## Validation
- Frontend TS/TSX syntax-transpile validation.
- Duplicate object-literal key scan.
- Backend Python compile check.
- Backend test suite: 19 tests.
