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
  NONE: ['PUNCH_IN'],
  PUNCHED_IN: ['PUNCH_OUT', 'START_BREAK'],
  ON_BREAK: ['END_BREAK', 'PUNCH_OUT'],
};

export function validatePunchTransition(args: {
  current: PunchState;
  action: PunchAction;
}): boolean {
  return TRANSITIONS[args.current].includes(args.action);
}
