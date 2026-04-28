import { describe, expect, it } from 'vitest';
import { computeGuestCohort } from './cohort.js';

const range = {
  from: new Date('2026-04-26T00:00:00Z'),
  to: new Date('2026-04-30T00:00:00Z'),
};

describe('computeGuestCohort', () => {
  it('zero counts and rate when no visits', () => {
    expect(computeGuestCohort({ guestVisits: [], range })).toEqual({
      newGuestCount: 0,
      returningGuestCount: 0,
      repeatRate: 0,
    });
  });

  it('classifies a guest whose earliest visit is in range as NEW', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-27T12:00:00Z') },
      ],
      range,
    });
    expect(r.newGuestCount).toBe(1);
    expect(r.returningGuestCount).toBe(0);
  });

  it('classifies a guest with a prior visit AND a visit in range as RETURNING', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-01T12:00:00Z') },
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-27T12:00:00Z') },
      ],
      range,
    });
    expect(r.newGuestCount).toBe(0);
    expect(r.returningGuestCount).toBe(1);
  });

  it('a guest with only prior visits (none in range) does not count', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-01T12:00:00Z') },
      ],
      range,
    });
    expect(r.newGuestCount).toBe(0);
    expect(r.returningGuestCount).toBe(0);
  });

  it('repeatRate = returning / (new + returning)', () => {
    const r = computeGuestCohort({
      guestVisits: [
        // g1: NEW
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-27T12:00:00Z') },
        // g2: RETURNING
        { guestId: 'g2', ticketClosedAt: new Date('2026-04-01T12:00:00Z') },
        { guestId: 'g2', ticketClosedAt: new Date('2026-04-28T12:00:00Z') },
        // g3: RETURNING
        { guestId: 'g3', ticketClosedAt: new Date('2026-03-01T12:00:00Z') },
        { guestId: 'g3', ticketClosedAt: new Date('2026-04-29T12:00:00Z') },
      ],
      range,
    });
    expect(r.newGuestCount).toBe(1);
    expect(r.returningGuestCount).toBe(2);
    expect(r.repeatRate).toBeCloseTo(2 / 3, 5);
  });

  it('range is half-open [from, to) — to-instant is exclusive', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-30T00:00:00Z') }, // == to → excluded
      ],
      range,
    });
    expect(r.newGuestCount).toBe(0);
  });

  it('repeatRate is 0 when nobody visits in range', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-01-01T12:00:00Z') },
      ],
      range,
    });
    expect(r.repeatRate).toBe(0);
  });

  it('a guest whose first visit equals range.from is NEW (boundary inclusive at left)', () => {
    const r = computeGuestCohort({
      guestVisits: [
        { guestId: 'g1', ticketClosedAt: new Date('2026-04-26T00:00:00Z') },
      ],
      range,
    });
    expect(r.newGuestCount).toBe(1);
  });
});
