import { describe, expect, it } from 'vitest';
import {
  resolveItemPrice,
  resolveModifierPrice,
  resolveItemAvailability,
} from './pricing.js';

describe('resolveItemPrice', () => {
  it('returns base price when no overrides', () => {
    expect(
      resolveItemPrice({ basePriceCents: 450, locationOverride: null, sectionOverride: null }),
    ).toBe(450);
  });

  it('uses location override when set', () => {
    expect(
      resolveItemPrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 500 },
        sectionOverride: null,
      }),
    ).toBe(500);
  });

  it('falls back to base when location override priceCents is null', () => {
    expect(
      resolveItemPrice({
        basePriceCents: 450,
        locationOverride: { priceCents: null },
        sectionOverride: null,
      }),
    ).toBe(450);
  });

  it('section override wins over location override', () => {
    expect(
      resolveItemPrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 500 },
        sectionOverride: { priceOverrideCents: 400 },
      }),
    ).toBe(400);
  });

  it('section override null falls through to location override', () => {
    expect(
      resolveItemPrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 500 },
        sectionOverride: { priceOverrideCents: null },
      }),
    ).toBe(500);
  });

  it('zero is a valid override price (free item)', () => {
    expect(
      resolveItemPrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 0 },
        sectionOverride: null,
      }),
    ).toBe(0);
  });
});

describe('resolveModifierPrice', () => {
  it('returns base delta when no override', () => {
    expect(
      resolveModifierPrice({ basePriceDeltaCents: 100, locationOverride: null }),
    ).toBe(100);
  });

  it('uses location override when set', () => {
    expect(
      resolveModifierPrice({
        basePriceDeltaCents: 100,
        locationOverride: { priceDeltaOverrideCents: 150 },
      }),
    ).toBe(150);
  });

  it('falls back to base when location override is null', () => {
    expect(
      resolveModifierPrice({
        basePriceDeltaCents: 100,
        locationOverride: { priceDeltaOverrideCents: null },
      }),
    ).toBe(100);
  });

  it('negative deltas are valid (discount modifiers)', () => {
    expect(
      resolveModifierPrice({ basePriceDeltaCents: -50, locationOverride: null }),
    ).toBe(-50);
  });
});

describe('resolveItemAvailability', () => {
  it('returns true when not archived and no override', () => {
    expect(resolveItemAvailability({ archivedAt: null, locationOverride: null })).toBe(true);
  });

  it('returns false when archivedAt is set', () => {
    expect(
      resolveItemAvailability({ archivedAt: new Date(), locationOverride: null }),
    ).toBe(false);
  });

  it('returns false when location override hidden=true', () => {
    expect(
      resolveItemAvailability({
        archivedAt: null,
        locationOverride: { hidden: true, available: true },
      }),
    ).toBe(false);
  });

  it('returns false when location override available=false (86)', () => {
    expect(
      resolveItemAvailability({
        archivedAt: null,
        locationOverride: { hidden: false, available: false },
      }),
    ).toBe(false);
  });

  it('archived dominates override (archived = unavailable always)', () => {
    expect(
      resolveItemAvailability({
        archivedAt: new Date(),
        locationOverride: { hidden: false, available: true },
      }),
    ).toBe(false);
  });
});
