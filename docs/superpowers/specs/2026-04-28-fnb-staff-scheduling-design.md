# F&B Control Pane — Staff & Scheduling Sub-Project Design

**Date:** 2026-04-28
**Status:** Approved (blanket approval; ready for planning)
**Sub-project:** 5 of 7 — Staff & Scheduling
**Depends on:** Foundation (0). Independent of POS / Floor.

---

## 1. Project context

### 1.1 What this owns

Per-location shift schedules, employment profiles, time clock with punch-in/out, time-entry reports. **Not** payroll runs (out of scope), **not** shift swaps / open-shifts (deferred), **not** geofencing or photo-on-clock-in.

### 1.2 Locked decisions

| Decision | Choice |
|---|---|
| Job roles (separate from RBAC) | Tenant-scoped `JobRole` (Server, Cook, Bar, Host, etc.); each Shift carries a `jobRoleId` |
| Employment profile | Per `(userId, locationId)` `EmploymentProfile` with hourly rate, employment type, hire/termination dates |
| Shift model | `Shift(locationId, userId, jobRoleId, startsAt, endsAt, status, notes)` with status DRAFT / PUBLISHED / CANCELLED; one shift per row, no series/recurrence in v1 |
| Schedule grouping | No `Schedule` parent entity in v1 — publish per-shift with bulk-publish UI |
| Availability | `AvailabilityWindow(userId, dayOfWeek, startTime, endTime)` informational; not enforced in v1 |
| Time clock | `TimeEntry(userId, locationId, shiftId?, clockedInAt, clockedOutAt?, totalBreakMinutes)` — single record per punch-in; nullable shiftId allows ad-hoc clock-ins |
| Breaks | `Break(timeEntryId, startedAt, endedAt?)` rows; total minutes denormalized on TimeEntry on punch-out |
| Real-time | SSE `scheduleUpdates(locationId)` for shift + time-entry changes |
| Payroll | Out of scope |
| Shift swap / open shifts board | Deferred |
| Geofencing / photo-clockin | Deferred |
| Time-entry edit by manager | Allowed (manager scope, with audit) |

### 1.3 RBAC

| Operation | Scope |
|---|---|
| View own employment profile, own shifts, own time entries | `staff` (self only) |
| View staff roster across location | `manager` |
| Edit employment profile | `admin` (handles wages — sensitive) |
| Manage job roles (CRUD) | `admin` |
| Create / edit / publish / cancel shifts | `manager` |
| Set availability windows for self | `staff` |
| Edit availability for others | `manager` |
| Punch in / punch out (self) | `staff` |
| Start / end break (self) | `staff` |
| Edit time entry (any) | `manager` |
| View time-entry report | `manager` |

---

## 2. Architecture

Purely additive. New models, no changes to Foundation/Menu/POS/Floor.

```
packages/db/prisma/schema.prisma                     ← additions
packages/validation/src/schedule.ts                   ← already exists for menu schedules
                                                     ← rename existing → menu-schedule.ts? No, keep distinct names.
packages/validation/src/staff.ts                      ← new
packages/validation/src/time-clock.ts                 ← new
packages/ui/src/patterns/week-grid.tsx                ← schedule week-view primitive
packages/ui/src/patterns/punch-clock.tsx              ← clock-in/out kiosk button

apps/api/src/scheduling/                              ← pure helpers
  ├─ overlap.ts        (detectShiftOverlap, computeShiftHours)
  ├─ time-entry.ts     (computePunchedHours, validatePunchTransition)
apps/api/src/schema/job-role.ts
apps/api/src/schema/employment-profile.ts
apps/api/src/schema/shift.ts
apps/api/src/schema/availability.ts
apps/api/src/schema/time-entry.ts
apps/api/src/schema/mutations/staff/                  ← job role + employment + availability mutations
apps/api/src/schema/mutations/scheduling/             ← shift mutations
apps/api/src/schema/mutations/time-clock/             ← punch in/out, break start/end, time-entry edit
apps/api/src/schema/subscriptions/schedule-updates.ts
apps/api/src/test/integration/staff-scheduling.test.ts

apps/web/app/(app)/[tenantSlug]/admin/staff/                        ← roster + employment profiles
apps/web/app/(app)/[tenantSlug]/admin/job-roles/                    ← job role CRUD
apps/web/app/(app)/[tenantSlug]/[locationSlug]/schedule/            ← schedule editor (manager)
apps/web/app/(app)/[tenantSlug]/[locationSlug]/my-schedule/         ← my upcoming shifts (staff)
apps/web/app/(app)/[tenantSlug]/[locationSlug]/time-clock/          ← punch clock kiosk
apps/web/app/(app)/[tenantSlug]/[locationSlug]/time-entries/        ← time-entry report (manager)
apps/web/lib/graphql/operations/staff.graphql
```

---

## 3. Data model

```prisma
model JobRole {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  name        String
  color       String    @default("#6366f1")
  archivedAt  DateTime? @map("archived_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  shifts Shift[]

  @@unique([tenantId, name])
  @@index([tenantId])
  @@map("job_roles")
}

model EmploymentProfile {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  locationId      String    @map("location_id") @db.Uuid
  employmentType  EmploymentType @default(FULL_TIME) @map("employment_type")
  hourlyRateCents Int?      @map("hourly_rate_cents")
  hireDate        DateTime  @map("hire_date") @db.Date
  terminationDate DateTime? @map("termination_date") @db.Date
  notes           String?
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  user     User     @relation("UserEmploymentProfile", fields: [userId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([userId, locationId])
  @@index([locationId])
  @@map("employment_profiles")
}

model AvailabilityWindow {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String      @map("user_id") @db.Uuid
  dayOfWeek   DayOfWeekDb @map("day_of_week")
  startTime   String      @map("start_time")    // "08:00" — local
  endTime     String      @map("end_time")      // "18:00"
  notes       String?
  createdAt   DateTime    @default(now()) @map("created_at")

  user User @relation("UserAvailability", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("availability_windows")
}

model Shift {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId  String      @map("location_id") @db.Uuid
  userId      String      @map("user_id") @db.Uuid
  jobRoleId   String      @map("job_role_id") @db.Uuid
  startsAt    DateTime    @map("starts_at")
  endsAt      DateTime    @map("ends_at")
  status      ShiftStatus @default(DRAFT)
  notes       String?
  createdById String      @map("created_by_id") @db.Uuid
  cancelledAt DateTime?   @map("cancelled_at")
  cancelReason String?    @map("cancel_reason")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  location  Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  user      User     @relation("UserShift", fields: [userId], references: [id], onDelete: Restrict)
  jobRole   JobRole  @relation(fields: [jobRoleId], references: [id], onDelete: Restrict)
  createdBy User     @relation("ShiftCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  timeEntries TimeEntry[]

  @@index([locationId, startsAt])
  @@index([userId, startsAt])
  @@map("shifts")
}

model TimeEntry {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId          String    @map("location_id") @db.Uuid
  userId              String    @map("user_id") @db.Uuid
  shiftId             String?   @map("shift_id") @db.Uuid
  clockedInAt         DateTime  @map("clocked_in_at")
  clockedOutAt        DateTime? @map("clocked_out_at")
  totalBreakMinutes   Int       @default(0) @map("total_break_minutes")
  manualEdit          Boolean   @default(false) @map("manual_edit")
  manualEditReason    String?   @map("manual_edit_reason")
  manualEditById      String?   @map("manual_edit_by_id") @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  location     Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  user         User     @relation("UserTimeEntry", fields: [userId], references: [id], onDelete: Restrict)
  shift        Shift?   @relation(fields: [shiftId], references: [id], onDelete: SetNull)
  manualEditBy User?    @relation("TimeEntryEditBy", fields: [manualEditById], references: [id], onDelete: SetNull)
  breaks       Break[]

  @@index([userId, clockedInAt])
  @@index([locationId, clockedInAt])
  @@map("time_entries")
}

model Break {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  timeEntryId  String    @map("time_entry_id") @db.Uuid
  startedAt    DateTime  @map("started_at")
  endedAt      DateTime? @map("ended_at")

  timeEntry TimeEntry @relation(fields: [timeEntryId], references: [id], onDelete: Cascade)

  @@index([timeEntryId])
  @@map("breaks")
}

enum EmploymentType { FULL_TIME PART_TIME CONTRACTOR }
enum ShiftStatus    { DRAFT PUBLISHED CANCELLED }
enum DayOfWeekDb    { MON TUE WED THU FRI SAT SUN }
```

Foundation-side relations to add on `User`: `employmentProfiles`, `availabilityWindows`, `shifts` (UserShift), `shiftsCreated` (ShiftCreatedBy), `timeEntries` (UserTimeEntry), `timeEntryEdits` (TimeEntryEditBy). On `Tenant`: `jobRoles`. On `Location`: `employmentProfiles`, `shifts`, `timeEntries`.

CHECK constraint on `shifts`: `CHECK (ends_at > starts_at)`.

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type JobRole          { id: UUID! name: String! color: String! archivedAt: DateTime }
type EmploymentProfile {
  id: UUID! employmentType: EmploymentType! hourlyRateCents: Int
  hireDate: Date! terminationDate: Date notes: String
  user: User! location: Location!
}
type AvailabilityWindow { id: UUID! dayOfWeek: DayOfWeek! startTime: String! endTime: String! notes: String }
type Shift {
  id: UUID! startsAt: DateTime! endsAt: DateTime!
  status: ShiftStatus! notes: String cancelReason: String
  user: User! jobRole: JobRole! location: Location!
  createdBy: User! createdAt: DateTime!
  durationMinutes: Int!     # computed
}
type TimeEntry {
  id: UUID! clockedInAt: DateTime! clockedOutAt: DateTime
  totalBreakMinutes: Int! manualEdit: Boolean! manualEditReason: String
  user: User! location: Location! shift: Shift breaks: [Break!]!
  netMinutes: Int!         # clocked out − clocked in − totalBreakMinutes; null if still active
}
type Break  { id: UUID! startedAt: DateTime! endedAt: DateTime }

enum EmploymentType { FULL_TIME PART_TIME CONTRACTOR }
enum ShiftStatus    { DRAFT PUBLISHED CANCELLED }
enum DayOfWeek      { MON TUE WED THU FRI SAT SUN }
```

### 4.2 Queries

```graphql
extend type Query {
  jobRoles: [JobRole!]!                                          # tenant-wide
  staffRoster: [EmploymentProfile!]!                             # at viewer location, manager scope
  employmentProfile(userId: UUID!): EmploymentProfile            # any user; admin or self
  myAvailability: [AvailabilityWindow!]!
  userAvailability(userId: UUID!): [AvailabilityWindow!]!        # manager scope

  scheduleForWeek(weekStart: Date!): [Shift!]!                   # manager scope
  myShifts(from: Date, to: Date): [Shift!]!                      # self
  shift(id: UUID!): Shift

  myActiveTimeEntry: TimeEntry                                   # the open punch, or null
  timeEntries(filter: TimeEntriesFilter): [TimeEntry!]!          # manager
}

input TimeEntriesFilter { fromDate: Date toDate: Date userId: UUID }
```

### 4.3 Mutations

```graphql
extend type Mutation {
  # Job roles (admin)
  createJobRole(input: CreateJobRoleInput!): JobRole!
  updateJobRole(input: UpdateJobRoleInput!): JobRole!
  archiveJobRole(input: ArchiveJobRoleInput!): JobRole!

  # Employment profiles (admin)
  upsertEmploymentProfile(input: UpsertEmploymentProfileInput!): EmploymentProfile!
  endEmployment(input: EndEmploymentInput!): EmploymentProfile!     # sets terminationDate

  # Availability (self for own; manager for others)
  setMyAvailability(input: SetAvailabilityInput!): [AvailabilityWindow!]!
  setUserAvailability(input: SetUserAvailabilityInput!): [AvailabilityWindow!]!

  # Shifts (manager)
  createShift(input: CreateShiftInput!): Shift!
  updateShift(input: UpdateShiftInput!): Shift!
  publishShift(input: PublishShiftInput!): Shift!                  # DRAFT → PUBLISHED
  publishWeek(input: PublishWeekInput!): [Shift!]!                 # bulk
  cancelShift(input: CancelShiftInput!): Shift!
  duplicateWeek(input: DuplicateWeekInput!): [Shift!]!             # copy current week → next week

  # Time clock (staff)
  punchIn(input: PunchInInput!): TimeEntry!                        # creates TimeEntry, optionally bound to a shift
  punchOut(input: PunchOutInput!): TimeEntry!                      # closes the active TimeEntry
  startBreak(input: StartBreakInput!): Break!
  endBreak(input: EndBreakInput!): Break!

  # Manager edits (manager)
  editTimeEntry(input: EditTimeEntryInput!): TimeEntry!            # manualEdit flag set, reason required
}

input CreateShiftInput {
  userId: UUID!
  jobRoleId: UUID!
  startsAt: DateTime!
  endsAt: DateTime!
  notes: String
}
```

### 4.4 Subscription

```graphql
extend type Subscription {
  scheduleUpdates: ScheduleUpdateEvent!
}
union ScheduleUpdateEvent = ShiftChanged | TimeEntryChanged
type ShiftChanged     { shift: Shift! }
type TimeEntryChanged { timeEntry: TimeEntry!, userId: UUID! }
```

Channel `schedule_updates_<locationId>`.

### 4.5 Pure helpers

```ts
// apps/api/src/scheduling/overlap.ts
export function detectShiftOverlap(args: {
  candidate: { userId: string; startsAt: Date; endsAt: Date };
  existing: Array<{ id: string; userId: string; startsAt: Date; endsAt: Date; status: 'DRAFT'|'PUBLISHED'|'CANCELLED' }>;
}): { id: string }[];   // overlapping non-cancelled shifts, same user

export function computeShiftHours(s: { startsAt: Date; endsAt: Date }): number;

// apps/api/src/scheduling/time-entry.ts
export function computePunchedMinutes(e: {
  clockedInAt: Date; clockedOutAt: Date | null; totalBreakMinutes: number;
  now: Date;
}): number;

export function validatePunchTransition(args: {
  current: 'NONE' | 'PUNCHED_IN' | 'ON_BREAK';
  action: 'PUNCH_IN' | 'PUNCH_OUT' | 'START_BREAK' | 'END_BREAK';
}): boolean;
```

### 4.6 Audit codes

```
job_role.created / updated / archived
employment.upserted / ended
availability.set
shift.created / updated / published / cancelled
schedule.week_published / week_duplicated
time_entry.punched_in / punched_out / break_started / break_ended / manually_edited
```

---

## 5. UI shape

### 5.1 Staff admin — `/<tenant>/admin/staff`
DataTable<EmploymentProfile> with name, employment type, hire date, hourly rate (admin only column), location, status. Row → detail drawer with editable form. "Invite member" CTA already exists in admin/members.

### 5.2 Job roles — `/<tenant>/admin/job-roles`
DataTable<JobRole> with name, color swatch, archived badge. Inline edit, archive.

### 5.3 Schedule editor — `/<location>/schedule`
Manager scope. Week grid: rows = users, columns = days (Mon–Sun). Each cell shows shifts as colored chips (color from `JobRole.color`). Click empty cell → "+ shift" dialog. Click shift chip → edit/cancel popover. Top bar: week navigator (← week → ), "Publish week" button, "Duplicate to next week" button. Subscription-driven live refresh. `WeekGrid` lives in `@repo/ui/patterns`.

### 5.4 My schedule — `/<location>/my-schedule`
Staff scope. Read-only list of my upcoming PUBLISHED shifts grouped by day, with role + time. Past shifts collapsed. Subscription refresh.

### 5.5 Time clock — `/<location>/time-clock`
Staff scope. Big PunchClock primitive — center button:
- If no active TimeEntry → big "Punch in" button. Shows the user's next PUBLISHED shift if any.
- If active, not on break → "Punch out" + "Start break".
- If on break → "End break".
Side panel: today's recent activity (punch-in time, break splits).

### 5.6 Time entries report — `/<location>/time-entries`
Manager. DataTable with date range, user filter. Columns: user, clock-in, clock-out, breaks total, net hours, manual-edit badge. Row → edit dialog (with reason).

---

## 6. Testing

### 6.1 Unit (Vitest)
- `detectShiftOverlap`: same-user same-time → match; different users → none; CANCELLED ignored.
- `computeShiftHours`, `computePunchedMinutes` — math.
- `validatePunchTransition` state machine.
- Zod schemas (cross-field rules).

### 6.2 API integration (Testcontainers)
1. Create job role + employment + shift → query staffRoster + scheduleForWeek.
2. Cross-tenant + cross-location isolation.
3. Punch-in / break / punch-out lifecycle; net minutes correct.
4. Cannot punch in twice (active entry exists).
5. Manager can edit time entry; sets `manualEdit=true`, reason required.
6. Subscription emits per mutation.
7. Audit codes match spec section 4.6.
8. Shift publish: DRAFT → PUBLISHED → CANCELLED.

### 6.3 Web unit
- `<WeekGrid>` renders shifts in correct cells.
- `<PunchClock>` button changes by state.

### 6.4 Playwright E2E
- `staff-flow.spec.ts`: admin creates a job role + employment profile + shift; user signs in, sees my-schedule.
- `time-clock-flow.spec.ts`: user punches in, takes a break, ends break, punches out; time-entries report shows the entry.

---

## 7. Scope guard

In: job roles, employment profiles, availability, shifts (CRUD + publish + bulk), time clock with breaks, manual time-entry edits, real-time, audit.

Out: payroll runs, shift swaps, open shifts board, geofencing, photo-clockin, multi-shift-per-day overlap auto-resolve, mobile push notifications, labor cost analytics (Analytics sub-project), tipped wage / overtime computation, holiday/PTO accrual.

---

## 8. Acceptance criteria

1. Admin creates job role "Server", employment profile for owner ($25/hr, FT, hire 2026-01-01), and one shift Friday 17:00–22:00 as Server.
2. Admin publishes the shift; `myShifts` returns it.
3. Owner navigates to `/<location>/my-schedule` and sees the shift.
4. Owner navigates to `/<location>/time-clock`, punches in (TimeEntry created with shiftId set).
5. Starts a break, ends it, punches out — TimeEntry has clockedOutAt + totalBreakMinutes correct.
6. Manager edits the time entry to fix a wrong clock-out time; manualEdit flag + reason set.
7. CI green: unit, integration, web build, all 14 E2E specs (12 prior + 2 new).
