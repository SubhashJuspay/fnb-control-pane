export function resolveItemPrice(args: {
  basePriceCents: number;
  locationOverride: { priceCents: number | null } | null;
  sectionOverride: { priceOverrideCents: number | null } | null;
}): number {
  if (args.sectionOverride?.priceOverrideCents != null) {
    return args.sectionOverride.priceOverrideCents;
  }
  if (args.locationOverride?.priceCents != null) {
    return args.locationOverride.priceCents;
  }
  return args.basePriceCents;
}

export function resolveModifierPrice(args: {
  basePriceDeltaCents: number;
  locationOverride: { priceDeltaOverrideCents: number | null } | null;
}): number {
  if (args.locationOverride?.priceDeltaOverrideCents != null) {
    return args.locationOverride.priceDeltaOverrideCents;
  }
  return args.basePriceDeltaCents;
}

export function resolveItemAvailability(args: {
  archivedAt: Date | null;
  locationOverride: { hidden: boolean; available: boolean } | null;
}): boolean {
  if (args.archivedAt !== null) return false;
  if (args.locationOverride?.hidden) return false;
  if (args.locationOverride && !args.locationOverride.available) return false;
  return true;
}
