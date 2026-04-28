# F&B Control Pane — Floor / Tables / Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Floor / Tables / Reservations sub-project — per-location sections + tables, floor-plan editor, live floor view, reservations book, walk-in waitlist, with SSE-driven real-time updates and seamless integration with POS tickets.

**Architecture:** Purely additive to Foundation + Menu + POS. Three new Prisma models (`Section`, `Table`, `Reservation`) + four enums. POS's `Ticket` gets a nullable `tableId` field (additive only). Two pure helpers (`deriveTableState`, `isReservationImminent`). New GraphQL types/queries/mutations and an SSE subscription `floorUpdates`. POS's `closeTicket` resolver gains a small post-commit hook to auto-complete linked reservations. New web routes under `/[locationSlug]/floor`, `/floor/edit`, `/reservations`, `/waitlist`.

**Tech Stack:** Same as prior sub-projects. New runtime dep: none.

**Spec:** `docs/superpowers/specs/2026-04-28-fnb-floor-reservations-design.md`

**Patterns to reuse (already in repo from prior sub-projects):**
- Pothos schema builder (`apps/api/src/schema/builder.ts`), v4 API.
- `pubsub.publish` / `pubsub.subscribe` with channel naming pattern (`apps/api/src/pubsub.ts`).
- Pothos subscription pattern (see `apps/api/src/schema/subscriptions/ticket-updates.ts`).
- Mutation pattern (validate, authScopes, in-handler role check, writeAudit, publish event).
- Pure-function resolver extraction for testability.
- Web shell, urql client with subscriptionExchange (`apps/web/lib/graphql/client.ts`).
- `@repo/ui`: `formatMoney`, `MoneyInput`, `Sortable`, `EmptyState`, `DataTable`, `Card*`, `Dialog*`, `Sheet*`, `TicketCard`.
- `@repo/validation` subpath exports already include ticket/discount/etc.

---

## Phase 1 — Schema + helpers

### Task 1: Prisma schema additions

**Files:**
- Modify: `packages/db/prisma/schema.prisma` — append models, enums, and add `tableId` field on `Ticket`, plus relation fields on `Location` + `User`.
- Create: `packages/db/prisma/migrations/<ts>_floor_reservations/migration.sql` (generated then patched).

- [ ] **Step 1: Append new models to `packages/db/prisma/schema.prisma`**

On `Location` model, add:
```prisma
  sections     Section[]
  tables       Table[]
  reservations Reservation[]
```

On `User` model, add:
```prisma
  tablesAssigned       Table[]       @relation("TableAssignedServer")
  reservationsCreated  Reservation[] @relation("ReservationCreatedBy")
```

On `Ticket` model (POS), add:
```prisma
  tableId       String?       @map("table_id") @db.Uuid
  table         Table?        @relation(fields: [tableId], references: [id], onDelete: SetNull)
  reservation   Reservation?  @relation("ReservationTicket")
```
And update the index (optional): `@@index([locationId, tableId])`.

Append at the bottom:

```prisma
// ─── Floor / Tables / Reservations ────────────────────
model Section {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId  String    @map("location_id") @db.Uuid
  name        String
  sortOrder   Int       @default(0) @map("sort_order")
  archivedAt  DateTime? @map("archived_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  tables   Table[]

  @@unique([locationId, name])
  @@index([locationId, archivedAt])
  @@map("sections")
}

model Table {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId        String      @map("location_id") @db.Uuid
  sectionId         String?     @map("section_id") @db.Uuid
  label             String
  capacity          Int         @default(2)
  shape             TableShape  @default(RECT)
  positionX         Int         @map("position_x")
  positionY         Int         @map("position_y")
  width             Int         @default(80)
  height            Int         @default(80)
  rotation          Int         @default(0)
  manualState       TableManualState @default(NONE) @map("manual_state")
  assignedServerId  String?     @map("assigned_server_id") @db.Uuid
  archivedAt        DateTime?   @map("archived_at")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  location        Location  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  section         Section?  @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  assignedServer  User?     @relation("TableAssignedServer", fields: [assignedServerId], references: [id], onDelete: SetNull)
  tickets         Ticket[]
  reservations    Reservation[]

  @@unique([locationId, label])
  @@index([locationId, sectionId])
  @@index([locationId, archivedAt])
  @@map("tables")
}

model Reservation {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId      String              @map("location_id") @db.Uuid
  kind            ReservationKind     @default(RESERVATION)
  status          ReservationStatus   @default(PENDING)

  guestName       String              @map("guest_name")
  guestPhone      String?             @map("guest_phone")
  partySize       Int                 @map("party_size")
  notes           String?

  requestedTime   DateTime?           @map("requested_time")
  durationMinutes Int                 @default(90) @map("duration_minutes")
  tableId         String?             @map("table_id") @db.Uuid
  ticketId        String?             @unique @map("ticket_id") @db.Uuid

  seatedAt        DateTime?           @map("seated_at")
  completedAt     DateTime?           @map("completed_at")
  noShowAt        DateTime?           @map("no_show_at")
  cancelledAt    DateTime?           @map("cancelled_at")
  cancelReason    String?             @map("cancel_reason")

  createdById     String              @map("created_by_id") @db.Uuid
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  location  Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  table     Table?   @relation(fields: [tableId], references: [id], onDelete: SetNull)
  ticket    Ticket?  @relation("ReservationTicket", fields: [ticketId], references: [id], onDelete: SetNull)
  createdBy User     @relation("ReservationCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)

  @@index([locationId, status])
  @@index([locationId, requestedTime])
  @@index([tableId])
  @@map("reservations")
}

enum TableShape       { RECT  CIRCLE }
enum TableManualState { NONE  CLEANING }
enum ReservationKind  { RESERVATION  WALKIN }
enum ReservationStatus {
  PENDING
  CONFIRMED
  WAITING
  SEATED
  COMPLETED
  NO_SHOW
  CANCELLED
}
```

- [ ] **Step 2: Validate + generate**

```bash
DATABASE_URL=postgres://noop:noop@localhost:5432/noop pnpm --filter @repo/db exec prisma format
DATABASE_URL=postgres://noop:noop@localhost:5432/noop pnpm --filter @repo/db exec prisma validate
docker compose up -d db
pnpm --filter @repo/db migrate -- --create-only --name floor_reservations
```

(Use `--create-only` because `migrate dev` may attempt to interactively prompt.)

- [ ] **Step 3: Add a CHECK constraint to enforce `RESERVATION` ↔ `requestedTime` rule**

Edit the generated `migration.sql` and append:

```sql
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_kind_time"
  CHECK (
    (kind = 'RESERVATION' AND requested_time IS NOT NULL)
    OR (kind = 'WALKIN' AND requested_time IS NULL)
  );
```

Apply:
```bash
pnpm --filter @repo/db exec prisma migrate deploy
```

- [ ] **Step 4: Verify tables exist and Pothos types regenerated**

```bash
docker compose exec -T db psql -U fnb -d fnb_control_pane -c "\dt" | grep -E "(sections|tables|reservations)" | wc -l
grep -E "(Section|Table|Reservation)" apps/api/src/schema/prisma-types.ts | head -10
```

Expected: 3 new tables; types present.

- [ ] **Step 5: Run all api tests**

```bash
pnpm --filter @app/api test 2>&1 | tail -10
```

Expected: 452 tests still green (no new tests yet).

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/ apps/api/src/schema/prisma-types.ts
git commit -m "$(cat <<'EOF'
feat(db): add Floor / Tables / Reservations schema

Three new tables (Section, Table, Reservation) plus four enums.
Ticket gains a nullable tableId for table-bound POS tickets.
CHECK constraint enforces RESERVATION must have requestedTime and
WALKIN must not.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Validation package additions

**Files:**
- Create: `packages/validation/src/floor.ts`
- Create: `packages/validation/src/reservation.ts`
- Modify: `packages/validation/src/index.ts` (re-export)
- Modify: `packages/validation/package.json` (subpath exports `./floor`, `./reservation`)
- Create: `packages/validation/src/floor.test.ts` and `reservation.test.ts` for cross-field validations.

- [ ] **Step 1: Write failing tests**

`floor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTableSchema, updateTableSchema, createSectionSchema } from './floor.js';

describe('createTableSchema', () => {
  it('accepts a minimal valid table', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0,
    }).success).toBe(true);
  });
  it('rejects negative positions', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: -10, positionY: 0,
    }).success).toBe(false);
  });
  it('rejects capacity 0', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0, capacity: 0,
    }).success).toBe(false);
  });
  it('rejects rotation outside 0..359', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0, rotation: 360,
    }).success).toBe(false);
  });
});

describe('createSectionSchema', () => {
  it('accepts valid name', () => {
    expect(createSectionSchema.safeParse({ name: 'Patio' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createSectionSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
```

`reservation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createReservationSchema, addWalkinSchema, seatReservationSchema } from './reservation.js';

describe('createReservationSchema', () => {
  it('accepts a valid reservation', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John',
      partySize: 4,
      requestedTime: new Date(Date.now() + 3_600_000).toISOString(),
    }).success).toBe(true);
  });
  it('rejects partySize 0', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John', partySize: 0,
      requestedTime: new Date().toISOString(),
    }).success).toBe(false);
  });
  it('requires guestName', () => {
    expect(createReservationSchema.safeParse({
      guestName: '   ', partySize: 4,
      requestedTime: new Date().toISOString(),
    }).success).toBe(false);
  });
  it('requires requestedTime (RESERVATION)', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John', partySize: 4,
    }).success).toBe(false);
  });
});

describe('addWalkinSchema', () => {
  it('accepts walkin with no requestedTime', () => {
    expect(addWalkinSchema.safeParse({
      guestName: 'Sarah', partySize: 2,
    }).success).toBe(true);
  });
});

describe('seatReservationSchema', () => {
  it('accepts uuid', () => {
    expect(seatReservationSchema.safeParse({
      reservationId: '11111111-1111-1111-1111-111111111111',
      tableId: '22222222-2222-2222-2222-222222222222',
    }).success).toBe(true);
  });
  it('tableId optional (uses reservation.tableId)', () => {
    expect(seatReservationSchema.safeParse({
      reservationId: '11111111-1111-1111-1111-111111111111',
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @repo/validation test
```

Expected: FAIL with "Failed to load url ./floor.js" / "./reservation.js".

- [ ] **Step 3: Implement `packages/validation/src/floor.ts`**

```ts
import { z } from 'zod';

export const tableShapeSchema = z.enum(['RECT', 'CIRCLE']);
export type TableShape = z.infer<typeof tableShapeSchema>;

export const tableManualStateSchema = z.enum(['NONE', 'CLEANING']);
export type TableManualState = z.infer<typeof tableManualStateSchema>;

export const tableStateSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']);
export type TableState = z.infer<typeof tableStateSchema>;

export const createSectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const archiveSectionSchema = z.object({ id: z.string().uuid() });
export type ArchiveSectionInput = z.infer<typeof archiveSectionSchema>;

export const reorderSectionsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;

export const createTableSchema = z.object({
  label: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(99).default(2),
  shape: tableShapeSchema.default('RECT'),
  positionX: z.number().int().min(0).max(10_000),
  positionY: z.number().int().min(0).max(10_000),
  width: z.number().int().min(20).max(500).default(80),
  height: z.number().int().min(20).max(500).default(80),
  rotation: z.number().int().min(0).max(359).default(0),
  sectionId: z.string().uuid().optional().nullable(),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = createTableSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const archiveTableSchema = z.object({ id: z.string().uuid() });
export type ArchiveTableInput = z.infer<typeof archiveTableSchema>;

export const assignTableServerSchema = z.object({
  tableId: z.string().uuid(),
  assignedServerId: z.string().uuid().nullable(),
});
export type AssignTableServerInput = z.infer<typeof assignTableServerSchema>;

export const setTableManualStateSchema = z.object({
  tableId: z.string().uuid(),
  manualState: tableManualStateSchema,
});
export type SetTableManualStateInput = z.infer<typeof setTableManualStateSchema>;

export const openTicketAtTableSchema = z.object({
  tableId: z.string().uuid(),
  customerLabel: z.string().trim().max(120).optional().nullable(),
  partySize: z.number().int().min(1).max(99).optional(),
});
export type OpenTicketAtTableInput = z.infer<typeof openTicketAtTableSchema>;
```

- [ ] **Step 4: Implement `packages/validation/src/reservation.ts`**

```ts
import { z } from 'zod';

export const reservationKindSchema = z.enum(['RESERVATION', 'WALKIN']);
export type ReservationKind = z.infer<typeof reservationKindSchema>;

export const reservationStatusSchema = z.enum([
  'PENDING', 'CONFIRMED', 'WAITING', 'SEATED', 'COMPLETED', 'NO_SHOW', 'CANCELLED',
]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const createReservationSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40),
  requestedTime: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(720).default(90),
  tableId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  id: z.string().uuid(),
  guestName: z.string().trim().min(1).max(120).optional(),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40).optional(),
  requestedTime: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(15).max(720).optional(),
  tableId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  id: z.string().uuid(),
  cancelReason: z.string().trim().max(500).optional().nullable(),
});
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

export const confirmReservationSchema = z.object({ id: z.string().uuid() });
export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;

export const markNoShowSchema = z.object({ id: z.string().uuid() });
export type MarkNoShowInput = z.infer<typeof markNoShowSchema>;

export const addWalkinSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(40).optional().nullable(),
  partySize: z.number().int().min(1).max(40),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type AddWalkinInput = z.infer<typeof addWalkinSchema>;

export const seatReservationSchema = z.object({
  reservationId: z.string().uuid(),
  tableId: z.string().uuid().optional(),
});
export type SeatReservationInput = z.infer<typeof seatReservationSchema>;

export const completeReservationSchema = z.object({ id: z.string().uuid() });
export type CompleteReservationInput = z.infer<typeof completeReservationSchema>;
```

- [ ] **Step 5: Update `packages/validation/src/index.ts`**

Append:
```ts
export * from './floor.js';
export * from './reservation.js';
```

- [ ] **Step 6: Update `packages/validation/package.json`** subpath exports — add `./floor` and `./reservation`.

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm --filter @repo/validation test
pnpm --filter @repo/validation typecheck
```

Expected: 21 + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/validation
git commit -m "$(cat <<'EOF'
feat(validation): add Zod schemas for floor and reservations

Section + Table CRUD schemas with position/rotation/dimension
constraints. Reservation schemas: createReservation requires
requestedTime; addWalkin omits it. seatReservation accepts an
optional tableId (defaults to reservation.tableId).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pure helpers — `deriveTableState` + `isReservationImminent`

**Files:**
- Create: `apps/api/src/floor/state.ts`
- Create: `apps/api/src/floor/state.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { deriveTableState, isReservationImminent } from './state.js';

describe('deriveTableState', () => {
  it('CLEANING wins over everything', () => {
    expect(deriveTableState({ manualState: 'CLEANING', hasOpenTicket: true, hasImminentReservation: true })).toBe('CLEANING');
  });
  it('OCCUPIED when ticket open', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: true, hasImminentReservation: false })).toBe('OCCUPIED');
  });
  it('RESERVED when no ticket but imminent reservation', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: false, hasImminentReservation: true })).toBe('RESERVED');
  });
  it('AVAILABLE otherwise', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: false, hasImminentReservation: false })).toBe('AVAILABLE');
  });
  it('OCCUPIED beats RESERVED', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: true, hasImminentReservation: true })).toBe('OCCUPIED');
  });
});

describe('isReservationImminent', () => {
  const now = new Date('2026-04-28T19:00:00Z');

  it('CONFIRMED 10 minutes away → imminent', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(true);
  });
  it('CONFIRMED 30 minutes away → not imminent (default 15min window)', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T19:30:00Z'),
      now,
    })).toBe(false);
  });
  it('PENDING in window → still imminent', () => {
    expect(isReservationImminent({
      status: 'PENDING',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(true);
  });
  it('CANCELLED in window → not imminent', () => {
    expect(isReservationImminent({
      status: 'CANCELLED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(false);
  });
  it('SEATED in window → not imminent (already seated)', () => {
    expect(isReservationImminent({
      status: 'SEATED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(false);
  });
  it('null requestedTime → not imminent (walkin)', () => {
    expect(isReservationImminent({
      status: 'WAITING',
      requestedTime: null,
      now,
    })).toBe(false);
  });
  it('past requestedTime within window → still imminent', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T18:50:00Z'),
      now,
    })).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @app/api test floor/state
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/api/src/floor/state.ts`**

```ts
export type DerivedTableState = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

export function deriveTableState(args: {
  manualState: 'NONE' | 'CLEANING';
  hasOpenTicket: boolean;
  hasImminentReservation: boolean;
}): DerivedTableState {
  if (args.manualState === 'CLEANING') return 'CLEANING';
  if (args.hasOpenTicket) return 'OCCUPIED';
  if (args.hasImminentReservation) return 'RESERVED';
  return 'AVAILABLE';
}

export function isReservationImminent(args: {
  status: 'PENDING' | 'CONFIRMED' | 'WAITING' | 'SEATED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  requestedTime: Date | null;
  now: Date;
  windowMinutes?: number;
}): boolean {
  if (args.requestedTime === null) return false;
  if (args.status !== 'PENDING' && args.status !== 'CONFIRMED') return false;
  const window = (args.windowMinutes ?? 15) * 60_000;
  const diff = args.requestedTime.getTime() - args.now.getTime();
  return Math.abs(diff) <= window;
}
```

- [ ] **Step 4: Run tests; should pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/floor/
git commit -m "$(cat <<'EOF'
feat(api): add floor state derivation helpers

deriveTableState: CLEANING > OCCUPIED > RESERVED > AVAILABLE.
isReservationImminent: ±15min window of requestedTime, only for
PENDING/CONFIRMED reservations. Reusable from queries, subscriptions,
and mutations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — API: types + queries

### Task 4: Section / Table / Reservation GraphQL types and queries

**Files (compressed task — apply established patterns):**
- `apps/api/src/schema/enums.ts` — append `TableShape`, `TableManualState`, `TableState`, `ReservationKind`, `ReservationStatus` enums.
- `apps/api/src/schema/section.ts` — `Section` prismaObject + `Query.floorSections`.
- `apps/api/src/schema/table.ts` — `Table` prismaObject + computed fields + `Query.floorTables`.
- `apps/api/src/schema/reservation.ts` — `Reservation` prismaObject + queries: `reservationsForDay`, `reservationsActive`, `waitlist`, `reservation`.
- Modify `apps/api/src/schema/index.ts` — register the new modules.
- Modify `apps/api/src/schema/ticket.ts` — add a relation field on Ticket: `table: t.relation('table', { nullable: true })`.
- Tests: `section.test.ts`, `table.test.ts`, `reservation.test.ts` covering the resolvers (pure-function extraction).

**Field details:**

`Table` computed fields:
- `state: TableState!` — uses `deriveTableState`. Resolver loads a tally of open tickets where `tableId === parent.id` (use a small dataloader keyed on tableId for batching), and a tally of imminent reservations via `prisma.reservation.findMany({ where: { tableId: parent.id, status: { in: ['PENDING', 'CONFIRMED'] }, requestedTime: { gte: now-15min, lte: now+15min } } })`. Returns the derived state.
- `activeTicket: Ticket` — `findFirst({ where: { tableId, status: 'OPEN' } })`.
- `upcomingReservation: Reservation` — `findFirst({ where: { tableId, status: 'CONFIRMED', requestedTime: { gte: now, lte: now+2h } }, orderBy: { requestedTime: 'asc' } })`.

Each field-level resolver is pure-function-extracted as `resolveTableState(parent, ctx)`, etc.

**Queries (all `staff` scope, location-scoped):**
- `Query.floorSections` — non-archived sections at viewer location, ordered by sortOrder asc.
- `Query.floorTables` — non-archived tables at viewer location, with relations preloaded.
- `Query.reservationsForDay(date)` — reservations on the given day (between 00:00 and 23:59:59 in viewer's location timezone). Use `formatInTimeZone` from `date-fns-tz` for boundary computation.
- `Query.reservationsActive` — `WAITING + SEATED` at viewer location.
- `Query.waitlist` — `kind = WALKIN AND status = WAITING`, ordered by createdAt asc.
- `Query.reservation(id)` — single, location-scoped.

**Verification:** typecheck clean, all tests green.

**Commit:** `feat(api): add Section / Table / Reservation GraphQL types and floor queries`

---

## Phase 3 — API: mutations

### Task 5: Floor edit mutations + manual state + assign server + open-ticket-at-table

Files (under `apps/api/src/schema/mutations/floor/`):
- `inputs.ts` (Pothos input types).
- `index.ts` (registers all).
- `create-section.ts`, `update-section.ts`, `archive-section.ts`, `reorder-sections.ts`
- `create-table.ts`, `update-table.ts`, `archive-table.ts`
- `assign-table-server.ts`
- `set-table-manual-state.ts`
- `open-ticket-at-table.ts`
- One test file per mutation.
- Modify `apps/api/src/schema/index.ts`: `import './mutations/floor/index.js';`

**Conventions:**
- All `manager` scope EXCEPT `setTableManualState` and `openTicketAtTable` which are `staff`.
- Validate via `@repo/validation/floor`.
- Resolver checks the entity belongs to `ctx.auth.location.id` (location-scoped). NotFoundError if not.
- After successful mutation: `pubsub.publish(floorChannelName(locationId), { kind: 'TableChanged', tableId })` (or `SectionChanged`).
- `openTicketAtTable`:
  - Verify the table belongs to viewer's location and is not archived.
  - Verify no active OPEN ticket already bound to this table; if there is, ConflictError "Table already has an open ticket".
  - Reuse the POS `openTicket` resolver/helper to create the ticket: same shortNumber computation, businessDay, etc. Pass `tableId = input.tableId` and `customerLabel = input.customerLabel ?? null` and `orderType = 'DINE_IN'`.
  - Audit: `ticket.opened_at_table` (in addition to the standard `ticket.opened` from POS).
  - Publish both `TicketChanged` (POS channel) and `TableChanged` (floor channel).

**Audit codes** per spec section 4.7.

**Tests** (pure-function): happy + forbidden + cross-location violation per mutation.

**Commit:** `feat(api): add floor edit mutations (sections, tables, server assign, manual state, open-ticket-at-table)`

---

### Task 6: Reservation mutations

Files (under `apps/api/src/schema/mutations/reservations/`):
- `inputs.ts`, `index.ts`
- `create-reservation.ts`, `update-reservation.ts`, `confirm-reservation.ts`, `cancel-reservation.ts`, `mark-no-show.ts`, `add-walkin.ts`, `seat-reservation.ts`, `complete-reservation.ts`
- One test file per mutation.
- Modify `apps/api/src/schema/index.ts`: register.

**Conventions:**
- `createReservation`, `updateReservation`, `confirmReservation`, `cancelReservation`, `markNoShow`, `completeReservation`: `manager` scope.
- `addWalkin`, `seatReservation`: `staff` scope.
- Validate via `@repo/validation/reservation`.
- Status transitions guarded:
  - `confirmReservation`: PENDING → CONFIRMED only.
  - `cancelReservation`: PENDING/CONFIRMED/WAITING → CANCELLED.
  - `markNoShow`: CONFIRMED → NO_SHOW (only after `requestedTime` has passed).
  - `seatReservation`: CONFIRMED/PENDING/WAITING → SEATED (in a transaction: open a Ticket bound to the table, link via `ticketId`, update status, set `seatedAt`).
  - `completeReservation`: SEATED → COMPLETED.
- Tableid validation: must belong to viewer's location.
- Audit codes per spec.
- After mutation: publish `ReservationChanged` event on floor channel; if the reservation has a tableId, also publish `TableChanged`.

**`seatReservation` specifics:**
- Looks up reservation, validates state.
- `tableId = input.tableId ?? reservation.tableId` (must be non-null after this; otherwise ConflictError "No table assigned").
- Calls a shared helper `openTicketBoundToTable({ prisma, ctx, tableId, customerLabel, orderType: 'DINE_IN' })` (same logic as `openTicketAtTable` from Task 5 — extract a helper in `apps/api/src/floor/open-ticket.ts`).
- In the transaction: update reservation with `status='SEATED'`, `ticketId`, `tableId`, `seatedAt=now()`.
- Returns `{ reservation, ticket }`.

**Tests:** happy + forbidden + state-transition violation per mutation; `seatReservation` with no tableId → ConflictError.

**Commit:** `feat(api): add reservation mutations (CRUD, lifecycle, walk-in, seat, complete)`

---

## Phase 4 — API: subscription + POS integration

### Task 7: `floorUpdates` subscription + auto-complete reservation on POS close

**Files:**
- Create: `apps/api/src/schema/subscriptions/floor-updates.ts` — analogous to `ticket-updates.ts`.
- Modify: `apps/api/src/schema/subscriptions/index.ts` — register.
- Modify: `apps/api/src/pubsub.ts` — add `floorChannelName(locationId)` helper next to `ticketChannelName`.
- Create: `apps/api/src/floor/post-close.ts` — `completeReservationAfterClose({ prisma, ticketId, locationId, ctx })` helper.
- Modify: `apps/api/src/schema/mutations/pos/close-ticket.ts` — call the helper as a side-effect after the close transaction commits.
- Tests: `floor-updates.test.ts` covering the subscription generator; integration test of the auto-complete hook.

**`floorUpdates` subscription** mirrors the `ticketUpdates` pattern:
- Two payload types: `TableChanged` and `ReservationChanged`.
- Union `FloorUpdateEvent`.
- Subscribes to `floorChannelName(ctx.auth.location.id)`.
- On each raw event, hydrates the entity via Prisma and yields.

**`completeReservationAfterClose`:**
```ts
export async function completeReservationAfterClose(args: {
  prisma: PrismaClient;
  ticketId: string;
  locationId: string;
}): Promise<void> {
  const reservation = await args.prisma.reservation.findFirst({
    where: { ticketId: args.ticketId, status: 'SEATED' },
  });
  if (!reservation) return;
  await args.prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await pubsub.publish(floorChannelName(args.locationId), {
    kind: 'ReservationChanged',
    reservationId: reservation.id,
  });
  if (reservation.tableId) {
    await pubsub.publish(floorChannelName(args.locationId), {
      kind: 'TableChanged',
      tableId: reservation.tableId,
    });
  }
}
```

Call from `closeTicket` resolver immediately after the transaction commits, before the `ticket.closed` audit/publish. Wrap in try/catch — never let a reservation-side failure block the POS close.

**Verify:** all tests green; floor + POS regressions intact.

**Commit:** `feat(api): add floorUpdates SSE subscription and auto-complete reservation on POS close`

---

## Phase 5 — API: Integration tests

### Task 8: Floor + Reservation integration suite

File: `apps/api/src/test/integration/floor-reservations.test.ts`. Reuse `setupTestDb`, `truncateAll` (extend to include sections/tables/reservations).

Add a `seedFloorFixtures(prisma, opts)` helper: creates a section + 3 tables + a manager + staff user. Returns ids.

Scenarios (from spec section 6.2):
1. `floorTables` returns AVAILABLE state for fresh tables.
2. Open ticket at table → table state becomes OCCUPIED. Close ticket → AVAILABLE. (Use the resolver pure functions directly.)
3. Seat reservation → opens ticket, links reservation, table OCCUPIED.
4. Cross-tenant + cross-location isolation.
5. Walk-in: addWalkin → status WAITING; seatReservation → SEATED + ticket; complete via closeTicket → COMPLETED.
6. Cancel reservation preserves status + reason.
7. POS closeTicket auto-completes linked reservation. Verify via `prisma.reservation.findUnique` after close.
8. Subscription emit: each floor mutation publishes the corresponding event.
9. Audit codes per spec section 4.7.

**Verify:** `pnpm --filter @app/api test` green. Foundation + POS regression suites still green.

**Commit:** `test(api): add floor + reservation integration suite`

---

## Phase 6 — Web: Floor UIs

### Task 9: Live floor view + FloorCanvas + GraphQL operations

Files:
- `apps/web/lib/graphql/operations/floor.graphql` — full operations file (queries, mutations, subscription).
- Refresh static SDL `apps/web/lib/graphql/schema.graphql` and run codegen.
- `packages/ui/src/patterns/floor-canvas.tsx` — SVG renderer; props `{ tables, sections, mode: 'view' | 'edit', onTableClick?, onTableMove? }`.
- `packages/ui/src/patterns/table-tile.tsx` — single SVG `<g>` with rect/circle, label, capacity, state-tinted fill. Exports state→color mapping.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/page.tsx` — server-component shell.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/layout.tsx` — staff-scope guard.
- `apps/web/components/floor/live-floor.tsx` — main client component using subscription + query.
- `apps/web/components/floor/table-action-sheet.tsx` — bottom sheet (or dialog) showing per-state actions.

**Behaviour:**
- `useQuery(FloorTablesDocument)` + `useSubscription(FloorUpdatesDocument)`.
- Top bar: location name, "All sections" / per-section filter, "My tables" toggle, status legend, live counts.
- Click a table → `<TableActionSheet>` with state-conditional actions:
  - AVAILABLE: "Open ticket" (calls `OpenTicketAtTableMutation`, then router.push to POS), "Mark cleaning", "Edit table" (manager only).
  - OCCUPIED: "Open in POS" (deep link to `/pos?ticket=<id>`), "Mark cleaning" (warns if there's still a ticket).
  - RESERVED: "Seat now" (calls `SeatReservationMutation` for the upcoming reservation), "View reservation".
  - CLEANING: "Mark available" (sets manualState NONE).
- Manager-only links route to `/floor/edit`.

**GraphQL operations (`floor.graphql`):**

```graphql
query FloorTables {
  floorTables {
    id label capacity shape positionX positionY width height rotation
    manualState archivedAt
    section { id name }
    assignedServer { id name }
    state
    activeTicket { id shortNumber customerLabel totalCents }
    upcomingReservation { id guestName partySize requestedTime }
  }
}

query FloorSections { floorSections { id name sortOrder } }

query ReservationsForDay($date: Date!) {
  reservationsForDay(date: $date) {
    id kind status guestName guestPhone partySize requestedTime durationMinutes
    notes seatedAt completedAt cancelReason
    table { id label }
  }
}

query Waitlist {
  waitlist {
    id guestName guestPhone partySize notes createdAt
  }
}

query Reservation($id: UUID!) {
  reservation(id: $id) {
    id kind status guestName guestPhone partySize notes
    requestedTime durationMinutes seatedAt completedAt noShowAt cancelledAt cancelReason
    table { id label }
    ticket { id shortNumber }
    createdBy { id name }
    createdAt
  }
}

# Mutations
mutation CreateSection($input: CreateSectionInput!) { createSection(input: $input) { id name } }
mutation UpdateSection($input: UpdateSectionInput!) { updateSection(input: $input) { id } }
mutation ArchiveSection($input: ArchiveSectionInput!) { archiveSection(input: $input) { id archivedAt } }
mutation ReorderSections($input: ReorderSectionsInput!) { reorderSections(input: $input) { id sortOrder } }
mutation CreateTable($input: CreateTableInput!) { createTable(input: $input) { id label } }
mutation UpdateTable($input: UpdateTableInput!) { updateTable(input: $input) { id } }
mutation ArchiveTable($input: ArchiveTableInput!) { archiveTable(input: $input) { id archivedAt } }
mutation AssignTableServer($input: AssignTableServerInput!) { assignTableServer(input: $input) { id assignedServer { id name } } }
mutation SetTableManualState($input: SetTableManualStateInput!) { setTableManualState(input: $input) { id manualState } }
mutation OpenTicketAtTable($input: OpenTicketAtTableInput!) { openTicketAtTable(input: $input) { id shortNumber } }

mutation CreateReservation($input: CreateReservationInput!) { createReservation(input: $input) { id status } }
mutation UpdateReservation($input: UpdateReservationInput!) { updateReservation(input: $input) { id } }
mutation ConfirmReservation($input: ConfirmReservationInput!) { confirmReservation(input: $input) { id status } }
mutation CancelReservation($input: CancelReservationInput!) { cancelReservation(input: $input) { id status cancelReason } }
mutation MarkNoShow($input: MarkNoShowInput!) { markReservationNoShow(input: $input) { id status } }
mutation AddWalkin($input: AddWalkinInput!) { addWalkin(input: $input) { id status } }
mutation SeatReservation($input: SeatReservationInput!) {
  seatReservation(input: $input) {
    reservation { id status seatedAt }
    ticket { id shortNumber }
  }
}
mutation CompleteReservation($input: CompleteReservationInput!) { completeReservation(input: $input) { id status } }

subscription FloorUpdates {
  floorUpdates {
    __typename
    ... on TableChanged { table { id state activeTicket { id } } }
    ... on ReservationChanged { reservation { id status } }
  }
}
```

**Tests:** `<LiveFloor>` renders correct table colors per state; clicking a table opens action sheet with correct buttons.

**Verify** typecheck + build + tests.

**Commit:** `feat(web): add live floor view with FloorCanvas pattern and table action sheet`

---

### Task 10: Floor plan editor

Files:
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/edit/page.tsx`
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/floor/edit/layout.tsx` — manager-scope guard.
- `apps/web/components/floor/floor-editor.tsx` — main editor (client component).
- `apps/web/components/floor/section-list.tsx` — left sidebar.
- `apps/web/components/floor/table-inspector.tsx` — right sidebar for the selected table.
- `apps/web/components/floor/add-table-palette.tsx` — drag-source for new tables.

**Behaviour:**
- `useQuery(FloorTablesDocument)` + `useQuery(FloorSectionsDocument)`.
- `<FloorCanvas mode="edit" onTableClick onTableMove>`. Drag handle on each table; while dragging, snap to 8px grid; on drop, fire `UpdateTableMutation` (debounced 300ms).
- Selected table id stored in component state; right sidebar shows the selected table's properties with controls:
  - Label (Input), Capacity (number), Shape (select RECT/CIRCLE), Width (number), Height (number), Rotation (radio 0/90/180/270), Section (select), Assigned Server (Select from a `tenantMembers`-style query — reuse the existing query if available; otherwise add a thin `Query.locationStaff` resolver returning users with active staff+ membership at this location). Save → `UpdateTableMutation`. Archive button.
- Add-table palette: drag from one of "2-top rect", "4-top rect", "6-top circle", "8-top circle" onto the canvas → `CreateTableMutation` with default sectionId from currently selected section.
- Section management in the left sidebar: list, drag-to-reorder, add, archive.

> **Pragmatic note:** drag-and-drop on SVG is finicky. Use plain pointer events on the `<g>` elements: `onPointerDown` to start drag, `window.onPointerMove` while dragging, `onPointerUp` to commit. Track drag state in a ref.

**Tests:** `<FloorEditor>` selects a table on click; updates fire mutation on drop.

**Commit:** `feat(web): add floor plan editor with drag-to-position and inspector`

---

### Task 11: Reservations book + walk-in waitlist

Files:
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/reservations/layout.tsx` — staff scope (read), gates writes via UI.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/reservations/page.tsx`
- `apps/web/components/reservations/reservations-page.tsx` — client component.
- `apps/web/components/reservations/new-reservation-dialog.tsx`
- `apps/web/components/reservations/reservation-row.tsx`
- `apps/web/components/reservations/seat-dialog.tsx` — pick a table and seat.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/waitlist/layout.tsx` — staff scope.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/waitlist/page.tsx`
- `apps/web/components/reservations/waitlist-page.tsx` — client component.
- `apps/web/components/reservations/add-walkin-form.tsx`

**Behaviour (reservations book):**
- Date picker with default = today (uses location timezone).
- `useQuery(ReservationsForDayDocument, { date })` + `useSubscription(FloorUpdatesDocument)` to refetch.
- `<DataTable>` with rows ordered by requestedTime asc. Status pill, action buttons per state:
  - PENDING: Confirm / Edit / Cancel.
  - CONFIRMED: Seat / Edit / Mark no-show / Cancel.
  - SEATED: "Open ticket" (deep link to POS).
  - COMPLETED / NO_SHOW / CANCELLED: read-only.
- "New reservation" CTA → `<NewReservationDialog>`. Form fields per `createReservationSchema`. Optional table dropdown shows only tables with `capacity >= partySize`.
- Seat flow: `<SeatDialog>` lists tables matching capacity + state filter (AVAILABLE preferred). Submit → `SeatReservationMutation`; on success toast + refetch + offer "Open ticket in POS" link.

**Behaviour (waitlist):**
- `useQuery(WaitlistDocument)` + subscription refetch.
- Single ordered list, oldest first. Each row: guestName, partySize, time-since-added (auto-update every 30s), notes, "Seat" button (opens seat dialog) and "Cancel" button.
- "Add walk-in" inline form at the top.

**Tests:** new-reservation-dialog validates fields; waitlist row formatting.

**Commit:** `feat(web): add reservations book and walk-in waitlist`

---

## Phase 7 — Playwright E2E

### Task 12: Two new E2E specs

Files:
- `apps/web/tests/e2e/floor-flow.spec.ts`
- `apps/web/tests/e2e/reservation-flow.spec.ts`
- Modify `apps/web/tests/e2e/fixtures/seed.ts` — add `createFloorFixtures()` (one section + a few tables for Acme/Mission St).

**`floor-flow.spec.ts`:**
1. Sign in as owner.
2. Navigate to `/acme/mission-st/floor/edit`. Add section "Main". Drag a 4-top RECT onto the canvas. Verify it persists (refetch shows it).
3. Navigate to `/acme/mission-st/floor`. Verify the new table appears AVAILABLE.
4. Click the table → "Open ticket". Lands on POS with the ticket bound.
5. Use API helpers to add an item, fire, mark served, close.
6. Return to `/floor`. Within 5s, table is AVAILABLE again.

**`reservation-flow.spec.ts`:**
1. Sign in as owner.
2. Navigate to `/acme/mission-st/reservations`. Click "New reservation". Fill: John, 4, today + 1 hour, no specific table. Submit.
3. Click Confirm on the new row. Status updates to CONFIRMED.
4. Click Seat → SeatDialog opens; pick the seeded table. Submit. Status flips to SEATED.
5. Use API helper to close the ticket. Reservation auto-completes (status COMPLETED).

**Verify:** all 12 E2E specs pass (10 prior + 2 new).

**Commit:** `test(web): add E2E specs for floor flow and reservation flow`

---

## Self-review

**Spec coverage:**
- Section 2 (architecture) → Tasks 1, 4–11.
- Section 3 (data model) → Task 1.
- Section 4 (GraphQL) → Tasks 4–7; pure helpers section 4.5 → Task 3; POS integration 4.6 → Task 7.
- Section 5 (UI) → Tasks 9–11.
- Section 6 (testing) → Tasks 3, 4, 5, 6, 7, 8 (api), 9, 10, 11 (web unit), 12 (E2E).
- Section 7 (scope guard) honored.
- Section 8 (acceptance criteria) verified in Tasks 8 + 12.

**Placeholder sweep:** Tasks 4–11 use bullet-point steps; Foundation/Menu/POS waves established that the executor can apply the patterns. Novel pieces (helpers, POS integration hook) have full code. No TBDs.

**Type consistency:** `TableState`, `Table`, `Section`, `Reservation`, `ReservationStatus`, `ReservationKind`, `deriveTableState`, `isReservationImminent`, `floorChannelName`, `completeReservationAfterClose` — all referenced consistently.
