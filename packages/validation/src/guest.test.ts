import { describe, expect, it } from 'vitest';
import {
  createGuestSchema,
  updateGuestSchema,
  archiveGuestSchema,
  linkTicketGuestSchema,
  linkReservationGuestSchema,
  searchGuestsSchema,
} from './guest.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('createGuestSchema', () => {
  it('accepts a minimal valid guest with just name', () => {
    expect(createGuestSchema.safeParse({ name: 'Alice' }).success).toBe(true);
  });

  it('accepts full guest with phone, email, notes', () => {
    expect(
      createGuestSchema.safeParse({
        name: 'Alice Smith',
        phone: '555-0100',
        email: 'alice@example.com',
        notes: 'VIP, allergic to peanuts',
      }).success,
    ).toBe(true);
  });

  it('trims name and rejects empty', () => {
    expect(createGuestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects name longer than 120 chars', () => {
    expect(createGuestSchema.safeParse({ name: 'A'.repeat(121) }).success).toBe(false);
  });

  it('rejects phone longer than 40 chars', () => {
    expect(createGuestSchema.safeParse({ name: 'Alice', phone: '5'.repeat(41) }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(createGuestSchema.safeParse({ name: 'Alice', email: 'not-an-email' }).success).toBe(false);
  });

  it('accepts notes up to 500 chars', () => {
    expect(createGuestSchema.safeParse({ name: 'A', notes: 'x'.repeat(500) }).success).toBe(true);
  });

  it('rejects notes longer than 500 chars', () => {
    expect(createGuestSchema.safeParse({ name: 'A', notes: 'x'.repeat(501) }).success).toBe(false);
  });

  it('accepts null phone explicitly', () => {
    expect(createGuestSchema.safeParse({ name: 'Alice', phone: null }).success).toBe(true);
  });
});

describe('updateGuestSchema', () => {
  it('accepts partial update with id', () => {
    expect(updateGuestSchema.safeParse({ id: UUID, name: 'Alice 2' }).success).toBe(true);
  });

  it('rejects without id', () => {
    expect(updateGuestSchema.safeParse({ name: 'Alice 2' }).success).toBe(false);
  });

  it('rejects non-uuid id', () => {
    expect(updateGuestSchema.safeParse({ id: 'not-a-uuid', name: 'A' }).success).toBe(false);
  });

  it('accepts id only with no other fields', () => {
    expect(updateGuestSchema.safeParse({ id: UUID }).success).toBe(true);
  });
});

describe('archiveGuestSchema', () => {
  it('accepts valid uuid', () => {
    expect(archiveGuestSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it('rejects missing id', () => {
    expect(archiveGuestSchema.safeParse({}).success).toBe(false);
  });
});

describe('linkTicketGuestSchema', () => {
  it('accepts uuid pair', () => {
    expect(linkTicketGuestSchema.safeParse({ ticketId: UUID, guestId: UUID }).success).toBe(true);
  });
  it('accepts null guestId (unlink)', () => {
    expect(linkTicketGuestSchema.safeParse({ ticketId: UUID, guestId: null }).success).toBe(true);
  });
  it('rejects missing ticketId', () => {
    expect(linkTicketGuestSchema.safeParse({ guestId: UUID }).success).toBe(false);
  });
});

describe('linkReservationGuestSchema', () => {
  it('accepts uuid pair', () => {
    expect(linkReservationGuestSchema.safeParse({ reservationId: UUID, guestId: UUID }).success).toBe(true);
  });
  it('accepts null guestId', () => {
    expect(linkReservationGuestSchema.safeParse({ reservationId: UUID, guestId: null }).success).toBe(true);
  });
});

describe('searchGuestsSchema', () => {
  it('accepts query and default limit', () => {
    expect(searchGuestsSchema.safeParse({ query: 'Ali' }).success).toBe(true);
  });
  it('rejects empty query', () => {
    expect(searchGuestsSchema.safeParse({ query: '' }).success).toBe(false);
  });
  it('rejects query > 120 chars', () => {
    expect(searchGuestsSchema.safeParse({ query: 'x'.repeat(121) }).success).toBe(false);
  });
  it('rejects limit > 50', () => {
    expect(searchGuestsSchema.safeParse({ query: 'A', limit: 51 }).success).toBe(false);
  });
  it('rejects limit < 1', () => {
    expect(searchGuestsSchema.safeParse({ query: 'A', limit: 0 }).success).toBe(false);
  });
  it('accepts limit 50', () => {
    expect(searchGuestsSchema.safeParse({ query: 'A', limit: 50 }).success).toBe(true);
  });
});
