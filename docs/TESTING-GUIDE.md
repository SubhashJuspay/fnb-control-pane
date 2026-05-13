# Testing Guide

End-to-end manual test plan. Each section is self-contained: do them in order or jump to whichever you want to spot-check.

> **Convention.** Every shell snippet assumes you start from the repo root with the docker CLI and Node 24 on `PATH`. The first block under "Daily startup" sets that up; later blocks omit those lines for brevity.

---

## Part 1 — One-time setup

You only need to do this once on a fresh machine.

```bash
# 1. Install Node 24 via nvm + activate pnpm.
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 2. Make sure Rancher Desktop's docker CLI is on PATH for this shell.
export PATH="$HOME/.rd/bin:$PATH"
docker version   # expect a client + server version

# 3. Install workspace deps.
pnpm install

# 4. Seed an .env file at the repo root.
cp .env.example .env
# Generate a real AUTH_SECRET:
sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env
# If host port 5432 is taken (a common case), this repo ships a docker-compose
# override that maps Postgres to 5434. Update DATABASE_URL accordingly:
sed -i '' "s|@localhost:5432|@localhost:5434|" .env

# 5. Install Playwright browsers (only if you want to run the E2E suite).
pnpm --filter @app/web exec playwright install --with-deps chromium
```

---

## Part 2 — Daily startup

Run this every time you sit down to test.

```bash
# Shell setup (paste at the top of every new terminal).
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
export PATH="$HOME/.rd/bin:$PATH"
set -a && source .env && set +a   # pulls DATABASE_URL etc into the shell

# Bring the stack up.
docker compose up -d
docker compose ps   # expect 4 services: fnb_db, fnb_api, fnb_web, fnb_mailhog

# Apply migrations + load demo data.
pnpm db:migrate         # safe to re-run; idempotent
pnpm db:seed            # the canonical owner@acme.test
pnpm db:seed:demo       # rich data across 2 tenants, 3 locations, 22 items, 32 tickets
```

You should see at the end of `db:seed:demo`:

```
Summary: {"tenants":2,"locations":3,"users":10,...,"tickets":32,"ticketItems":71,...}
```

### URL cheat sheet

| What | URL |
|---|---|
| Web app (sign-in) | http://localhost:3000/sign-in |
| Public ordering | http://localhost:3000/order/acme/mission-st |
| Public booking | http://localhost:3000/book/acme/mission-st |
| Public tenant signup | http://localhost:3000/sign-up |
| GraphQL endpoint | http://localhost:4000/graphql |
| MailHog inbox (all outbound mail) | http://localhost:8025 |
| Postgres (host port) | localhost:5434 |

### Demo accounts

Every account uses password **`Password123!`**.

| Email | Role | Scope |
|---|---|---|
| owner@acme.test | OWNER | tenant `acme` |
| admin@acme.test | ADMIN | tenant `acme` |
| manager.mission@acme.test | MANAGER | location `mission-st` |
| manager.castro@acme.test | MANAGER | location `castro` |
| server.mission@acme.test | STAFF | `mission-st` |
| cook.mission@acme.test | STAFF | `mission-st` |
| server.castro@acme.test | STAFF | `castro` |
| viewer@acme.test | VIEWER | tenant `acme` |
| owner@bistro.test | OWNER | tenant `bistro-marais` |
| serveur@bistro.test | STAFF | `paris-3e` |

If you'd rather not memorise URLs, sign in as the role you want to test and the app routes you to a sensible default.

---

## Part 3 — Customer-facing features (no auth)

The demo seed sets realistic opening hours; some of these tests will show the *closed* state outside business hours. The "Force-open the location" snippet at the bottom of this section toggles the location to 24/7 if you need to drive the open-state path.

### 3.1 Public menu — hero, tabs, item tiles

1. Go to http://localhost:3000/order/acme/mission-st .
2. **Expected**: a hero card showing tenant name "Acme Restaurant Group", location "Acme — Mission St", currency badge "USD", "Pickup • Pay on pickup" pills, address as a Google-Maps link, `tel:` phone link, today's hours, and a green "Open" or rose "Closed" badge that reflects the location timezone (Pacific).
3. Scroll the menu. Items should render with:
   - Thumbnail on the right (when `imageUrl` is set in the seed).
   - Green dietary chips (V, VG, GF…) — hover for the full label.
   - Red allergen chips (Dairy, Gluten…) where applicable. Try the *Croissant*, *Bagel*, or *Cheesecake* tile.
   - Hover an enabled tile → a `+` affordance appears.
4. **Multi-menu tabs**: only show when more than one menu is currently active. To trigger them, run during Mission St's "Breakfast" window (Mon–Fri 06:00–11:00 PT) or open Castro outside Happy Hour.
5. **Section jump-nav**: when an active menu has more than one section with items, a sticky chip rail appears under the menu tabs. Click any chip → page scrolls to that section.

### 3.2 Modifier picker

1. Click the *Latte* tile.
2. **Expected** dialog with grouped options ("Size — Required, exactly 1", "Milk — Required, exactly 1", "Toppings — Optional, up to 3").
3. Try to confirm with no Size selected → the *Add to cart* button stays disabled.
4. Pick *Medium*, *Whole*, *Caramel* → confirm → drawer toast or visible cart count update.

### 3.3 Cart drawer

1. Open the cart icon in the header (top-right).
2. **Expected**: title says *Your cart (1 item)*, the Latte line shows modifiers as a sub-line, and there are subtotal + Checkout + Continue shopping buttons.
3. Add a second item from the menu, return to the cart, and bump the quantity using the +/− buttons. Subtotal updates.
4. Click *Continue shopping* → drawer closes; cart icon still shows the count.

### 3.4 Checkout

1. Click *Checkout* in the drawer.
2. **Expected**: an order-summary card listing each line with modifiers and per-line subtotal; a contact section (name / phone / optional email); a Pickup card showing "ASAP — Default"; a multi-line *Notes* textarea.
3. Submit empty fields → inline validation errors via Zod.
4. Fill in: name `Test Customer`, phone `555-0100`, email `you@example.com`, optional notes. Click *Place order • $X.XX*.

### 3.5 Confirmation + tracking

1. After submitting you land on `/order/.../confirmation/<token>?n=42`.
2. **Expected**: a big *#42* with a checkmark, a "what's next" timeline (Submitted / Kitchen confirms / Preparing), the tracking link as a styled link with a Copy button.
3. Click *Track this order* → tracking page.
4. **Expected**: a 4-step progress stepper (Received highlighted), an "Updated Xs ago" indicator that ticks every second and spins the refresh icon when the urql query is in-flight, an *Items* card, and a *Subtotal / Tax / Total* breakdown.

### 3.6 Receipt

1. From the tracking page, click *View / print receipt*.
2. **Expected**: a print-friendly receipt with the tenant header, address, phone, order number, customer name, items + modifiers + line totals, subtotal/tax/total. Click *Print* to open the browser print dialog. Adding `?print=1` to the URL auto-opens the dialog 300 ms after load.

### 3.7 Booking widget

1. Go to http://localhost:3000/book/acme/mission-st .
2. **Expected**: the same hero block, then a "Book a table" form with date/time/party-size, contact details, and a "host confirms" notice.
3. Submit a booking 1 day from now at 13:00 with party size 4. Server validates against opening hours and a 90-day forward window.
4. **Expected**: the form swaps for a green confirmation card showing "Request received" with the party + when.
5. Verify staff side: sign in as `manager.mission@acme.test`, go to **Reservations** at `/acme/mission-st/reservations`. The booking appears as PENDING.

### 3.8 Public tenant signup

1. Go to http://localhost:3000/sign-up . (This is the **self-serve onboarding** page; the existing `/sign-up/<token>` invite flow is unchanged.)
2. **Expected**: three sections — Restaurant / First location / Owner account. Typing in the restaurant name auto-slugifies the URL slug field (until you edit it manually).
3. Submit:
   - Restaurant: `Test Cafe`, slug `test-cafe`
   - Location: `Main`, slug `main`, currency `USD`, timezone `America/Los_Angeles`
   - Owner: `Cas Tester`, email `cas@test-cafe.example`, password `SuperSecret9!`
4. **Expected**: you're auto-signed-in and redirected to `/test-cafe/main/dashboard`. The dashboard renders zero data because no menu has been built yet — that's correct.
5. Try signing up again with the same slug → friendly error "Tenant slug 'test-cafe' is taken".

### 3.9 Closed-state guard

Mission St's hours are 07:00–21:00 Mon–Thu (Pacific). To exercise both paths regardless of when you test:

```bash
# Force closed.
docker exec fnb_db psql -U fnb -d fnb_control_pane -c \
  "UPDATE locations SET opening_hours = '{\"sun\":[],\"mon\":[],\"tue\":[],\"wed\":[],\"thu\":[],\"fri\":[],\"sat\":[]}'::jsonb WHERE slug = 'mission-st';"

# Force open 24/7.
docker exec fnb_db psql -U fnb -d fnb_control_pane -c \
  "UPDATE locations SET opening_hours = '{\"sun\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"mon\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"tue\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"wed\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"thu\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"fri\":[{\"open\":\"00:00\",\"close\":\"23:59\"}],\"sat\":[{\"open\":\"00:00\",\"close\":\"23:59\"}]}'::jsonb WHERE slug = 'mission-st';"

# Restore the realistic demo seed (next pnpm db:seed:demo run also restores it).
pnpm db:seed:demo
```

In the **closed** state:

- The hero badge turns rose with "Closed • opens at HH:mm".
- A red banner appears between the hero and the menu: "We're not taking orders right now".
- The cart's *Checkout* button is disabled with an inline notice.
- The checkout page also disables submission and shows the same notice.
- The **API itself** rejects `submitOnlineOrder` with `ConflictError: This location is currently closed for online orders` — try it directly:

```bash
curl -s -X POST -H 'content-type: application/json' http://localhost:4000/graphql -d '{
  "query": "mutation($i:SubmitOnlineOrderInput!){submitOnlineOrder(input:$i){trackingToken}}",
  "variables": {"i":{"tenantSlug":"acme","locationSlug":"mission-st","customerName":"X","customerPhone":"555-0000","pickupKind":"ASAP","items":[]}}
}'
```

### 3.10 Sold-out item

```bash
docker exec fnb_db psql -U fnb -d fnb_control_pane -c \
  "INSERT INTO location_items (location_id, menu_item_id, hidden, available, created_at, updated_at) \
   SELECT l.id, mi.id, false, false, now(), now() \
   FROM locations l JOIN menu_items mi ON mi.tenant_id = l.tenant_id \
   WHERE l.slug='mission-st' AND mi.name='Burger' \
   ON CONFLICT (location_id, menu_item_id) DO UPDATE SET available = false;"
```

Refresh `/order/acme/mission-st`. The Burger tile is now dimmed with a "Sold out" pill, no `+` affordance, click is a no-op. Reset with `pnpm db:seed:demo`.

---

## Part 4 — Foundation (auth + invites + audit)

### 4.1 Sign in / sign out

1. http://localhost:3000/sign-in → enter `owner@acme.test` / `Password123!`.
2. **Expected**: redirect to `/acme/mission-st/dashboard`.
3. Click your avatar (top right) → *Sign out*.

### 4.2 Forgot password

1. http://localhost:3000/forgot-password .
2. Enter `owner@acme.test` → submit.
3. Open MailHog at http://localhost:8025 → an email with a reset link arrives.
4. Click the link → set a new password → sign in works.

> Reset back to `Password123!` afterwards or run `pnpm db:seed:demo` to restore the canonical password for every demo account.

### 4.3 MFA enrolment

1. Sign in as `owner@acme.test`.
2. Go to your profile / security settings (sidebar → *Account*).
3. Enable MFA. Scan the QR code with any TOTP app (or use the secret manually with `oathtool` to generate codes).
4. Sign out → sign back in → MFA challenge appears at `/mfa`.

### 4.4 Invite staff

1. Sign in as `owner@acme.test`. Go to `/acme/admin/members`.
2. Click *Invite teammate*. Email: `inviteme@example.com`, role MANAGER, location `mission-st`.
3. Open MailHog → invitation email with a `/sign-up/<token>` link.
4. In a private window, open that link → set name + password → land in the app as the new manager.

### 4.5 Audit log

1. Still as the owner, go to `/acme/admin/audit-log`.
2. **Expected**: rows for the actions you just did — `online_order.submitted` (anonymous), `reservation.requested`, `tenant.signed_up`, role changes, invitations, etc. Filter by date or actor.

---

## Part 5 — Menu & catalog

### 5.1 Master catalog

1. Sign in as `owner@acme.test` and visit `/acme/admin/catalog/items` (or click *Catalog* in the admin nav).
2. **Expected**: the 22 items from the demo seed, with their dietary + allergen tags.
3. Edit *Latte*: change short description, add dietary tag DAIRY_FREE, save. Refresh the public menu — chip appears.
4. Toggle *86* on the Latte (Catalog list view → 86 toggle, or the "Sold out" toggle on the location detail). Public menu now shows it dimmed at Mission St only.

### 5.2 Modifier groups

1. `/acme/admin/catalog/modifier-groups` → open *Size*. Verify min/max selections, three modifiers (Small/Medium/Large) with price deltas.
2. Edit Medium price delta to `100` (=$1.00). Save.
3. Refresh the public menu → click Latte → the Medium row reflects the new delta.

### 5.3 Per-location overrides

1. `/acme/castro/...` (sign in as `manager.castro@acme.test`) — go to **Catalog overrides**.
2. The seed already has Castro's Latte priced at $4.75 and Caesar Salad 86'd. Confirm.
3. Switch to public ordering for Castro: http://localhost:3000/order/acme/castro . Latte shows $4.75; Caesar Salad shows "Sold out".

### 5.4 Menus + schedules + section overrides

1. As manager.mission, `/acme/mission-st/menus` → three menus (All Day, Breakfast 06–11, Happy Hour 16–19).
2. Open the Happy Hour menu → drinks section has a 25%-off section override on Latte etc.
3. Drag-and-drop reorder a section or item.

---

## Part 6 — POS & KDS

### 6.1 Touch-tile POS — counter mode

1. Sign in as `server.mission@acme.test`. URL `/acme/mission-st/pos`.
2. Click *New ticket* (counter / customer-label flow).
3. Tap *Latte* → modifier dialog → pick Medium / Whole / Caramel → *Add to ticket*.
4. Tap *Croissant* (no modifiers — adds directly).
5. **Expected**: ticket-panel on the right shows two lines with snapshot pricing; subtotal and tax compute live.
6. Click *Fire all* → both lines transition NEW → FIRED; KDS will show them.

### 6.2 Kitchen Display System

1. In a second tab, sign in as `cook.mission@acme.test` and open `/acme/mission-st/kds`.
2. **Expected**: a card for the open ticket with both lines. Time-since-fire colors: green < 5 min, yellow 5–10, red > 10.
3. Click *Bump* on the Latte → it transitions to READY. Server's POS view updates within ~1s without refresh.
4. Bump the Croissant → ticket disappears from the active KDS column when all lines are READY (or move to a "Ready" lane depending on the layout).

### 6.3 Discount + void

1. Back in POS as the server, on the open ticket pick *Apply discount* on the Latte → 10% — reason `Birthday`.
2. **Expected**: subtotal recomputes, audit row written. Try the same on the *ticket* level for 5% — both stack.
3. Void a line item with reason `Spilled` — ticket totals re-recompute; line shows VOIDED.
4. As `manager.mission@acme.test` you can also run a 100% discount; STAFF role is gated to ≤ 25%.

### 6.4 Close + reopen

1. As `server.mission@acme.test`, mark the live items SERVED → *Close ticket* → free-form close note `paid cash $20 + tip`.
2. **Expected**: ticket disappears from the active list. Visible in `/acme/mission-st/tickets` with status CLOSED.
3. As `manager.mission@acme.test` open the closed ticket → *Reopen*. closeNote clears, status goes back to OPEN, audit log shows both events.

### 6.5 Daily-resetting ticket numbers

1. Each new ticket gets a number that resets at the location's business-day cutoff (default 04:00 local). Open three tickets in quick succession → expect `#43`, `#44`, `#45` (or whatever the next-in-sequence is for today).
2. To advance to "tomorrow" in code: `update tickets set business_day = business_day + interval '1 day'` only on a closed ticket and observe the next opened ticket reset to `#1`. (Or just trust the scenario.)

---

## Part 7 — Floor & reservations

### 7.1 Floor plan editor

1. Sign in as `manager.mission@acme.test`. Go to `/acme/mission-st/floor`.
2. **Expected**: 12 tables across Main (T-1..T-8) and Bar (B-1..B-4) sections. T-1 shape RECT 80×80 at (100, 100).
3. Click *Edit floor plan*. Drag a table to a new location, change shape circle ↔ rect, change capacity. Snap to grid. Auto-save indicator visible.

### 7.2 Live floor view

1. Exit edit mode. Tables tinted by derived state.
2. From POS, fire a ticket on T-3 → floor view's T-3 turns "Occupied" within ~1 s without reload.
3. Mark T-5 as "Cleaning" via a context menu / quick-action → tile color updates.

### 7.3 Reservations book

1. `/acme/mission-st/reservations` — the seed has 3 future reservations (mix CONFIRMED + PENDING) and 2 completed-earlier-this-week.
2. Click *New reservation*. Pick a guest from the typeahead (or create a new one), choose a table + party size.
3. On a PENDING reservation: *Confirm* → status CONFIRMED. Then *Seat* → opens a Ticket bound to the table; floor turns Occupied.
4. Close that ticket from the POS → reservation auto-completes (status COMPLETED) without manual action.

### 7.4 Walk-in waitlist

1. *Add walk-in*: name + party size, no time. Time-since-added auto-updates.
2. Seat the walk-in → opens a ticket the same way as a reservation.

### 7.5 Public booking → staff confirmation

1. From a private window, submit a booking via http://localhost:3000/book/acme/mission-st (Section 3.7).
2. As manager.mission, refresh `/acme/mission-st/reservations`. The new row is PENDING.
3. *Confirm* → status CONFIRMED. (Email/SMS to the customer for booking events isn't wired yet — see the punch list in IMPROVEMENTS.md.)

---

## Part 8 — Staff & scheduling

### 8.1 Job roles + employment profiles

1. As `owner@acme.test`, `/acme/admin/staff` (or `/acme/mission-st/staff` for location-scoped staff).
2. Job roles: Server, Cook, Bar, Host (seeded). Add a new role `Barista` color `#fbbf24`.
3. Employment profiles: open `cook.mission@acme.test` → set hourly rate, hire date, employment type. Sensitive — admin-scope only.

### 8.2 Schedule editor

1. `/acme/mission-st/schedule` — week grid, rows per user, columns per day. Seed has 16 shifts mixing DRAFT/PUBLISHED.
2. Click an empty cell → add a shift: pick a job role, time range. Tries to create overlap → API rejects.
3. *Publish week* → all DRAFT shifts in the visible week flip to PUBLISHED.
4. *Duplicate week* → next week populated as DRAFT for review.
5. Sign in as `cook.mission@acme.test` and go to `/acme/mission-st/my-schedule` → see the published shifts only.

### 8.3 Time clock

1. As cook.mission, go to `/acme/mission-st/time-clock`. Big touch-friendly panel.
2. *Punch in* — auto-binds to the next scheduled shift if it starts within 60 minutes.
3. *Start break* / *End break* / *Punch out* are timestamped.
4. As manager.mission, go to `/acme/mission-st/time-entries`. Forgot-to-clock-out entries can be edited with a required reason → flagged `manualEdit=true`.

---

## Part 9 — Analytics & Guest CRM

### 9.1 Dashboard KPIs

1. As `manager.mission@acme.test`, root URL redirects to `/acme/mission-st/dashboard`.
2. **Expected**: today's net sales, ticket count, average ticket, unique guests, sparkline of last 7 days, top-5 items today. Demo seed produces non-zero values.

### 9.2 Insights tabs

1. Click *Insights* in the sidebar. Tabs: Sales, Items, Hours, Servers, Guests.
2. Each scoped by date range. Rolling 7d / 30d / Custom.
3. Aggregations are TTL-cached at the API for 60 seconds — flipping between tabs should be instant on the second visit.

### 9.3 Guest CRM

1. `/acme/mission-st/guests` — seed has 5 guests with phones; some linked to closed tickets and reservations.
2. Open one (e.g. `Alice`). Visit count, total spent, average ticket, recent tickets, upcoming reservation.
3. From POS, open a new ticket → click *Link guest* → typeahead by name/phone → ticket now shows the linked guest in the analytics.

### 9.4 Auto-link on online order

1. Submit an online order from `/order/acme/mission-st` with a phone that already exists in the guest CRM (e.g. `555-0100`).
2. Confirm the order in the staff inbox (Section 10).
3. Open that guest's profile — the new ticket appears under recent tickets and visit count increments.

---

## Part 10 — Online orders (staff side)

### 10.1 Staff inbox

1. Submit an order from `/order/acme/mission-st` (or trigger via Section 3.4).
2. As `manager.mission@acme.test`, open `/acme/mission-st/online-orders`.
3. **Expected**: an inbox card for the order with status PENDING, customer name, phone, items.
4. *Accept* → status flips to CONFIRMED, ticket items go NEW → FIRED, KDS picks them up. Customer's tracking page updates within 5 s.
5. *Reject* (manager-scope) needs a reason → ticket and items VOIDED, customer email/SMS dispatched if configured.

---

## Part 11 — Notifications (email + SMS)

### 11.1 Email

The dev stack ships MailHog on http://localhost:8025 . Every outbound email lands there.

| Trigger | Expected email subject |
|---|---|
| Submit online order with `customerEmail` set | `Order #N received — <Tenant>` |
| Staff *Accept* the request | `Order #N confirmed — <Tenant>` |
| Last item bumped READY on a CONFIRMED online ticket | `Order #N is ready for pickup — <Tenant>` |
| Staff *Reject* with reason | `Order #N couldn't be accepted — <Tenant>` |
| Forgot-password flow | password reset link |
| Invite teammate | invite link |
| Tenant signup | (no email today; `emailVerified` is auto-set) |

### 11.2 SMS (opt-in)

SMS is no-op by default. To exercise the live path you need a real Twilio sandbox:

```bash
# Edit .env and fill in:
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+15005550006   # Twilio test from-number is fine
docker compose restart api
```

Repeat the four online-order events from 11.1; the API logs `INFO sms sent ...` on success and `WARN sms failed ...` if the credentials are wrong. The customer-facing mutation succeeds either way.

To verify the dispatch is wired up without real Twilio creds, just tail the API logs — every call to `sendSmsSafely` logs a `WARN` once with an explanation when no creds are configured.

```bash
docker compose logs -f api | grep -i sms
```

---

## Part 12 — Permissions & multi-tenancy

These are quick checks that the GraphQL scope guards are honest.

```bash
# Sign in as the bistro-marais owner (different tenant) and try to query Acme tickets.
# Expected: empty list / ForbiddenError, never data.

# In the UI: sign in as `viewer@acme.test`. Try to open POS. Expected: redirected
# back to dashboard or an authorization error toast — VIEWER is read-only.
```

Also: cross-tenant URL hijacking. As `owner@bistro.test`, manually navigate to `/acme/mission-st/dashboard`. **Expected**: rejected with a "no access" UI; no data ever leaks.

---

## Part 13 — Run the automated suites

```bash
# All resolver + util unit + integration tests.
pnpm --filter @app/api test

# Web component unit tests.
pnpm --filter @app/web test

# Validation tests.
pnpm --filter @repo/validation test

# Playwright E2E (online order is the bundled smoke test).
pnpm --filter @app/web exec playwright test tests/e2e/online-order-flow.spec.ts
```

The full suite is `turbo run test` from the repo root.

---

## Part 14 — Reset

To wipe the demo back to the canonical state:

```bash
# Wipe only the Acme + Bistro demo data, preserve the volume.
pnpm db:seed:demo

# Nuke the database entirely (drops the volume, re-runs migrations + dev seed).
docker compose down -v
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo
```

If you ever see a Prisma drift error on `pnpm db:migrate`, you're on a build that predates the extension-migration fix — check `docker/postgres-init/` is empty (only the `README.md` should be there) and re-run.
