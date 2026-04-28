import { describe, expect, it } from 'vitest';
import { createReservationSchema, addWalkinSchema, seatReservationSchema } from './reservation.js';

describe('createReservationSchema', () => {
  it('accepts a valid reservation', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John',
      partySize: 4,
      requestedTime: new Date(Date.now() + 3_600_000).toISOString(),
    }).success).toBe(true);
  });
  it('rejects partySize 0', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John', partySize: 0,
      requestedTime: new Date().toISOString(),
    }).success).toBe(false);
  });
  it('requires guestName', () => {
    expect(createReservationSchema.safeParse({
      guestName: '   ', partySize: 4,
      requestedTime: new Date().toISOString(),
    }).success).toBe(false);
  });
  it('requires requestedTime (RESERVATION)', () => {
    expect(createReservationSchema.safeParse({
      guestName: 'John', partySize: 4,
    }).success).toBe(false);
  });
});

describe('addWalkinSchema', () => {
  it('accepts walkin with no requestedTime', () => {
    expect(addWalkinSchema.safeParse({
      guestName: 'Sarah', partySize: 2,
    }).success).toBe(true);
  });
});

describe('seatReservationSchema', () => {
  it('accepts uuid', () => {
    expect(seatReservationSchema.safeParse({
      reservationId: '11111111-1111-1111-1111-111111111111',
      tableId: '22222222-2222-2222-2222-222222222222',
    }).success).toBe(true);
  });
  it('tableId optional (uses reservation.tableId)', () => {
    expect(seatReservationSchema.safeParse({
      reservationId: '11111111-1111-1111-1111-111111111111',
    }).success).toBe(true);
  });
});
