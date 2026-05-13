# UI description — F&B Control Pane

A description of every screen in the system, written so a generative design
tool (Stitch, Galileo, v0, Figma Make) can produce a modern redesign without
having to read the codebase. Covers the **customer ordering** flow and the
**staff dashboard** (POS, kitchen, online-order acceptance, and the back-office
surfaces around them).

## Product context

A multi-tenant restaurant operating system. One tenant = one restaurant group.
Inside a tenant there are one or more **locations** (e.g. "Acme — Mission St",
"Acme — Castro"). Five user roles in descending privilege:

- **Owner / Admin** — tenant-wide; touches everything including billing.
- **Manager** — location-scoped; runs the day-to-day, sees insights and
  history, can close/refund/discount tickets.
- **Staff** — location-scoped server or cook; works POS, KDS, floor.
- **Viewer** — read-only insights for stakeholders.

The customer side is **anonymous** — no account. A QR code at the table or
counter takes the guest straight to the storefront.

## Current design language

- **Type system:** Inter for UI, JetBrains Mono for tabular numbers.
- **Colour:** OKLCH-based tokens with a light/dark mode split. Primary is a
  rich blue (~hsl 220 90% 55%). Surfaces are bone-white in light, near-black
  in dark. Accents: emerald for success/served, rose for danger/voids, amber
  for "in flight" or warnings.
- **Component library:** shadcn primitives (Dialog, Dropdown, Sheet,
  Popover) on Radix. Tailwind utility classes everywhere; no CSS modules.
- **Tone:** calm and clinical — closer to Linear/Notion than to a flashy
  consumer app. Plenty of whitespace. Counts and badges are tabular-num.
- **Inspiration we benchmarked against:** Clover POS for the staff side,
  Toast / Square for online ordering, Resy for reservation flows.

## Customer-facing screens

### 1. Storefront / menu — `/order/{tenant}/{location}`

The first screen after a QR scan. Anonymous; no auth.

**Layout (desktop, ≥ 1024px):**
- Sticky header (white, 64px tall): tenant name and location name on the
  left, a Cart pill button on the right showing item count + running total.
- Below the header, a "Location hero" card: tenant name (24px bold), the
  location subtitle, a row of metadata chips (Pickup / Pay on pickup /
  Currently open · closes 9pm), a small grid of address / phone / today's
  hours.
- Then a full-width **search input** ("Search the menu…") with a magnifying
  glass icon.
- Two-pane grid below:
  - **Left rail (240–256px wide):** vertical category nav. Top entry is
    "All items" with a 4-square grid icon. Below it, each menu section
    (Drinks / Starters / Mains / Sides / Desserts). Each row is ≥72px
    tall, semi-bold 18px text, generous left padding (24px). The active
    row has a tinted primary background + a 4px primary-blue accent bar
    pinned to its left edge. Hover reveals a faint accent at 30%
    opacity. No counts shown.
  - **Right pane (fluid):** a 3-column grid of menu-item tiles, each
    section's items grouped under a 20px section heading.
- **Sticky bottom bar** (only appears once the cart has something in it):
  full-width white bar with the item count (small, muted) above the
  running total (20px bold), and a large primary "Review order (N)"
  button on the right.

**Menu item tile:**
- Vertical card, 280–320px tall, soft rounded corners (12px), 1px border
  in light mode, subtle shadow on hover.
- Top 60% is a full-bleed food photo (4:3 ratio).
- Bottom 40% is white: item name (2-line clamp, 14px semibold), short
  description (12px muted, 2-line clamp), price (16px bold) on the left,
  a row of dietary/allergen chips on the right (V / VG / GF on emerald
  background, allergen names like "Dairy"/"Gluten" on rose).
- Floating **+ button** in the bottom-right corner of the photo: 36px
  primary-blue circle with a white plus. On hover it scales 110%.
- When the item is in the cart, the tile gains a primary-tinted ring and
  a count badge at the photo's top-right ("×2" in white-on-primary).
- Items that have modifier groups (size, milk, sides) open a picker
  dialog when tapped. Items without modifiers add directly with a toast.

**Mobile (< 768px):**
- Left rail collapses to a horizontal scrollable strip of pill buttons.
- Grid becomes 2 columns.
- Header collapses but the cart pill stays.

**Empty / loading states:**
- Empty: a card saying "Nothing on the menu right now — we're between
  services. Please check back during opening hours."
- Closed location: red banner across the top, "We're not taking orders
  right now — Currently closed. Opens tomorrow at 7am."

### 2. Item modifier picker (modal dialog)

Tap an item that has size/milk/toppings/etc. A center-screen dialog (max
~480px wide) slides up.

- Header: item name (20px bold), price below, X close button top-right.
- Body: one section per modifier group. Each section has its name (semi-
  bold) and a rule label on the right (e.g. "Required, exactly 1" or
  "Optional, up to 3").
- Each modifier is a 2-column tile (rounded rectangle): name on top
  (semi-bold), price delta below (`+$0.50` / `No charge`).
- Selected tiles flip to primary background with white text and a small
  check icon in the corner.
- Footer: "Cancel" outline button on the left, primary "Add to cart"
  button on the right, disabled until all required groups have minimum
  selections.

### 3. Cart drawer (slides in from the right)

- Width 400–480px, full viewport height.
- Header: "Your cart (3 items)" + a subtitle showing the location.
- A scrollable list of line items:
  - Item name (bold) + modifiers below in lighter text
  - Quantity stepper (minus / number / plus) on the left
  - Line subtotal on the right (tabular-nums)
  - Trash icon to remove the line
  - Optional notes field expands on click
- Footer pinned at the bottom:
  - Subtotal row
  - Small muted paragraph: "Tax and final total are confirmed at pickup."
  - If location is closed, a red banner: "This location is currently
    closed for online orders."
  - Primary "Checkout" button (shows a spinner + "Opening checkout…" if
    the next page is loading).
  - Ghost "Continue shopping" button below.

### 4. Checkout page — `/order/{tenant}/{location}/checkout`

- Hero strip at the top with tenant + location, same as storefront.
- Two-column form on desktop, single column on mobile:
  - Left column: form fields
    - Name (required)
    - Phone (required, Mexican format: `+52 55 1234 5678` placeholder)
    - Email (optional)
    - Pickup time — radio between **ASAP** and **Scheduled**. When
      Scheduled is chosen, a date+time picker appears with valid windows
      (15 min from now → 7 days out).
    - Order notes (textarea, 500 char limit)
  - Right column: order summary
    - One row per line item with qty + name + price
    - Subtotal / Tax / Total at the bottom, total in bold
    - Sticky on desktop
- Primary "Place order" button at the bottom of the form, full width on
  mobile.

### 5. Order confirmation — `/order/{tenant}/{location}/confirmation/{token}`

Customer-facing success screen. No cart in the header (it's empty now).

- A centered hero card with a circular success check (emerald), heading
  "Order placed" (20px), large order number in tabular (`#11` at 32px),
  and a friendly subhead: "The kitchen will confirm your order shortly.
  You'll see status updates on the tracking page."
- A 3-step preview card (ordered list with circular icons):
  1. Submitted ✓ (filled icon)
  2. Kitchen confirms (outlined, "Usually within a couple of minutes.")
  3. Preparing (outlined, "We'll let you know when it's ready for pickup.")
- A "Save your tracking link" card:
  - The full tracking URL in primary-blue, underlined
  - Two side-by-side buttons: primary "Track this order" + outline "Copy
    link" (clipboard icon).

### 6. Order tracking page — `/order/.../track/{token}`

Polls the server every 5 seconds.

- Header strip: greeting ("Hi Subhash") or fallback "Order status", a
  small `#11` chip on the right, and a quiet "Updated 4s ago" line with
  a refresh icon that animates when fetching.
- 5-step stepper (horizontal pills):
  1. Received (shopping bag icon)
  2. Confirmed (chef hat icon)
  3. Preparing (flame icon)
  4. Ready (check icon)
  5. Picked up (party popper icon)
  The current step is filled (primary-tinted background, primary text);
  earlier steps are also filled; later steps are muted card-coloured.
- A status banner below the stepper changes contextually:
  - "Your order is ready for pickup!" — primary-tinted banner when
    `Ready` is the active step.
  - "Order complete — thanks for stopping by!" — emerald banner with a
    party-popper icon when the ticket transitions to `Picked up`.
  - "Order rejected" — destructive-red card with the reason if applicable.
- Below: a card listing the items (read-only summary), a card with
  Subtotal / Tax / Total.
- A "View / print receipt" outline button at the bottom that links to
  the receipt page.
- **Loading state** (before the first response): a pulsing skeleton
  version of the same layout — three blurred-out grey blocks where the
  cards would be, plus a "Finding your order…" caption above. Stays in
  this state for up to 20 seconds before showing "Order not found", to
  cover the brief window where the freshly-created row isn't yet visible
  to the public token-based lookup.

### 7. Receipt page — `/order/.../receipt/{token}`

A printable summary. Plain, no chrome:
- Tenant name + location at the top, address + phone underneath.
- Order number, server name (if any), date.
- Line items with qty / name / modifiers / unit price / subtotal.
- Discounts, tip, tax, grand total.
- Closed-at timestamp.
- A "Print receipt" button at the top right (hidden when printing via
  `@media print`).

---

## Auth screens

### Sign-in — `/sign-in`

- Centered card, ~400px wide on a muted background gradient.
- Heading "Sign in" (24px bold), subtitle "Welcome back. Enter your
  credentials to continue." (14px muted).
- Form: email + password fields, both with floating labels.
- Primary "Sign in" button full width.
- Below: a "Forgot your password?" link, centred and muted.
- Error banner (rose) appears above the form on invalid credentials.

### Other auth flows

- **Forgot password** — single email field + send link.
- **Reset password** — new password + confirm.
- **MFA** — TOTP code input (6 digit cells).
- **Sign up / invitation** — captures name, password, organization on
  invitation acceptance.

---

## Staff app shell — every authenticated page

After signing in, every page is wrapped in this shell:

- **Left sidebar (240px, sticky, full-height):**
  - Brand wordmark at the top ("F&B Control Pane").
  - A grouped navigation list. Section titles are 11px uppercase muted.
    Each item is a row with an icon + label, ~40px tall, full-width
    clickable. Active item gets a primary-tinted background.
  - Groups (role-dependent — staff sees only the first two):
    - **Operations** (STAFF+): POS, Kitchen, Floor, Reservations,
      Online orders.
    - **Insights** (MANAGER+, plus VIEWER read-only): Dashboard,
      Insights, Ticket history, End of day, Guests.
    - **My day** (everyone): Time clock, My schedule.
    - **Setup** (MANAGER+): Schedule, Time entries, Settings.
    - **Admin** (ADMIN+): Members, Catalog, Locations, Audit log.
- **Top header (64px, sticky):**
  - A location switcher button on the left (dropdown of tenant ·
    location combinations the user can access).
  - A command palette pill in the middle ("Search or jump…", ⌘K
    keyboard shortcut hint).
  - A user avatar + name on the right (initials in a primary circle).
    Click for a menu: My profile, Switch tenant, Sign out.
- **Main content:** scrollable, full remaining width.

The sidebar collapses to icon-only on narrow screens; the header
remains.

---

## Staff screens

### POS — `/{tenant}/{location}/pos`

The cashier's main screen — taking orders, taking payments. Three-pane
desktop layout that's the heart of the app.

- **Left pane (~280px):** Open Tickets sidebar.
  - "Open tickets" heading + a "+ New ticket" primary button.
  - Vertical stack of ticket cards (one per open order at this
    location). Each card has:
    - Row 1: ticket number `#9` (bold) + total `$12.99` (bold).
    - Row 2: customer label or "No label" (italic muted) + opened time.
    - Row 3: two small chips — order type ("Dine-in" sky-blue,
      "Takeout" amber) + line count ("3 items" emerald when > 0).
    - Active ticket has a primary accent bar on its left edge and a
      tinted background.

- **Middle pane:** the menu picker.
  - Sticky toolbar at the top: search input, then a horizontal "QTY"
    strip — `Qty: 1 2 3 4 5 6 7 8 9 10` (tappable buttons, the active
    one is filled primary). When `qty > 1` a "Next add: ×N" chip
    appears beside it. Below that, a horizontal pill strip of
    categories (All 16 / Drinks 4 / Mains 5 / Starters 3 / …).
  - Grid of menu tiles. Tiles can show real photos (full-bleed) or
    fall back to a deterministic colour gradient per category
    (amber→orange for one category, rose→pink for another, sky→blue
    for the next, etc.) with white name and a translucent black price
    pill in the corner. A tiny white dot in a tile's corner means the
    item has modifier groups.
  - When the active ticket is closed/empty, a centred overlay says
    "Open a ticket first".

- **Right pane (~360px):** Active ticket detail.
  - Header: large `#9` ticket number, opened time, customer label
    (inline-editable), order type dropdown (Dine-in / Takeout), a
    "Pick guest" link.
  - Line list: each line shows quantity, item name, modifiers (smaller
    text), price on the right, a status badge (NEW / FIRED / READY /
    SERVED / VOIDED — each its own colour), and a "line actions"
    dropdown menu (mark served, fire line, change modifiers, void,
    apply discount).
  - Totals block: Subtotal / Tax / Total with the total in bold.
  - Action bar at the bottom (sticky):
    - "Fire all" (primary, appears when there are NEW lines).
    - "Mark N ready lines served" (subtle emerald button when there
      are READY lines).
    - "Apply discount" (outline).
    - "Close ticket" (primary, enabled only when all lines are SERVED
      or VOIDED).
    - "Void ticket" (ghost, destructive red).

### Close-ticket / payment dialog (modal)

Opens when the cashier clicks "Close ticket".

- Header pinned: "Close #9" + "Closing finalises the totals. You can
  still reopen the ticket later if needed."
- Scrollable middle section:
  - Totals: "Total before tip" with the amount tabular-aligned.
  - **Tip:** 4 preset buttons (No tip / 15% / 18% / 20% — each shows
    the dollar amount beside the percent) + a Custom dollar input.
  - **Grand total** line (bold, primary-tinted background row).
  - **Payment method:** three big tiles in a row (Card / Cash /
    Mobile) — each with an icon (credit card / banknote / phone) and
    the label. Active tile is primary-filled.
  - When **Cash** is selected, a sub-section appears with:
    - "Cash tendered" label.
    - 4 quick-tender preset buttons computed from the total (Exact /
      $20 / $50 / $100 — algorithm picks the next round numbers
      above the total).
    - An "Other" custom input with a $ prefix.
    - A live change-due indicator: green "Change due $5.50" when
      sufficient, red "Short −$2.50" if not enough. Submit is blocked
      while short.
  - "Close note" textarea (optional, 500 char limit).
- Footer pinned: "Cancel" outline + a primary "Pay $X.XX • CARD" (or
  "Pay $X.XX • Change $Y.YY" when Cash + tendered > total) button.
- When submitted, a **full-dialog overlay** covers everything:
  - 1 second: spinner + "Processing card payment…" + the amount in
    muted text below.
  - Then a green check icon + "Payment received" + "Closing ticket…".
  - 0.7 seconds later the dialog closes; the ticket is now CLOSED.

### Kitchen Display (KDS) — `/{tenant}/{location}/kds`

A wall-mounted screen for cooks. Full-bleed, no sidebar (well, the
shell sidebar collapses).

- Header: "KDS · Mission St" on the left, a "12 active" count, a
  pulsing emerald dot + "Live" indicator on the right.
- Grid of ticket cards using `auto-fill, minmax(280px, 1fr)` so the
  number of columns adapts to the screen width — works great on a
  43" wall display.
- Each ticket card:
  - Header row: large `#9` (bold), customer label, an "Online" badge
    (sky-blue pill) if the ticket came from the public order page,
    pickup time for takeouts.
  - Age indicator: the card variant turns from white → amber → red
    based on how long the oldest unready item has been FIRED.
  - Sections grouped by course (Appetizer, Main, Dessert, Beverage).
  - Each line: qty + name in bold, modifiers grouped by group name
    ("Size: Medium · Milk: Whole"), an amber "notes" box for special
    instructions, rose allergen chips ("Contains nuts"), and a
    right-aligned **Bump button** (primary fill) when status is FIRED.
    When status is READY, the button is replaced by a green "✓ Ready"
    badge. Pending NEW items show "Pending fire" in muted text.
- **Loading state** (first fetch): 6 skeleton cards (grey pulse blocks
  in the same grid). Replaced by the empty state ("All clear. — No
  active tickets.") only when we know the count is genuinely 0.

### Online orders inbox — `/{tenant}/{location}/online-orders`

Where staff accept inbound online orders before they hit the POS.

- Header row: "Online Orders" heading, location subtitle, a
  green/amber **Live indicator dot** + label, and a "Refresh" button
  on the right (with spinning icon while fetching).
- **Pending** section: bordered cards, each showing:
  - Order number `#10`, customer name + phone, pickup time chip (ASAP
    or scheduled time).
  - Line items list (small).
  - Total.
  - Right-aligned: outline "Reject" button + primary "Accept" button.
    Accept shows a spinner with "Accepting…" while in flight.
- **Confirmed / rejected** section below: same card layout but
  read-only (no buttons), faded slightly.
- Rejection opens a small dialog asking for a reason (free-text +
  preset chips like "Out of stock", "Closed for the day").
- Live updates via SSE — when a new order is submitted by a customer,
  a card appears at the top of the Pending list automatically.

### Tickets history — `/{tenant}/{location}/tickets`

Manager-only. The audit / lookup view for past tickets.

- Heading + subtitle: "Closed and voided ticket history for Mission St."
- Filter bar:
  - From / To date inputs (defaults to last 7 days).
  - Status dropdown (All / Open / Closed / Voided).
  - Server dropdown (list of members who've opened tickets).
  - Reset button + primary "Apply filters" button.
- Tabular results: # / Business day / Opened / Customer / Server /
  Type / Lines / Total / Status. Each row clickable → ticket detail
  page (with full line breakdown, discounts, audit trail, and a
  "Reopen ticket" button for managers).
- Empty state: "No tickets in this range — Try widening the date range
  or clearing filters."
- "Load more" button at the bottom for pagination.

### Floor — `/{tenant}/{location}/floor`

Spatial table layout for dine-in service.

- A canvas-style area showing tables as rectangles/circles positioned
  on a floor map. Each table:
  - Number (large, bold).
  - Seat count.
  - Status chip (Open / Seated / Reserved / Needs check).
  - Active ticket badge if a ticket is open on that table.
- Tapping a table opens a side panel with: actions (Open ticket, Seat
  party, Mark needs cleaning), current order summary if any.
- Table editor mode (manager+): drag tables to reposition, add new
  tables.

### Reservations — `/{tenant}/{location}/reservations`

- Day view (default) and week view tabs.
- Day view: a vertical time axis (8am → 11pm) with rows for each
  table. Reservations are coloured blocks spanning their duration.
- A "New reservation" button at the top right opens a form
  (customer name, phone, party size, date/time, table optional).
- Detail panel on selection: confirm / no-show / seat now / cancel.

### Dashboard — `/{tenant}/{location}/dashboard`

The landing page for managers. A summary of the day so far.

- 4 KPI cards in a row at the top: Sales today, Tickets closed,
  Average ticket, Online orders count. Each shows the number large,
  a vs-yesterday delta, and a sparkline.
- Below: 2-column section.
  - Left: sales by hour (line chart) + sales by category (bar chart).
  - Right: a "Recent activity" feed.

### Insights — `/{tenant}/{location}/insights`

Deeper analytics dashboards: trends over weeks/months, top items,
top servers, discount usage, void rate.

### End of day / Z report — `/{tenant}/{location}/end-of-day`

A printable summary:
- Total sales, tax, tips, discounts, voids, refunds.
- Breakdown by payment method, by order type, by category, by server.
- Cash drawer reconciliation (expected vs. actual).
- "Close out" button at the bottom to lock the business day.

### Guests — `/{tenant}/{location}/guests`

A CRM-lite list:
- Searchable table of all guests: name, phone, email, visits, lifetime
  spend, last visit, tags.
- Click a row → guest detail page with order history and notes.

### Time clock — `/{tenant}/{location}/time-clock`

Per-user clock in / clock out. Big primary button changes from "Clock
in" → "Clock out" with current shift elapsed time displayed.

### My schedule — `/{tenant}/{location}/my-schedule`

The user's own upcoming shifts. Week view, role-coloured shift blocks.

### Schedule (manager) — `/{tenant}/{location}/schedule`

A 7-day grid: rows are staff, columns are days. Empty cells are
clickable to assign a shift. Drag-to-move; right-click for shift
actions. Role-colour bars.

### Time entries (manager) — `/{tenant}/{location}/time-entries`

A table of all clock-ins per user per day with editable start / end
times and approval workflow for the payroll export.

### Settings — `/{tenant}/{location}/settings`

Location-level configuration:
- Tabs: General, Hours, Tax, Receipt, Integrations.
- Hours editor: 7 rows, one per day, with editable open/close time
  ranges. "Mark closed" toggle per day. "Add split" to allow split
  hours (e.g. 6am–11am + 5pm–10pm). "Open 24/7" preset button.

### Members (admin) — `/{tenant}/admin/members`

Table of users with their role chip, location scope, status. Invite
button at the top right opens a form to add a new email + assign
role + locations.

### Catalog (admin) — `/{tenant}/admin/catalog`

Sub-tabs for Items, Categories, Modifier groups, Taxes. Each is a
sortable table with bulk actions and a "+ New" primary button. Item
editor is a form with name, description, price, category, course,
modifier-group attachments, photo upload, dietary tags, allergen
tags, archived toggle.

### Locations (admin) — `/{tenant}/admin/locations`

Table of locations with address, hours, status. Each row clickable
into a per-location settings page.

### Audit log (admin) — `/{tenant}/admin/audit-log`

Append-only stream of every state-changing action: who did what to
which entity when. Filterable by actor, entity type, action.

---

## Cross-cutting UI patterns

### Toasts

Top-right corner, slide in from the right. Success (emerald, check
icon), error (rose, X icon), info (sky, info icon). Auto-dismiss
after 4 seconds, or click to dismiss.

### Loading state convention

- **First fetch:** skeleton blocks that match the shape of the
  populated state — not a spinner. Animated `animate-pulse` muted
  rectangles.
- **Re-fetch / mutation in flight:** the button that triggered it
  becomes disabled with a small inline spinner + a label flip
  ("Save" → "Saving…", "Accept" → "Accepting…").
- **Long-running flows** (e.g. payment processing): full-dialog
  overlay with spinner → success check → auto-dismiss.

### Empty state convention

A centred card with a relevant icon (chef hat for KDS, clipboard for
tickets), a primary heading ("All clear."), a muted subhead ("No
active tickets."), and optionally a primary CTA when the user can
create something to fix the empty state.

### Dialog convention

- Center-screen on desktop, full-bottom-sheet on mobile.
- Header (title + description), scrollable middle, pinned footer
  (Cancel outline + primary action).
- Backdrop blurs the content behind. Click backdrop or X closes.

### Real-time indicator

A small dot + label in the corner of live pages:
- Green dot + "Live" — SSE connection healthy.
- Amber dot + "Reconnecting…" — connection has hiccupped.
- Combined with a manual "Refresh" button as a fallback.

---

## What we want from the redesign

Things to keep:
- Information density when it matters (KDS, POS) — staff need to see
  a lot at once.
- Role-aware navigation — staff sees a slim sidebar, managers see
  more.
- Real photography on customer-facing menu items.
- The general blue-primary calmness of the brand.

Things we'd like to improve:
- Customer side: even more "kiosk-grade" tap targets, ideally working
  well on a 27" countertop screen as well as a phone.
- Staff side: the open-tickets sidebar feels text-heavy — could
  benefit from stronger visual hierarchy (status colour, age bar).
- Modifier picker dialog: feels small on desktop. Could be a
  full-screen takeover for kiosk mode.
- A unified "command palette" surface that searches across tickets,
  guests, menu items, and members.
- Onboarding empty-state polish — first-run experience for a brand
  new tenant is currently bare.
- Consider a dark mode optimised KDS (most kitchens have dim
  lighting).
- Strong accessibility: every state needs to be readable in a noisy
  fluorescent kitchen.

If you're producing a redesign, please structure the output as:
1. Customer storefront / item card / cart drawer / checkout
2. Customer tracking page
3. Sign-in
4. Staff app shell (sidebar + header)
5. POS — three-pane layout, including the close-ticket payment dialog
6. KDS — wall-display optimised
7. Online orders inbox
8. Tickets history (with filter bar)
9. Dashboard / insights cards
10. Settings (hours editor)

Provide light and dark variants for every screen.
