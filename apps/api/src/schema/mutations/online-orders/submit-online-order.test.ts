import { describe, expect, it } from 'vitest';
import { normalizePhone } from './submit-online-order.js';

describe('normalizePhone', () => {
  it('strips spaces, parens, dashes', () => {
    expect(normalizePhone('(555) 555-1234')).toBe('5555551234');
    expect(normalizePhone('555 555 1234')).toBe('5555551234');
    expect(normalizePhone('+1-555-555-1234')).toBe('+15555551234');
  });

  it('lowercases for case-insensitive match', () => {
    expect(normalizePhone('555-AAA')).toBe('555aaa');
  });
});
