import { describe, expect, it } from 'vitest';
import { deriveTableState, isReservationImminent } from './state.js';

describe('deriveTableState', () => {
  it('CLEANING wins over everything', () => {
    expect(deriveTableState({ manualState: 'CLEANING', hasOpenTicket: true, hasImminentReservation: true })).toBe('CLEANING');
  });
  it('OCCUPIED when ticket open', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: true, hasImminentReservation: false })).toBe('OCCUPIED');
  });
  it('RESERVED when no ticket but imminent reservation', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: false, hasImminentReservation: true })).toBe('RESERVED');
  });
  it('AVAILABLE otherwise', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: false, hasImminentReservation: false })).toBe('AVAILABLE');
  });
  it('OCCUPIED beats RESERVED', () => {
    expect(deriveTableState({ manualState: 'NONE', hasOpenTicket: true, hasImminentReservation: true })).toBe('OCCUPIED');
  });
});

describe('isReservationImminent', () => {
  const now = new Date('2026-04-28T19:00:00Z');

  it('CONFIRMED 10 minutes away → imminent', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(true);
  });
  it('CONFIRMED 30 minutes away → not imminent (default 15min window)', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T19:30:00Z'),
      now,
    })).toBe(false);
  });
  it('PENDING in window → still imminent', () => {
    expect(isReservationImminent({
      status: 'PENDING',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(true);
  });
  it('CANCELLED in window → not imminent', () => {
    expect(isReservationImminent({
      status: 'CANCELLED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(false);
  });
  it('SEATED in window → not imminent (already seated)', () => {
    expect(isReservationImminent({
      status: 'SEATED',
      requestedTime: new Date('2026-04-28T19:10:00Z'),
      now,
    })).toBe(false);
  });
  it('null requestedTime → not imminent (walkin)', () => {
    expect(isReservationImminent({
      status: 'WAITING',
      requestedTime: null,
      now,
    })).toBe(false);
  });
  it('past requestedTime within window → still imminent', () => {
    expect(isReservationImminent({
      status: 'CONFIRMED',
      requestedTime: new Date('2026-04-28T18:50:00Z'),
      now,
    })).toBe(true);
  });
});
