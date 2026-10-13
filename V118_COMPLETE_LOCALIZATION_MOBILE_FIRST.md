# GHM V118 — Complete Localization + Mobile-First Polish

V118 builds on V117/V116 without removing the product-identity, provider, reliability, focused grocery-list, notification, graphite-dark, Tell GHM, or Household Intelligence work.

## 1. Full four-language UI consistency

GHM now treats the selected language as an app-wide setting across the authenticated app, public pages, overlays, drawers, dialogs, notifications, onboarding, status messages, and major dynamic labels.

Supported UI languages:

- English
- ગુજરાતી
- हिंदी
- Français

The language picker always shows each language in its own native name so it remains recognizable even after switching languages.

### Localization improvements

- Expanded the shared localization catalog across Home, Houses, Inventory, Shopping, Receipt Scan/History, Meals, Expenses, Prices & Flyers, Reports, Profile, Reviews, Support, Pricing, Learn GHM, Premium Try, Appearance, Kitchen Vision, Food Tonight, Templates, House Chat, Admin, public landing/feature pages, and legal pages.
- Added translations for dynamic counts, member states, receipt quota/status strings, greetings, product-row summaries, forecast labels, shopping comparison states, notification copy, setup/onboarding labels, and other interpolated UI text.
- Portal-rendered content is translated as well, so dialogs/drawers no longer fall back to English simply because they render outside the normal page tree.
- `placeholder`, `title`, and `aria-label` strings participate in localization.
- Page metadata/title/description follows the selected UI language where translated copy exists.
- Household Intelligence / agent requests now carry the selected language to the backend and request a response in that language.
- Tell GHM speech recognition follows the selected language (`en-CA`, `gu-IN`, `hi-IN`, `fr-CA`).
- Weekday names and other locale-sensitive assistant content use the selected app language.
- Recipe UI uses the shared app localization while detailed recipe instructions continue through the recipe localization pipeline.

GHM deliberately does **not** translate user-entered data, household names, product/brand names, email addresses, URLs, geographic values, postal codes, Stripe, SupremDas Group, or other proper identifiers.

## 2. Mobile-first page-by-page layout pass

V118 applies a dedicated mobile layout pass rather than relying on desktop styles compressed onto a phone.

### App shell / header

- Compact sticky authenticated mobile header.
- Language, light/dark mode, notifications, and profile remain accessible without opening More.
- Mobile title row is visually separated and readable.
- Bottom navigation uses consistent touch targets and spacing.
- Header no longer needs the old artificial spacer while sticky.

### Home / household dashboard

- One-column information hierarchy.
- Stats and household controls wrap safely.
- Member controls, cards, and actions keep consistent margins.
- No horizontal overflow from desktop-sized card groups.

### Houses / switchboard

- House cards and actions collapse into a clean phone layout.
- Long names and status text wrap instead of pushing controls off-screen.

### Inventory

- Search/filter/actions stack safely.
- Product cards, filters, and edit controls keep usable touch sizes.
- Long product/store text no longer forces horizontal overflow.

### Shopping

- Shopping list library is mobile-safe.
- Opening one list becomes a true focused full-screen workspace on phones.
- List header/close controls remain visible while list content scrolls.
- Smart comparison sections and action rows wrap consistently.

### Receipt Scan / receipt review

- Receipt workflow tabs and quota strip fit narrow screens.
- Upload, trip details, receipt preview, and review sections use a one-column reading order.
- Receipt preview no longer uses a bright unreadable white paper in dark mode.
- Dark receipt paper uses high-contrast text and separators.
- Reconciliation rows and receipt-to-expense prompts stack cleanly.

### Meals

- Meal controls and library/detail sections collapse to one column.
- Cards/actions avoid tiny side-by-side controls on narrow phones.

### Ask GHM / Household Intelligence

- Prompt controls, forecast cards, guardian cards, and result sections use full-width mobile layouts.
- Long intelligence content can scroll without pushing actions off-screen.

### Expenses

- Expense books, split controls, reimbursement summaries, and insights become one-column layouts where needed.
- Data-heavy rows remain scroll-safe instead of clipping.

### Prices & Flyers

- Postal/store filters, retailer chips, flyer results, and product lookup results wrap cleanly.
- Wide result/table-like sections get intentional horizontal scrolling when collapsing them would damage readability.

### Reports / Profile / Reviews / Support / Pricing

- Controls and cards use consistent mobile spacing.
- Pricing cards, review controls, profile sections, and report filters no longer inherit awkward desktop widths.

### Kitchen Vision / Food Tonight / Templates / House Chat

- Converted major two-column structures to mobile reading order.
- Fixed controls, cards, and action rows that could become too small or overlap.

### Login / onboarding / Learn GHM / Premium Try / Appearance / public pages / Admin

- Added responsive spacing and one-column layout rules.
- Admin tables intentionally scroll horizontally rather than squeeze unreadably.
- Public landing/feature pages stay one-column and scroll normally on phones.

## 3. Dialog, drawer and card behavior

- Mobile dialogs, sheets, member drawers, focused forms, Tell GHM, More, and grocery-list workspaces fit the viewport.
- Close/title rows are sticky so the close button cannot disappear above the screen.
- Inner content scrolls while the background remains controlled.
- Safe-area aware padding is used around phone edges.

## 4. Header and sidebar refinement

- Desktop sidebar footer contains only Profile.
- Language and theme are in the header/topbar.
- Main navigation has more usable vertical room.
- Expanded Tools stays inside its own contained list and does not overlap Profile.
- Quick Add, Ask GHM, and Scan Receipt retain recognizable icons and accessible labels.

## 5. Tell GHM microphone

- Uses the supplied microphone artwork inside the message box.
- The icon automatically inverts/brightens in dark mode for visibility.
- Speech recognition follows the selected UI language.

## 6. Members

- Cleaner member-card spacing and padding.
- `Invite someone` is available directly in the Members area.
- Member drawer actions are mobile-safe and the close control remains visible.
- The duplicate home invite call-to-action was reduced in favor of managing invitations through Members.

## 7. Validation

- Frontend TypeScript/TSX syntax transpilation passes for all non-declaration source files.
- Backend Python compilation passes.
- Backend automated test suite: **19 passed** with test environment values.
- Product identity/provider tests: included in the 19-test pass.
- V117 and V118 CSS brace validation passes.
- Localization supplemental catalog duplicate-key audit passes with zero duplicates.

A full production `npm run build` is not run in this isolated workspace because frontend `node_modules` are not installed here. The unchanged lockfile remains the source of truth for the normal Docker build/deploy step.

## Database migration

No database schema migration is required for V118.
