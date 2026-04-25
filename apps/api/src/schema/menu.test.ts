import { describe, expect, it } from 'vitest';
import {
  parseScheduleJson,
  resolveLocationActiveMenus,
  resolveMenuIsLive,
  resolveMenuNextWindow,
  resolveMenuSectionItemEffectivePrice,
  type MenuRow,
} from './menu.js';

const TZ = 'America/Los_Angeles';
const SAT_10AM_PDT = new Date('2026-04-25T17:00:00Z'); // Saturday 10am PDT

const baseMenu = (overrides: Partial<MenuRow> = {}): MenuRow => ({
  id: 'm-1',
  locationId: 'loc-1',
  name: 'Brunch',
  description: null,
  sortOrder: 0,
  schedule: { kind: 'always' },
  isActive: true,
  archivedAt: null,
  ...overrides,
});

describe('parseScheduleJson', () => {
  it('parses always', () => {
    expect(parseScheduleJson({ kind: 'always' })).toEqual({ kind: 'always' });
  });

  it('parses weekly', () => {
    const raw = {
      kind: 'weekly',
      windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }],
    };
    expect(parseScheduleJson(raw)).toEqual(raw);
  });

  it('returns null for malformed JSON', () => {
    expect(parseScheduleJson({ kind: 'nonsense' })).toBeNull();
    expect(parseScheduleJson({ kind: 'weekly', windows: [] })).toBeNull();
  });

  it('returns always for null/undefined (legacy)', () => {
    expect(parseScheduleJson(null)).toEqual({ kind: 'always' });
    expect(parseScheduleJson(undefined)).toEqual({ kind: 'always' });
  });
});

describe('resolveMenuIsLive', () => {
  it('returns false when viewer has no location', () => {
    expect(
      resolveMenuIsLive({
        menu: baseMenu(),
        viewerLocation: null,
        at: SAT_10AM_PDT,
      }),
    ).toBe(false);
  });

  it("returns false when viewer location id doesn't match menu locationId", () => {
    expect(
      resolveMenuIsLive({
        menu: baseMenu({ locationId: 'loc-1' }),
        viewerLocation: { id: 'loc-2', timezone: TZ },
        at: SAT_10AM_PDT,
      }),
    ).toBe(false);
  });

  it('returns true for an always-on menu at the viewer location', () => {
    expect(
      resolveMenuIsLive({
        menu: baseMenu(),
        viewerLocation: { id: 'loc-1', timezone: TZ },
        at: SAT_10AM_PDT,
      }),
    ).toBe(true);
  });

  it('honors weekly schedule windows in the viewer timezone', () => {
    const menu = baseMenu({
      schedule: {
        kind: 'weekly',
        windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }],
      },
    });
    expect(
      resolveMenuIsLive({
        menu,
        viewerLocation: { id: 'loc-1', timezone: TZ },
        at: SAT_10AM_PDT,
      }),
    ).toBe(true);
    expect(
      resolveMenuIsLive({
        menu,
        viewerLocation: { id: 'loc-1', timezone: TZ },
        at: new Date('2026-04-25T13:00:00Z'), // 6am PDT — too early
      }),
    ).toBe(false);
  });

  it('returns false when schedule JSON fails to parse', () => {
    expect(
      resolveMenuIsLive({
        menu: baseMenu({ schedule: { kind: 'bogus' } }),
        viewerLocation: { id: 'loc-1', timezone: TZ },
        at: SAT_10AM_PDT,
      }),
    ).toBe(false);
  });
});

describe('resolveMenuNextWindow', () => {
  it('returns null when no viewer location', () => {
    expect(
      resolveMenuNextWindow({
        menu: baseMenu(),
        viewerLocation: null,
        at: SAT_10AM_PDT,
      }),
    ).toBeNull();
  });

  it('returns null for always-on schedule', () => {
    expect(
      resolveMenuNextWindow({
        menu: baseMenu(),
        viewerLocation: { id: 'loc-1', timezone: TZ },
        at: SAT_10AM_PDT,
      }),
    ).toBeNull();
  });

  it('returns the current window bounds for a live weekly menu', () => {
    const menu = baseMenu({
      schedule: {
        kind: 'weekly',
        windows: [{ days: ['SAT'], start: '08:00', end: '14:00' }],
      },
    });
    const w = resolveMenuNextWindow({
      menu,
      viewerLocation: { id: 'loc-1', timezone: TZ },
      at: SAT_10AM_PDT,
    });
    expect(w?.start.toISOString()).toBe('2026-04-25T15:00:00.000Z');
    expect(w?.end.toISOString()).toBe('2026-04-25T21:00:00.000Z');
  });
});

describe('resolveLocationActiveMenus', () => {
  it('filters to live + active menus and orders by sortOrder', () => {
    const result = resolveLocationActiveMenus({
      menus: [
        baseMenu({ id: 'b', sortOrder: 1, schedule: { kind: 'always' } }),
        baseMenu({ id: 'a', sortOrder: 0, schedule: { kind: 'always' } }),
        baseMenu({
          id: 'mon-only',
          sortOrder: 2,
          schedule: {
            kind: 'weekly',
            windows: [{ days: ['MON'], start: '06:00', end: '11:00' }],
          },
        }),
        baseMenu({ id: 'inactive', sortOrder: 3, isActive: false }),
      ],
      timezone: TZ,
      at: SAT_10AM_PDT,
    });
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('drops menus whose schedule fails to parse', () => {
    const result = resolveLocationActiveMenus({
      menus: [
        baseMenu({ id: 'good' }),
        baseMenu({ id: 'bad', schedule: { kind: 'broken' } }),
      ],
      timezone: TZ,
      at: SAT_10AM_PDT,
    });
    expect(result.map((m) => m.id)).toEqual(['good']);
  });
});

describe('resolveMenuSectionItemEffectivePrice', () => {
  it('falls back to base price with no overrides', () => {
    expect(
      resolveMenuSectionItemEffectivePrice({
        basePriceCents: 450,
        locationOverride: null,
        sectionOverride: { priceOverrideCents: null },
      }),
    ).toBe(450);
  });

  it('prefers location override over base', () => {
    expect(
      resolveMenuSectionItemEffectivePrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 500 },
        sectionOverride: { priceOverrideCents: null },
      }),
    ).toBe(500);
  });

  it('section override beats location override', () => {
    expect(
      resolveMenuSectionItemEffectivePrice({
        basePriceCents: 450,
        locationOverride: { priceCents: 500 },
        sectionOverride: { priceOverrideCents: 400 },
      }),
    ).toBe(400);
  });

  it('null priceCents in location override falls through to base', () => {
    expect(
      resolveMenuSectionItemEffectivePrice({
        basePriceCents: 450,
        locationOverride: { priceCents: null },
        sectionOverride: null,
      }),
    ).toBe(450);
  });
});
