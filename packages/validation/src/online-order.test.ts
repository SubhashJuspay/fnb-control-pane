import { describe, expect, it } from 'vitest';
import {
  submitOnlineOrderSchema,
  confirmOnlineOrderSchema,
  rejectOnlineOrderSchema,
  trackOnlineOrderSchema,
} from './online-order.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('submitOnlineOrderSchema', () => {
  const base = {
    tenantSlug: 'acme',
    locationSlug: 'mission-st',
    customerName: 'Bob',
    customerPhone: '+52 55 1234 5678',
    pickupKind: 'ASAP' as const,
    items: [{ menuItemId: UUID, quantity: 1 }],
  };

  it('accepts a valid ASAP order', () => {
    expect(submitOnlineOrderSchema.safeParse(base).success).toBe(true);
  });

  it('rejects empty items', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it('rejects too many items', () => {
    const items = Array.from({ length: 51 }, () => ({ menuItemId: UUID, quantity: 1 }));
    expect(submitOnlineOrderSchema.safeParse({ ...base, items }).success).toBe(false);
  });

  it('rejects bad slug pattern', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, tenantSlug: 'Bad Slug!' }).success).toBe(false);
  });

  it('rejects empty customerName', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, customerName: '' }).success).toBe(false);
  });

  it('rejects too-short phone', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, customerPhone: '123' }).success).toBe(false);
  });

  it('accepts a bare 10-digit Mexican number', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, customerPhone: '5512345678' }).success,
    ).toBe(true);
  });

  it('accepts a +52 prefixed Mexican number', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, customerPhone: '+525512345678' }).success,
    ).toBe(true);
  });

  it('accepts a Mexican mobile (+52 1) prefixed number', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, customerPhone: '+52 1 55 1234 5678' }).success,
    ).toBe(true);
  });

  it('rejects a non-Mexican-format phone', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, customerPhone: '+1 415 555 0100' }).success,
    ).toBe(false);
  });

  it('accepts optional email', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, customerEmail: 'bob@example.com' }).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(submitOnlineOrderSchema.safeParse({ ...base, customerEmail: 'not-an-email' }).success).toBe(false);
  });

  it('SCHEDULED requires pickupAt', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, pickupKind: 'SCHEDULED' }).success,
    ).toBe(false);
  });

  it('SCHEDULED rejects pickupAt earlier than now+15min', () => {
    const tooSoon = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(
      submitOnlineOrderSchema.safeParse({
        ...base,
        pickupKind: 'SCHEDULED',
        pickupAt: tooSoon,
      }).success,
    ).toBe(false);
  });

  it('SCHEDULED rejects pickupAt past 7 days', () => {
    const tooFar = new Date(Date.now() + 8 * 24 * 60 * 60_000).toISOString();
    expect(
      submitOnlineOrderSchema.safeParse({
        ...base,
        pickupKind: 'SCHEDULED',
        pickupAt: tooFar,
      }).success,
    ).toBe(false);
  });

  it('SCHEDULED accepts pickupAt within window', () => {
    const ok = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(
      submitOnlineOrderSchema.safeParse({
        ...base,
        pickupKind: 'SCHEDULED',
        pickupAt: ok,
      }).success,
    ).toBe(true);
  });

  it('rejects item quantity > 50', () => {
    expect(
      submitOnlineOrderSchema.safeParse({
        ...base,
        items: [{ menuItemId: UUID, quantity: 51 }],
      }).success,
    ).toBe(false);
  });

  it('rejects too many modifiers', () => {
    const modifiers = Array.from({ length: 21 }, () => UUID);
    expect(
      submitOnlineOrderSchema.safeParse({
        ...base,
        items: [{ menuItemId: UUID, quantity: 1, modifiers }],
      }).success,
    ).toBe(false);
  });

  it('rejects notes > 500', () => {
    expect(
      submitOnlineOrderSchema.safeParse({ ...base, notes: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('confirmOnlineOrderSchema', () => {
  it('accepts uuid only', () => {
    expect(confirmOnlineOrderSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it('accepts optional estimatedReadyAt', () => {
    expect(
      confirmOnlineOrderSchema.safeParse({
        id: UUID,
        estimatedReadyAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
  it('rejects bad uuid', () => {
    expect(confirmOnlineOrderSchema.safeParse({ id: 'not-uuid' }).success).toBe(false);
  });
});

describe('rejectOnlineOrderSchema', () => {
  it('accepts uuid + reason', () => {
    expect(
      rejectOnlineOrderSchema.safeParse({ id: UUID, rejectReason: 'Out of ingredients' }).success,
    ).toBe(true);
  });
  it('rejects empty reason', () => {
    expect(rejectOnlineOrderSchema.safeParse({ id: UUID, rejectReason: '' }).success).toBe(false);
  });
  it('rejects > 500 reason', () => {
    expect(
      rejectOnlineOrderSchema.safeParse({ id: UUID, rejectReason: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('trackOnlineOrderSchema', () => {
  it('accepts a 32+ char token', () => {
    expect(trackOnlineOrderSchema.safeParse({ token: 'a'.repeat(32) }).success).toBe(true);
  });
  it('rejects a short token', () => {
    expect(trackOnlineOrderSchema.safeParse({ token: 'short' }).success).toBe(false);
  });
});
