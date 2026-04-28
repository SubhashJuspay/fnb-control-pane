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
