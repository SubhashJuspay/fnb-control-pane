/**
 * Labor cost analytics.
 *
 * Given a list of TimeEntries (clock-in/out) joined with their staff member's
 * hourly rate, and the closed-ticket revenue for the same period, compute:
 *   - total labor hours
 *   - total labor cost (cents)
 *   - revenue (from caller)
 *   - labor cost percent = laborCostCents / revenueCents
 *   - per-staff breakdown
 *
 * Pure: no DB / no Date.now() side effects. Tests construct rows directly.
 */

export interface LaborInputEntry {
  /** User id. */
  userId: string;
  userName: string;
  clockedInAt: Date;
  /** null when still clocked in — we treat it as `now` (passed in by caller). */
  clockedOutAt: Date | null;
  /** Minutes of paid break time (subtracted from gross duration). */
  totalBreakMinutes: number;
  /** Hourly rate at the time of the shift, in cents. null = staff has no rate. */
  hourlyRateCents: number | null;
  jobRoleName: string | null;
}

export interface LaborStaffRow {
  userId: string;
  userName: string;
  jobRoleName: string | null;
  hours: number;
  hourlyRateCents: number | null;
  laborCostCents: number;
  shifts: number;
}

export interface LaborCostSummary {
  totalHours: number;
  totalLaborCostCents: number;
  revenueCents: number;
  laborCostPct: number;
  perStaff: LaborStaffRow[];
}

/** Subtract paid-break minutes from the gross duration in minutes. */
function netMinutes(entry: LaborInputEntry, now: Date): number {
  const end = entry.clockedOutAt ?? now;
  const grossMs = end.getTime() - entry.clockedInAt.getTime();
  if (grossMs <= 0) return 0;
  const grossMin = grossMs / 60_000;
  return Math.max(0, grossMin - entry.totalBreakMinutes);
}

export function computeLaborCost(args: {
  entries: LaborInputEntry[];
  revenueCents: number;
  /** "Now" — used to close out still-clocked-in entries. */
  now?: Date;
}): LaborCostSummary {
  const now = args.now ?? new Date();
  const acc = new Map<
    string,
    LaborStaffRow & { minutes: number }
  >();

  for (const e of args.entries) {
    const mins = netMinutes(e, now);
    const cost = e.hourlyRateCents != null ? (mins / 60) * e.hourlyRateCents : 0;
    const existing = acc.get(e.userId);
    if (existing) {
      existing.minutes += mins;
      existing.laborCostCents += cost;
      existing.shifts += 1;
      existing.hourlyRateCents = e.hourlyRateCents ?? existing.hourlyRateCents;
      existing.jobRoleName = e.jobRoleName ?? existing.jobRoleName;
    } else {
      acc.set(e.userId, {
        userId: e.userId,
        userName: e.userName,
        jobRoleName: e.jobRoleName,
        minutes: mins,
        hours: 0,
        hourlyRateCents: e.hourlyRateCents,
        laborCostCents: cost,
        shifts: 1,
      });
    }
  }

  const perStaff: LaborStaffRow[] = [...acc.values()]
    .map((row) => ({
      userId: row.userId,
      userName: row.userName,
      jobRoleName: row.jobRoleName,
      hours: Math.round((row.minutes / 60) * 100) / 100,
      hourlyRateCents: row.hourlyRateCents,
      laborCostCents: Math.round(row.laborCostCents),
      shifts: row.shifts,
    }))
    .sort((a, b) => b.laborCostCents - a.laborCostCents);

  const totalLaborCostCents = perStaff.reduce(
    (s, r) => s + r.laborCostCents,
    0,
  );
  const totalHours = perStaff.reduce((s, r) => s + r.hours, 0);
  const laborCostPct =
    args.revenueCents > 0 ? totalLaborCostCents / args.revenueCents : 0;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalLaborCostCents,
    revenueCents: args.revenueCents,
    laborCostPct,
    perStaff,
  };
}
