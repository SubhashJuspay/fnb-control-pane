'use client';

import { useQuery } from 'urql';
import { Button } from '@repo/ui';
import { CatalogTaxCategoryRatesDocument } from '@/lib/graphql/generated/graphql';

interface LocationTaxRatesProps {
  taxCategoryId: string;
  taxCategoryName: string;
  locations: Array<{ id: string; name: string }>;
  onSetRateClick: (config: {
    taxCategoryId: string;
    taxCategoryName: string;
    locationId: string;
    locationName: string;
  }) => void;
}

function formatRate(permille: number | null | undefined): string {
  if (permille == null) return '—';
  return `${(permille / 10).toFixed(2)}%`;
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

/**
 * Inner table rendered when a tax category row is expanded. Fires one query
 * per expansion (the schema only exposes `ratesAtLocation` per location, so
 * we fold across locations on the client). Each location row shows the
 * current open rate plus a "Set new rate" button.
 */
export function LocationTaxRates({
  taxCategoryId,
  taxCategoryName,
  locations,
  onSetRateClick,
}: LocationTaxRatesProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Location</th>
            <th className="px-3 py-2 text-left font-medium">Current rate</th>
            <th className="px-3 py-2 text-left font-medium">Effective from</th>
            <th className="px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <LocationRateRow
              key={loc.id}
              taxCategoryId={taxCategoryId}
              taxCategoryName={taxCategoryName}
              location={loc}
              onSetRateClick={onSetRateClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocationRateRow({
  taxCategoryId,
  taxCategoryName,
  location,
  onSetRateClick,
}: {
  taxCategoryId: string;
  taxCategoryName: string;
  location: { id: string; name: string };
  onSetRateClick: LocationTaxRatesProps['onSetRateClick'];
}): React.JSX.Element {
  const [{ data, fetching }] = useQuery({
    query: CatalogTaxCategoryRatesDocument,
    variables: { id: taxCategoryId, locationId: location.id },
  });
  const taxCat = (data?.catalogTaxCategories ?? []).find((c) => c?.id === taxCategoryId);
  const rates = taxCat?.ratesAtLocation ?? [];
  // The active rate is the one with no effectiveUntil — i.e. the most recent
  // open window.
  const active = rates.find((r) => r && !r.effectiveUntil) ?? null;

  return (
    <tr className="border-t">
      <td className="px-3 py-2">{location.name}</td>
      <td className="px-3 py-2 tabular-nums">
        {fetching ? '…' : formatRate(active?.ratePermille)}
      </td>
      <td className="px-3 py-2">{fetching ? '…' : formatDate(active?.effectiveFrom)}</td>
      <td className="px-3 py-2 text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onSetRateClick({
              taxCategoryId,
              taxCategoryName,
              locationId: location.id,
              locationName: location.name,
            })
          }
        >
          Set new rate
        </Button>
      </td>
    </tr>
  );
}
