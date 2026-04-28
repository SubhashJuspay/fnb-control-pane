import { describe, expect, it } from 'vitest';
import { resolveDiscountScope } from './discount.js';

describe('resolveDiscountScope', () => {
  it('returns ticket-scope tag when ticketId is set', () => {
    const ticket = { id: 't-1' };
    expect(
      resolveDiscountScope({ ticketId: 't-1', ticketItemId: null, ticket }),
    ).toEqual({ kind: 'ticket', ticket });
  });

  it('returns line-scope tag when ticketItemId is set', () => {
    const ticketItem = { id: 'ti-1' };
    expect(
      resolveDiscountScope({ ticketId: null, ticketItemId: 'ti-1', ticketItem }),
    ).toEqual({ kind: 'line', ticketItem });
  });

  it('throws if neither id is set (schema invariant violation)', () => {
    expect(() =>
      resolveDiscountScope({ ticketId: null, ticketItemId: null }),
    ).toThrow();
  });
});
