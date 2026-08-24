# V68 — Mobile Premium Badge + Fixed Header

- Premium badge now remains fully inside the viewport on narrow phones.
- The brand row reserves a dedicated column for the Premium badge instead of allowing the website title to push it off-screen.
- Mobile brand sizing and typography are compacted without removing the Grocery House Manager identity.
- Mobile app navigation keeps horizontal scrolling, while the profile avatar/crown is pinned to a dedicated visible column.
- The avatar crown remains large and shiny but is positioned lower so it does not collide with the Premium badge row.
- Mobile headers now use `position: fixed` for reliable iPhone/iOS behavior.
- A measured spacer mirrors the real rendered header height so page content is never hidden underneath the fixed header.
- Header height automatically updates on resize/orientation changes and when responsive content changes.
- Public and authenticated headers use the same reliable mobile fixed-header behavior.
- Horizontal overflow uses `overflow-x: clip` to avoid creating an iOS scroll container that can interfere with header positioning.
