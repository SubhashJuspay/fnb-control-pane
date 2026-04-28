export function estimateReadyAt(args: {
  pickupAt: Date;
  confirmedAt: Date;
  minPrepMinutes?: number;
}): Date {
  const minPrep = args.minPrepMinutes ?? 10;
  const earliestFromConfirm = new Date(args.confirmedAt.getTime() + minPrep * 60_000);
  return earliestFromConfirm > args.pickupAt ? earliestFromConfirm : args.pickupAt;
}
