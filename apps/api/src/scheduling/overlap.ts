export interface ShiftLite {
  id: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
}

export function computeShiftHours(s: { startsAt: Date; endsAt: Date }): number {
  return (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
}

export function detectShiftOverlap(args: {
  candidate: { userId: string; startsAt: Date; endsAt: Date };
  existing: ShiftLite[];
  excludeId?: string;
}): ShiftLite[] {
  return args.existing.filter(
    (s) =>
      s.id !== args.excludeId &&
      s.userId === args.candidate.userId &&
      s.status !== 'CANCELLED' &&
      s.startsAt < args.candidate.endsAt &&
      s.endsAt > args.candidate.startsAt,
  );
}
