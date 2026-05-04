# Demo Credentials

The demo seed (`pnpm db:seed:demo`) wipes the `acme` and `bistro-marais`
tenants and rebuilds a rich, realistic dataset for clicking around the entire
product. Every user below shares the same password.

**Password (all accounts):** `Password123!`

## Logins

| Email                          | Role    | Scope                          | Suggested URL                                              |
| ------------------------------ | ------- | ------------------------------ | ---------------------------------------------------------- |
| owner@acme.test                | OWNER   | tenant `acme` (all locations)  | http://localhost:3000/                                     |
| admin@acme.test                | ADMIN   | tenant `acme` (all locations)  | http://localhost:3000/settings/team                        |
| manager.mission@acme.test      | MANAGER | location `mission-st`          | http://localhost:3000/locations/mission-st                 |
| manager.castro@acme.test       | MANAGER | location `castro`              | http://localhost:3000/locations/castro                     |
| server.mission@acme.test       | STAFF   | location `mission-st`          | http://localhost:3000/locations/mission-st/pos             |
| cook.mission@acme.test         | STAFF   | location `mission-st`          | http://localhost:3000/locations/mission-st/kitchen         |
| server.castro@acme.test        | STAFF   | location `castro`              | http://localhost:3000/locations/castro/pos                 |
| viewer@acme.test               | VIEWER  | tenant `acme` (read-only)      | http://localhost:3000/reports                              |
| owner@bistro.test              | OWNER   | tenant `bistro-marais`         | http://localhost:3000/                                     |
| serveur@bistro.test            | STAFF   | location `paris-3e`            | http://localhost:3000/locations/paris-3e/pos               |

> The exact URL paths depend on the web app's routing — start at `/` after
> login and the app will route based on your scope. The "Suggested URL"
> column is a hint for the most useful first screen for that role.

## What's seeded

- **Tenants:** Acme Restaurant Group (`acme`), Bistro Marais (`bistro-marais`).
- **Locations:** Acme Mission St (USD, LA), Acme Castro (USD, LA), Bistro Marais Paris 3e (EUR, Paris).
- **Catalog (Acme):** 5 categories, 16 menu items, 5 modifier groups (Size, Milk, Toppings, Bread, Sides), location overrides on Castro (Latte $4.75, Caesar Salad 86'd).
- **Menus (Mission St):** "All Day" (always), "Breakfast" (Mon–Fri 6–11), "Happy Hour" (Mon–Fri 16–19, drinks at 25% off via section overrides).
- **Catalog (Bistro):** 3 categories, 6 French menu items, 20% VAT.
- **Floor (Mission St):** 12 tables across Main (T-1..T-8) and Bar (B-1..B-4) sections; servers assigned to a few tables.
- **Reservations (Mission St):** 3 future (CONFIRMED + PENDING), 2 completed earlier this week with linked tickets, 1 walk-in WAITING.
- **Staff & scheduling (Mission St):** 4 job roles (Server, Cook, Bar, Host), employment profiles for staff, ~16 shifts over 7 days (mix DRAFT/PUBLISHED), 2 closed time entries.
- **POS analytics (Mission St):** ~30 closed tickets over the past 7 days, mix IN_PERSON/ONLINE, 2 with 10% manager discounts, 1 voided line item, some linked to guests.
- **Guests (Acme):** 5 guests with phones; some linked to closed tickets and reservations.
- **Online orders (Mission St):** 1 PENDING in the inbox, 1 CONFIRMED + closed from yesterday.

## How to reset the demo

```bash
# from repo root
pnpm db:seed:demo
```

The seed wipes only the `acme` and `bistro-marais` tenants and any of the
demo emails listed above; it is independent of the canonical dev seed
(`pnpm db:seed`), and it preserves the `owner@acme.test` user it shares with
the dev seed by re-attaching them as the Acme owner.

If you need to nuke and pave the entire database:

```bash
pnpm db:reset    # prisma migrate reset --force; runs the dev seed
pnpm db:seed:demo
```

## Notes

- All users have `emailVerified` set so password sign-in works immediately.
- The demo password is intentionally common; do **not** ship the demo seed in production.
- Times are computed relative to "now" so reservations and shifts always look "today/tomorrow" no matter when you run the seed.
