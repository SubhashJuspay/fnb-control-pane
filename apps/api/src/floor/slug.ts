/**
 * Convert a free-form table label like "Patio 12" or "Bar — Seat 3" into a
 * URL-safe slug ("patio-12", "bar-seat-3"). Lowercase ASCII alphanumerics and
 * single hyphens only; leading/trailing hyphens stripped.
 *
 * Mirrors the migration backfill (`regexp_replace(lower(label), '[^a-z0-9]+', '-')`)
 * so existing rows and new inserts produce identical slugs.
 */
export function slugifyTableLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
