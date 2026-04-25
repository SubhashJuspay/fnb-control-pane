/**
 * Format an integer minor-unit value (e.g. cents) as a localized currency
 * string. Uses the runtime's default locale and the supplied ISO 4217 code.
 *
 * For zero-decimal currencies (JPY, KRW, …), `Intl.NumberFormat` derives the
 * correct fraction-digit count automatically, so callers can keep storing the
 * value as a JPY-yen integer (no division) without special-casing.
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}
