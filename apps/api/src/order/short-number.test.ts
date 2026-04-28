import { describe, expect, it } from 'vitest';
import { computeBusinessDay } from './short-number.js';

describe('computeBusinessDay', () => {
  // Note: tests use unambiguous UTC moments ("...Z") that correspond to specific
  // wall-clock times in America/Los_Angeles (UTC-7 PDT in April 2026).
  it('before cutoff: business day = previous calendar day', () => {
    // 02:00 LA on 2026-04-26 (PDT) = 09:00 UTC. Cutoff 04:00 → business day = 2026-04-25
    const at = new Date('2026-04-26T09:00:00.000Z');
    expect(computeBusinessDay({ at, businessDayCutoff: '04:00', timezone: 'America/Los_Angeles' })).toEqual(
      new Date('2026-04-25T00:00:00.000Z'),
    );
  });

  it('after cutoff: business day = current calendar day', () => {
    // 10:00 LA on 2026-04-26 (PDT) = 17:00 UTC → business day = 2026-04-26
    const at = new Date('2026-04-26T17:00:00.000Z');
    expect(computeBusinessDay({ at, businessDayCutoff: '04:00', timezone: 'America/Los_Angeles' })).toEqual(
      new Date('2026-04-26T00:00:00.000Z'),
    );
  });

  it('exactly at cutoff: business day = current calendar day', () => {
    // 04:00 LA on 2026-04-26 (PDT) = 11:00 UTC
    const at = new Date('2026-04-26T11:00:00.000Z');
    expect(computeBusinessDay({ at, businessDayCutoff: '04:00', timezone: 'America/Los_Angeles' })).toEqual(
      new Date('2026-04-26T00:00:00.000Z'),
    );
  });
});
