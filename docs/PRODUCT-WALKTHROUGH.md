# Product walkthrough — QR-to-pickup order flow

This document walks the product team through the end-to-end flow when a guest scans a QR code, places an order, and the restaurant staff completes it. Every step lists the role involved, what they see, and what they can do.

---

## 0. Demo environment & credentials

- **Frontend:** `https://fnb-control-panel.vercel.app`
- **Tenant:** Acme Restaurant Group (`acme`)
- **Locations:** Acme — Mission St (`mission-st`), Acme — Castro (`castro`)
- **Password for every demo user:** `Password123!`

| Role | Email | Scope | Use it to demo |
| --- | --- | --- | --- |
| OWNER | `owner@acme.test` | Tenant-wide | Anything (the "see it all" persona) |
| ADMIN | `admin@acme.test` | Tenant-wide | Catalog, locations, members admin |
| MANAGER | `manager.mission@acme.test` | Mission St | Closing tickets, insights, settings |
| MANAGER | `manager.castro@acme.test` | Castro | Same as above, different location |
| STAFF (server) | `server.mission@acme.test` | Mission St | POS — taking orders |
| STAFF (cook) | `cook.mission@acme.test` | Mission St | KDS — firing & bumping |
| STAFF (server) | `server.castro@acme.test` | Castro | POS at a second location |
| VIEWER | `viewer@acme.test` | Tenant-wide | Read-only dashboards |

Customers do **not** sign in. The online ordering surface is anonymous, scoped per location via tenant + location slug in the URL.

---

## What each role can do

| Capability | Owner | Admin | Manager | Staff | Viewer |
| --- | :-: | :-: | :-: | :-: | :-: |
| Take orders at POS | ✓ | ✓ | ✓ | ✓ | — |
| Operate the kitchen display (KDS) | ✓ | ✓ | ✓ | ✓ | — |
| Manage the floor / tables | ✓ | ✓ | ✓ | ✓ | — |
| Accept / reject online orders | ✓ | ✓ | ✓ | ✓ | — |
| Reservations | ✓ | ✓ | ✓ | ✓ | — |
| Close tickets (take payment) | ✓ | ✓ | ✓ | ✓ | — |
| Reopen a closed ticket | ✓ | ✓ | ✓ | — | — |
| Apply discounts | ✓ | ✓ | ✓ | ✓ | — |
| Void a ticket / a line | ✓ | ✓ | ✓ | ✓ | — |
| Ticket history (closed/voided) | ✓ | ✓ | ✓ | — | — |
| Refunds | ✓ | ✓ | ✓ | — | — |
| End-of-day / Z report | ✓ | ✓ | ✓ | — | — |
| Insights & dashboards | ✓ | ✓ | ✓ | — | ✓ |
| Guests (CRM) | ✓ | ✓ | ✓ | — | — |
| Time clock (clock in/out, own only) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Schedule (own only) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage staff schedules | ✓ | ✓ | ✓ | — | — |
| Edit menu, modifiers, taxes | ✓ | ✓ | — | — | — |
| Manage locations | ✓ | ✓ | — | — | — |
| Invite / manage members | ✓ | ✓ | — | — | — |
| Location settings (hours, address) | ✓ | ✓ | ✓ | — | — |
| Audit log | ✓ | ✓ | — | — | — |

---

## Stage 1 — Customer scans the QR code

**Actor:** anonymous guest with a phone (or tablet at a table). No login.

1. The restaurant prints a QR code that links to `/order/acme/mission-st`.
2. The guest scans it → browser opens the **storefront**:
   - Tenant + location name in the header.
   - Cart button (empty for now).
   - **Search bar** for the menu.
   - **Category sidebar** on the left ("All items", "Drinks", "Mains", "Starters", "Sides", "Desserts") — each shows item counts.
   - **Photo grid** of menu items, 2 cols on phone, 3 cols on desktop, with real food photography from the seeded menu.
3. If the location is currently closed (per the saved opening hours), an "We're not taking orders right now" banner appears and the cart is disabled.

### What the guest can do here
- Browse the menu by scrolling or by clicking a category in the sidebar (filter).
- Search by name (filters across every category).
- Tap a tile:
  - If it has **modifier groups** (e.g. Mango Lassi → Size, Toppings), a **modifier picker dialog** opens with required/optional rules.
  - If it has no modifiers, it's added directly with quantity 1.
- See an in-cart count badge on the tile once added.
- See a sticky bottom bar appear: **"<n> items · $X.XX · Review order"**.

---

## Stage 2 — Customer reviews cart & checks out

**Actor:** anonymous guest.

1. Guest taps **Review order** (or the cart button in the header) → cart drawer slides in from the right.
2. Drawer shows each line (name, modifiers, qty, subtotal), running total, and a **"Continue to checkout"** button.
3. Guest can adjust quantities, remove items, or add notes.
4. **Checkout** page asks for:
   - Name (required)
   - Phone (required)
   - Pickup time — **ASAP** (default) or **Scheduled**
   - Optional order notes
5. Guest hits **Place order**.
6. Server-side: a new `OnlineOrderRequest` is created (status `PENDING`), a tracking token is generated, and the staff receive a real-time notification.
7. Guest is redirected to the **confirmation page** showing:
   - Big "Order placed" message
   - Order number (e.g. `#10`)
   - Tracking link (the URL is copyable and points to the public tracking page)

The cart and storefront stay anonymous — no account creation is required.

---

## Stage 3 — Customer tracks the order

**Actor:** the same guest, on the tracking URL.

The tracking page polls every 5 seconds and shows a stepper:

```
[ Received ] → [ Confirmed ] → [ Preparing ] → [ Ready ] → [ Picked up ]
```

Steps light up as the kitchen progresses:
- **Received** — Order submitted, awaiting kitchen.
- **Confirmed** — A staff member accepted the order at the inbox.
- **Preparing** — The lines were fired in the kitchen.
- **Ready** — Every item has been marked ready by the kitchen.
- **Picked up** — Cashier closed the ticket after taking payment.

Until the order row becomes visible to the public token lookup (a few seconds at most), the page shows a "Finding your order…" pulsing skeleton — never a "not found" flash.

If the staff reject the order, the stepper is replaced by a red "Order rejected" card with the reason.

---

## Stage 4 — Staff accept the order

**Actor:** **STAFF / MANAGER** signed in at the location. Sign in with `server.mission@acme.test`.

1. Staff signs in → lands on their default location.
2. Sidebar shows under **Operations**: POS, Kitchen, Floor, Reservations, **Online orders**.
3. Staff opens **Online orders**. The inbox shows:
   - "Pending" section — any new requests, with a small **green "Live" indicator** showing the SSE connection is up. A **Refresh** button is available as a fallback.
   - "Confirmed / rejected" section — recent history.
4. Each pending card shows: order number, customer name + phone, pickup time, line items, total.
5. Staff hits **Accept**:
   - Button shows a pending "Accepting…" state.
   - Behind the scenes: a real ticket is created in POS at status `OPEN`, the request flips to `CONFIRMED`, and the customer's tracking page advances to "Confirmed".
6. Staff can hit **Reject** instead (opens a dialog asking for a reason).

---

## Stage 5 — Kitchen receives & cooks

**Actor:** **STAFF** (cook). Sign in with `cook.mission@acme.test`.

1. Cook signs in. Their sidebar is trimmed to just Operations + My day surfaces (POS, **Kitchen**, Floor, Reservations, Online orders, Time clock, My schedule). No Insights / Setup / Admin for them — staff-only role.
2. Cook opens **Kitchen**. The KDS board shows one card per active ticket, in age-coded colors (cards turn amber → red as they get older).
3. Each card shows: ticket number, customer label, **order channel** (Online / In-store), item list with quantities, modifiers, **allergens**, prep notes, and pickup time for takeout.
4. From the POS, a server hits **Fire all** to send the ticket to the kitchen → items go from `NEW` to `FIRED` and appear on the KDS card with a Bump button.
5. The cook taps **Bump** next to each item as it's plated → that item flips to `READY` with a ✓.
6. When **all** items on a ticket are READY, the card stays until cashier serves/closes (so staff don't lose track).

---

## Stage 6 — Cashier serves & takes payment

**Actor:** **STAFF / MANAGER** at the POS. Sign in with `server.mission@acme.test` (or any manager).

1. Open the **POS**. The screen has three panes:
   - **Left:** Open tickets list (color-coded by order type — sky blue for Dine-in, amber for Takeout).
   - **Middle:** Menu tiles (colored gradient by category, real photos when present), with a **QTY prefix selector** (tap a number, then tap a tile to add that many in one tap) and a search bar.
   - **Right:** Active ticket detail — lines, totals, action buttons.
2. Cashier picks the online order's ticket from the list (e.g. `#10`).
3. When the kitchen has marked items ready, the right pane gains a **"Mark N ready lines served"** bulk button — tap once to mark every ready line as served.
4. With all lines `SERVED`, the **Close ticket** button activates.
5. Cashier hits **Close ticket** → dialog opens:
   - Tip presets: No tip / 15% / 18% / 20% / Custom.
   - **Payment method**: Card / Cash / Mobile.
   - When **Cash** is picked:
     - Quick-tender presets appear (Exact / $20 / $50 / $100 — chosen by the algorithm based on the total).
     - "Other" lets the cashier type any custom amount.
     - **Live change-due indicator** shows "Change due $X.XX" in green, or "Short −$X.XX" in red if the tender is below the total. Submit is blocked while short.
   - Optional close note for the audit log.
6. Cashier hits **Pay $X.XX • CARD** (or **Pay $X.XX • Change $Y.YY** for cash):
   - A processing overlay covers the dialog: spinner + "Processing card payment…"
   - After ~1 second the overlay flips to a green ✓ "Payment received".
   - The ticket transitions to `CLOSED` with the chosen tip + payment method.
7. The customer's tracking page automatically advances to **"Picked up — Order complete!"** within the next poll (≤5 seconds).

---

## Stage 7 — Manager closes the loop

**Actor:** **MANAGER+**. Sign in with `manager.mission@acme.test` or `owner@acme.test`.

The manager has access to retrospective and admin surfaces:
- **Insights → Ticket history**: every closed/voided/open ticket for the last 7 days by default; filter by date, status, server, and tap a ticket for full detail. They can also **reopen** a closed ticket if needed (e.g. mistaken close).
- **Insights → End of day**: Z report — sales totals, by category, by server, voids, refunds.
- **Insights → Guests**: CRM — repeat customers, contact info, lifetime spend.
- **Setup → Settings**: location address, phone, opening hours.
- **Setup → Schedule / Time entries**: staff scheduling and time-clock approvals.
- **Admin** (admin+ only): Members, Catalog, Locations, Audit log.

Managers also see all the operational surfaces (POS, KDS, Floor, Reservations, Online orders) and can do everything staff can plus reopen/refund/discount above the staff-allowed thresholds.

---

## Roles to surfaces — at a glance

```
                    Owner  Admin  Manager  Staff  Viewer
OPERATIONS
  POS               •      •      •        •
  Kitchen (KDS)     •      •      •        •
  Floor             •      •      •        •
  Reservations      •      •      •        •
  Online orders     •      •      •        •
INSIGHTS
  Dashboard         •      •      •               •
  Insights          •      •      •               •
  Ticket history    •      •      •
  End of day        •      •      •
  Guests            •      •      •
MY DAY (always)
  Time clock        •      •      •        •      •
  My schedule       •      •      •        •      •
SETUP
  Schedule          •      •      •
  Time entries      •      •      •
  Settings          •      •      •
ADMIN
  Members           •      •
  Catalog           •      •
  Locations         •      •
  Audit log         •      •
```

---

## Real-time architecture (for product context)

- Postgres `LISTEN / NOTIFY` powers a pubsub layer in the API.
- Every state-changing mutation (`addTicketItem`, `fireTicket`, `markTicketItemReady`, `closeTicket`, `submitOnlineOrder`, `confirmOnlineOrder`, …) writes the row, then publishes on a per-location channel.
- The web app holds long-lived **SSE** subscriptions and refetches the relevant query on every event.
- This means: place an order in one tab and it pops onto the Online Orders inbox in another tab within ~1 second, with no polling load.

If the SSE connection drops, the surfaces fall back to manual refresh — every live page (KDS, Online Orders, POS active ticket) has a refresh button and a green/amber "Live / Reconnecting…" indicator.

---

## Suggested demo script (10 minutes)

1. **Open the storefront** (no login): scan-free shortcut → open `/order/acme/mission-st` on a phone.
2. Browse the menu, search for "pizza", add Margherita Pizza (no modifiers) and Mango Lassi (modifiers).
3. Hit **Review order** → checkout → fill Bob / 555-0100 / ASAP → **Place order**.
4. Note the **#11** order number and tracking URL on the confirmation page.
5. **In another tab** sign in as `server.mission@acme.test`, open **Online orders**, **Accept** the new order.
6. **Switch to the cook tab**, sign in as `cook.mission@acme.test`, open **Kitchen**, **Bump** each line.
7. Back in the server tab, open **POS**, pick the ticket, hit **Mark 2 ready lines served**, then **Close ticket**, pick **Card**, hit Pay.
8. Pull the customer's tracking tab forward — the stepper has advanced through Preparing → Ready → **Picked up — Order complete!**
9. Sign in as `manager.mission@acme.test` → **Ticket history** to show the just-closed ticket with its totals.
