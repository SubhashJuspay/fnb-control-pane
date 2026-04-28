import { describe, expect, it } from 'vitest';
import { addTicketItemSchema, closeTicketSchema, voidTicketItemSchema } from './ticket.js';
import { applyTicketDiscountSchema, applyLineDiscountSchema } from './discount.js';

describe('addTicketItemSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = addTicketItemSchema.safeParse({
      ticketId: '11111111-1111-1111-1111-111111111111',
      menuItemId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(1);
      expect(result.data.modifiers).toEqual([]);
    }
  });

  it('rejects quantity < 1', () => {
    const result = addTicketItemSchema.safeParse({
      ticketId: '11111111-1111-1111-1111-111111111111',
      menuItemId: '22222222-2222-2222-2222-222222222222',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed UUIDs', () => {
    const result = addTicketItemSchema.safeParse({
      ticketId: 'not-a-uuid',
      menuItemId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(false);
  });
});

describe('voidTicketItemSchema', () => {
  it('requires a void reason of at least 2 characters', () => {
    expect(
      voidTicketItemSchema.safeParse({ ticketItemId: '11111111-1111-1111-1111-111111111111', voidReason: '' }).success,
    ).toBe(false);
    expect(
      voidTicketItemSchema.safeParse({ ticketItemId: '11111111-1111-1111-1111-111111111111', voidReason: 'wrong item' }).success,
    ).toBe(true);
  });
});

describe('closeTicketSchema', () => {
  it('accepts a ticket id with no closeNote', () => {
    expect(closeTicketSchema.safeParse({ ticketId: '11111111-1111-1111-1111-111111111111' }).success).toBe(true);
  });

  it('accepts an optional closeNote', () => {
    expect(
      closeTicketSchema.safeParse({ ticketId: '11111111-1111-1111-1111-111111111111', closeNote: 'paid cash' }).success,
    ).toBe(true);
  });
});

describe('applyTicketDiscountSchema', () => {
  it('FLAT requires amountCents', () => {
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'FLAT',
        amountCents: 500,
        reason: 'Manager comp',
      }).success,
    ).toBe(true);
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'FLAT',
        reason: 'Manager comp',
      }).success,
    ).toBe(false);
  });

  it('PERCENT requires percentBp between 1 and 10000', () => {
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'PERCENT',
        percentBp: 1000,
        reason: 'Promotion',
      }).success,
    ).toBe(true);
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'PERCENT',
        percentBp: 0,
        reason: 'Promotion',
      }).success,
    ).toBe(false);
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'PERCENT',
        percentBp: 10001,
        reason: 'Promotion',
      }).success,
    ).toBe(false);
  });

  it('reason is required and trimmed', () => {
    expect(
      applyTicketDiscountSchema.safeParse({
        ticketId: '11111111-1111-1111-1111-111111111111',
        kind: 'FLAT',
        amountCents: 100,
        reason: '   ',
      }).success,
    ).toBe(false);
  });
});

describe('applyLineDiscountSchema', () => {
  it('targets ticketItemId, not ticketId', () => {
    expect(
      applyLineDiscountSchema.safeParse({
        ticketItemId: '11111111-1111-1111-1111-111111111111',
        kind: 'FLAT',
        amountCents: 100,
        reason: 'Burnt',
      }).success,
    ).toBe(true);
  });
});
