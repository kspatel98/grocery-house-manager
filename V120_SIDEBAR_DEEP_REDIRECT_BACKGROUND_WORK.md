# GHM V120 — Sidebar fit, deep-question redirect, background work

## Desktop sidebar
- Compacts the Grocery House Manager badge so it uses less vertical height.
- Makes the Household Pro/Premium tag thinner with smaller padding and type.
- Compacts main navigation spacing enough that Home, Plan, Shop, Scan and More fit together on normal laptop-height viewports.
- Retains a thin fallback sidebar scrollbar only for unusually short windows instead of hiding navigation.
- Keeps the profile card fixed at the bottom.

## Tell GHM → Household Intelligence handoff
- Deep questions are detected before Tell GHM calls the AI endpoint.
- Tell GHM no longer spends time generating a duplicate deep answer.
- First time: shows a clear redirect card with a button to Household Intelligence.
- Includes **Always redirect deep questions automatically on this device**.
- When automatic redirect is enabled, GHM shows a short **Redirecting to Household Intelligence…** screen, clears Tell GHM, then opens the Household Intelligence Ask GHM box with the exact original question already filled in and focused.
- Tell GHM shows a small **Turn off** control whenever automatic deep-question redirect is enabled.

## Long-running work
V120 adds a shared in-app background task manager for workflows that can legitimately take longer than ~45–50 seconds.

Integrated workflows:
- GHM Household Intelligence
- Household weekly plan generation
- Smart Receipt Scan / OCR
- Kitchen Vision analysis
- Live grocery price comparison
- Whole-shopping-list basket comparison

Behavior:
- The user is told that the operation can take longer and that they may continue using GHM.
- Navigating to another GHM page does not discard the active request.
- Results are retained in the current app session and, when practical, cached in browser storage.
- When a user has left the source page (or a task takes at least 45 seconds), the global notification bell receives a **RESULT READY** notification.
- Clicking the notification returns to the exact result screen and restores the result for review.
- Failed background-capable tasks also surface through the notification center.

### Scope note
This is an **in-app background workflow** designed for navigating around GHM while work continues. It does not introduce Redis/Celery or a separate durable server-side worker queue, so closing/reloading the browser while a request is actively running can still interrupt that specific request. A durable external worker queue can be added later if GHM needs jobs to survive browser closure or backend restarts.

## Validation
- Frontend TS/TSX syntax transpilation passed across 71 source files.
- Backend Python compilation passed.
- V120 CSS brace validation passed.
