# F&B Control Pane — Staff & Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build Staff & Scheduling — job roles, employment profiles, availability, shifts (DRAFT→PUBLISHED→CANCELLED), time clock with breaks, time-entry reports, real-time `scheduleUpdates`. Payroll-agnostic.

**Architecture:** Purely additive. New Prisma models (JobRole, EmploymentProfile, AvailabilityWindow, Shift, TimeEntry, Break) + 3 enums. Two pure helper modules under `apps/api/src/scheduling/`. New GraphQL surface, new web routes. No changes to Foundation/Menu/POS/Floor.

**Spec:** `docs/superpowers/specs/2026-04-28-fnb-staff-scheduling-design.md`

**Patterns to reuse (from Foundation/Menu/POS/Floor):**
- Pothos v4 (`scopeAuth: { authScopes }`, `errors`, `dmmf`).
- `pubsub.publish(channel, payload)`; channel naming via `<feature>ChannelName(locationId)`. Add `scheduleChannelName`.
- Mutation pattern: `authScopes` + in-handler role check + Zod validate + `writeAudit` + publish event.
- Pure-function resolver extraction.
- Web `useSubscription`-driven refetch (POS workspace pattern).
- `@repo/ui` patterns; new `WeekGrid` and `PunchClock` patterns.

---

## Task 1 — Prisma schema additions

Append to `packages/db/prisma/schema.prisma` (relations on `User`/`Tenant`/`Location` plus six new models + three enums per spec section 3). Add CHECK constraint `CHECK (ends_at > starts_at)` on `shifts`. Generate via `prisma migrate dev --create-only --name staff_scheduling`, append CHECK, `prisma migrate deploy`. Verify Pothos types regenerate, run all api tests (still green).

Commit: `feat(db): add Staff & Scheduling schema (job roles, employment, shifts, time entries)`

## Task 2 — Validation Zod schemas

Files: `packages/validation/src/{staff,time-clock}.ts` + tests.

`staff.ts` exports: `employmentTypeSchema` (FULL_TIME/PART_TIME/CONTRACTOR), `dayOfWeekDbSchema` (MON..SUN), `shiftStatusSchema` (DRAFT/PUBLISHED/CANCELLED), `createJobRoleSchema` (name 1-80, color hex), `updateJobRoleSchema`, `archiveJobRoleSchema`, `upsertEmploymentProfileSchema` (userId, locationId, employmentType, hourlyRateCents optional ≥0, hireDate, terminationDate optional, notes), `endEmploymentSchema` (id, terminationDate), `setAvailabilitySchema` (windows array of { dayOfWeek, startTime "HH:MM", endTime "HH:MM" }; refine end > start), `setUserAvailabilitySchema` (adds userId), `createShiftSchema` (userId, jobRoleId, startsAt, endsAt; refine endsAt > startsAt; max duration 16h), `updateShiftSchema`, `publishShiftSchema`, `publishWeekSchema` (locationId, weekStart Date), `cancelShiftSchema` (id, cancelReason), `duplicateWeekSchema` (locationId, weekStart Date, targetWeekStart Date).

`time-clock.ts` exports: `punchInSchema` (locationId, shiftId optional), `punchOutSchema` (timeEntryId), `startBreakSchema` (timeEntryId), `endBreakSchema` (breakId), `editTimeEntrySchema` (id, clockedInAt, clockedOutAt optional, totalBreakMinutes optional, manualEditReason 2-500).

TDD: write failing tests covering cross-field rules (endsAt > startsAt, end > start, max duration). Then implement. Re-export from `index.ts`. Add subpath exports `./staff`, `./time-clock` to `package.json`.

Commit: `feat(validation): add Zod schemas for staff and time-clock`

## Task 3 — Pure helpers: shift overlap + shift hours

File: `apps/api/src/scheduling/overlap.ts` + test.

```ts
export function computeShiftHours(s: { startsAt: Date; endsAt: Date }): number {
  return (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
}

interface ShiftLite { id: string; userId: string; startsAt: Date; endsAt: Date; status: 'DRAFT'|'PUBLISHED'|'CANCELLED' }

export function detectShiftOverlap(args: {
  candidate: { userId: string; startsAt: Date; endsAt: Date };
  existing: ShiftLite[];
  excludeId?: string;
}): ShiftLite[] {
  return args.existing.filter((s) =>
    s.id !== args.excludeId &&
    s.userId === args.candidate.userId &&
    s.status !== 'CANCELLED' &&
    s.startsAt < args.candidate.endsAt &&
    s.endsAt > args.candidate.startsAt,
  );
}
```

TDD: tests for non-overlap (different users, cancelled, abutting times), overlap (full overlap, partial overlap, identical), excludeId behavior.

Commit: `feat(api): add shift overlap and hours pure helpers`

## Task 4 — Pure helpers: time-entry math + punch state machine

File: `apps/api/src/scheduling/time-entry.ts` + test.

```ts
export function computePunchedMinutes(args: {
  clockedInAt: Date;
  clockedOutAt: Date | null;
  totalBreakMinutes: number;
  now: Date;
}): number {
  const end = args.clockedOutAt ?? args.now;
  const grossMs = end.getTime() - args.clockedInAt.getTime();
  const grossMin = Math.max(0, Math.floor(grossMs / 60_000));
  return Math.max(0, grossMin - args.totalBreakMinutes);
}

export type PunchState = 'NONE' | 'PUNCHED_IN' | 'ON_BREAK';
export type PunchAction = 'PUNCH_IN' | 'PUNCH_OUT' | 'START_BREAK' | 'END_BREAK';

const TRANSITIONS: Record<PunchState, PunchAction[]> = {
  NONE:        ['PUNCH_IN'],
  PUNCHED_IN:  ['PUNCH_OUT', 'START_BREAK'],
  ON_BREAK:    ['END_BREAK', 'PUNCH_OUT'],
};

export function validatePunchTransition(args: { current: PunchState; action: PunchAction }): boolean {
  return TRANSITIONS[args.current].includes(args.action);
}
```

TDD: net minutes correct with breaks; clamps to ≥ 0 if breaks exceed gross; state machine tests for each transition.

Commit: `feat(api): add time-entry math and punch state-machine helpers`

## Task 5 — GraphQL types + queries

Files: `apps/api/src/schema/{job-role,employment-profile,shift,availability,time-entry}.ts` + tests; enums in `enums.ts`; pubsub `scheduleChannelName(locationId)`.

Object types per spec section 4.1. Queries: `jobRoles`, `staffRoster` (manager scope at viewer location), `employmentProfile(userId)` (admin or self), `myAvailability`, `userAvailability(userId)` (manager), `scheduleForWeek(weekStart)` (manager; returns shifts in [weekStart, weekStart+7d)), `myShifts(from, to)` (self), `shift(id)`, `myActiveTimeEntry`, `timeEntries(filter)` (manager).

Computed fields: `Shift.durationMinutes`, `TimeEntry.netMinutes` (using helpers from Task 4). Pure-function-extracted for tests.

Commit: `feat(api): add Staff & Scheduling GraphQL types and queries`

## Task 6 — Job role + employment + availability mutations

Files under `apps/api/src/schema/mutations/staff/`: `inputs.ts`, `index.ts`, `create-job-role.ts`, `update-job-role.ts`, `archive-job-role.ts`, `upsert-employment-profile.ts`, `end-employment.ts`, `set-my-availability.ts`, `set-user-availability.ts` + tests.

Scopes: job role (admin), employment (admin), availability (self for `setMyAvailability`; manager for `setUserAvailability`). All location-scoped where applicable; user/role lookups verify they belong to viewer's tenant.

`setMyAvailability` / `setUserAvailability` semantics: replace ALL availability windows for the user atomically (delete + insert) inside a transaction. Audit `availability.set`.

Commit: `feat(api): add staff CRUD mutations (job roles, employment, availability)`

## Task 7 — Shift mutations

Files under `apps/api/src/schema/mutations/scheduling/`: `inputs.ts`, `index.ts`, `create-shift.ts`, `update-shift.ts`, `publish-shift.ts`, `publish-week.ts`, `cancel-shift.ts`, `duplicate-week.ts` + tests.

All `manager` scope. Shift mutations:
- `createShift`: verify userId belongs to tenant via membership; verify jobRoleId belongs to tenant; check `detectShiftOverlap` against existing shifts at this location for the user — if any overlap, ConflictError. Initial status DRAFT.
- `updateShift`: same overlap guard, excluding self via `excludeId`.
- `publishShift`: DRAFT → PUBLISHED. ConflictError on other transitions.
- `publishWeek`: bulk publish all DRAFT shifts in the week. Returns published shifts.
- `cancelShift`: any → CANCELLED with `cancelReason`, sets `cancelledAt`.
- `duplicateWeek`: takes weekStart + targetWeekStart, copies all PUBLISHED shifts from source week to target week, status DRAFT.

Audit codes per spec.

After every successful mutation: `pubsub.publish(scheduleChannelName(locationId), { kind: 'ShiftChanged', shiftId })`.

Commit: `feat(api): add shift management mutations (CRUD, publish, cancel, duplicate week)`

## Task 8 — Time-clock mutations

Files under `apps/api/src/schema/mutations/time-clock/`: `inputs.ts`, `index.ts`, `punch-in.ts`, `punch-out.ts`, `start-break.ts`, `end-break.ts`, `edit-time-entry.ts` + tests.

Scope: punch + break (staff, self only); edit-time-entry (manager).

- `punchIn`: verify no active TimeEntry for this user (`clockedOutAt IS NULL`); ConflictError if exists. Optionally bind `shiftId` if the user has a PUBLISHED shift starting within 60 min. Insert TimeEntry with `clockedInAt=now()`. Audit `time_entry.punched_in`.
- `punchOut`: lookup the active entry by id; verify ownership; sum break minutes from the `breaks` rows, store in `totalBreakMinutes`; set `clockedOutAt=now()`. Audit `time_entry.punched_out`.
- `startBreak`: verify state is PUNCHED_IN (no active break exists for this entry). Insert Break. Audit.
- `endBreak`: verify break is open (endedAt null). Set endedAt. Audit.
- `editTimeEntry`: manager-scope. Update fields; require `manualEditReason`; set `manualEdit=true`, `manualEditById=ctx.user.id`. Audit `time_entry.manually_edited`.

Publish `TimeEntryChanged` events on the schedule channel.

Commit: `feat(api): add time-clock mutations (punch, breaks, manual edit)`

## Task 9 — `scheduleUpdates` subscription

File: `apps/api/src/schema/subscriptions/schedule-updates.ts`. Mirrors `ticket-updates.ts` / `floor-updates.ts` patterns. Two payload types: `ShiftChanged` (hydrate Shift), `TimeEntryChanged` (hydrate TimeEntry, include userId). Channel `scheduleChannelName(ctx.auth.location.id)`. Subscriber: pubsub.subscribe + entity hydration. Pure-function-extracted iterator for testability.

Commit: `feat(api): add scheduleUpdates SSE subscription`

## Task 10 — Integration tests

File: `apps/api/src/test/integration/staff-scheduling.test.ts`. Use `setupTestDb` + `truncateAll` (extend to clear new tables in correct FK order: breaks → time_entries → shifts → availability_windows → employment_profiles → job_roles).

Scenarios:
1. Create job role + employment profile + shift → query `staffRoster` and `scheduleForWeek`.
2. Cross-tenant isolation.
3. Shift overlap rejection on createShift.
4. Publish DRAFT → PUBLISHED.
5. Punch in → start break → end break → punch out → netMinutes correct.
6. Cannot punch in twice (active entry exists).
7. Manager edits time entry → manualEdit flag, reason recorded.
8. duplicateWeek copies the week to target as DRAFT.
9. Subscription emit per mutation (spy on pubsub.publish).
10. Audit codes per spec section 4.6.

Commit: `test(api): add Staff & Scheduling integration suite`

## Task 11 — Web: staff admin + job roles

Files under `apps/web/app/(app)/[tenantSlug]/admin/staff/` and `admin/job-roles/`. New operations file `apps/web/lib/graphql/operations/staff.graphql` with all queries + mutations.

Refresh `apps/web/lib/graphql/schema.graphql` from running api: `pnpm --filter @app/api exec tsx src/print-sdl.ts > apps/web/lib/graphql/schema.graphql`. Run codegen.

`/admin/staff` (admin scope): DataTable<EmploymentProfile> with name, employmentType, hireDate, hourlyRate (formatted via formatMoney), location. Row → `<EmploymentDrawer>` for inline edit / end employment. CTA "Add employment" reuses existing `<InviteMemberDialog>` flow then upserts profile.

`/admin/job-roles` (admin scope): DataTable<JobRole> with inline edit (name, color), archive. "New job role" dialog.

Commit: `feat(web): add staff admin and job-roles management UIs`

## Task 12 — Web: schedule editor + my schedule

Files:
- `packages/ui/src/patterns/week-grid.tsx` — week grid primitive (rows = users, cols = days). Props: `users`, `weekStart`, `cellRenderer`, `onCellClick`, `onShiftClick`.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/schedule/{layout,page}.tsx` — manager scope.
- `apps/web/components/schedule/schedule-editor.tsx` — main client.
- `apps/web/components/schedule/shift-dialog.tsx` — create/edit shift.
- `apps/web/components/schedule/cancel-shift-dialog.tsx`.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/my-schedule/{layout,page}.tsx` — staff scope.
- `apps/web/components/schedule/my-schedule-list.tsx`.

Schedule editor: top bar with week navigator (← week selector →), "Publish week" button (calls `publishWeek`), "Duplicate to next week", live counts ("3 published · 2 draft"). Body: `<WeekGrid>` rendering shifts as colored chips per JobRole.color. Click cell → "+ shift" dialog. Click shift chip → edit popover.

My schedule list: read-only list of upcoming PUBLISHED shifts grouped by date.

Subscription wired in both surfaces.

Commit: `feat(web): add schedule editor and my-schedule views`

## Task 13 — Web: time clock + time entries report

Files:
- `packages/ui/src/patterns/punch-clock.tsx` — kiosk-style large button with state.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/time-clock/{layout,page}.tsx` — staff scope.
- `apps/web/components/time-clock/time-clock-page.tsx` — uses `<PunchClock>`, shows current state, today's activity.
- `apps/web/app/(app)/[tenantSlug]/[locationSlug]/time-entries/{layout,page}.tsx` — manager scope.
- `apps/web/components/time-clock/time-entries-table.tsx`.
- `apps/web/components/time-clock/edit-time-entry-dialog.tsx`.

Time clock: query `myActiveTimeEntry`. Render `<PunchClock>` with state derived from result. Below: list of today's entries.

Time entries report: filters (date range, user). DataTable with computed `netMinutes` formatted as h:mm. Manager-scope edit via dialog.

Commit: `feat(web): add time-clock kiosk and time-entries report`

## Task 14 — E2E

Two specs:
- `staff-flow.spec.ts`: admin creates JobRole "Server", upserts profile for owner ($25/hr), creates shift for owner Friday 17:00–22:00 as Server, publishes the week. Owner navigates to `/my-schedule` and sees the shift.
- `time-clock-flow.spec.ts`: owner navigates to `/time-clock`, punches in, starts break, ends break, punches out. Then navigates to `/time-entries` (as manager — same user has both scopes) and sees the entry with non-zero netMinutes.

Add `createScheduleFixtures` helper in `seed.ts`.

Commit: `test(web): add E2E specs for staff and time-clock flows`

---

## Self-review

- Spec sections all mapped to tasks.
- Pure helpers (3, 4) have full TDD code.
- Other tasks are bullet-point per established pattern.
- Type names consistent: `JobRole`, `Shift`, `TimeEntry`, `Break`, `EmploymentProfile`, `AvailabilityWindow`, `detectShiftOverlap`, `computePunchedMinutes`, `validatePunchTransition`, `scheduleChannelName`.
