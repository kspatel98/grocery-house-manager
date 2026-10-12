# GHM V116 — Landing Scroll, Sidebar Tools & Intelligence Clarity

## Fixes

- Restored normal vertical scrolling on the public landing/marketing pages. V115's desktop viewport lock is now scoped only to the authenticated application shell.
- Preserved the requested independent desktop scrolling: the authenticated sidebar and main canvas still scroll separately.
- Rebuilt the desktop sidebar into three stable zones: brand, scrollable navigation, and account/footer controls.
- Expanding **Tools** now grows inside the sidebar navigation scroller and cannot overlap the language/theme/profile controls below it.
- Kept the Tools toggle and expanded links fully inside the sidebar width, including collapsed sidebar mode.
- Moved the sidebar collapse affordance inside the rail so it is no longer clipped by the independent-scroll container.
- Route changes now scroll the authenticated main canvas to the top instead of trying to scroll the locked browser window.

## Tell GHM vs Household Intelligence

- **Tell GHM** is now explicitly presented as **Quick Capture**: use it for quick household changes, commands, and routing to the correct workflow.
- Analytical/deeper prompts such as "why did spending increase?", "what should we buy this week?", forecasts, explanations, and trade-off questions are routed to **Ask GHM → Household Intelligence**.
- The question is carried into Household Intelligence automatically so the user does not need to type it twice.
- If Quick Capture returns guidance, it now labels that response **GHM Quick Guidance** and offers a direct path to deeper Household Intelligence.
