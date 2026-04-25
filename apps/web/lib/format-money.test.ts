import { describe, expect, it } from 'vitest';
import { formatMoney } from '@repo/ui';

describe('formatMoney', () => {
  it('formats USD with two decimals', () => {
    // ICU mintes a non-breaking space and locale-dependent separators; just
    // assert the dollar glyph and the cents digits land on the formatted side.
    const result = formatMoney(1299, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('12.99');
  });

  it('formats EUR with two decimals', () => {
    const result = formatMoney(1050, 'EUR');
    // The euro glyph + "10.50" should both appear regardless of locale ordering.
    expect(result).toMatch(/€/);
    expect(result).toContain('10.50');
  });

  it('formats JPY without decimals (zero-decimal currency)', () => {
    const result = formatMoney(123400, 'JPY');
    expect(result).toMatch(/¥/);
    // 123400 minor-units / 100 = 1234 yen; ICU renders without decimal places.
    expect(result).toContain('1,234');
    expect(result).not.toContain('.');
  });

  it('defaults to USD when no currency is supplied', () => {
    expect(formatMoney(0)).toContain('$');
    expect(formatMoney(0)).toContain('0.00');
  });
});
