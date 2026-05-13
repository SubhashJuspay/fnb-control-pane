'use client';

import { formatMoney } from '@repo/ui';
import { useLocationCurrency } from '@/lib/location-currency';

interface TotalsBlockProps {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function TotalsBlock({
  subtotalCents,
  discountCents,
  taxCents,
  totalCents,
}: TotalsBlockProps): React.JSX.Element {
  const currency = useLocationCurrency();
  return (
    <dl className="flex flex-col gap-2 border-t border-outline-variant bg-surface-container-low px-card-padding py-card-padding text-body-staff">
      <Row label="Subtotal" value={formatMoney(subtotalCents, currency)} />
      {discountCents > 0 ? (
        <Row label="Discount" value={`-${formatMoney(discountCents, currency)}`} muted />
      ) : null}
      <Row label="Tax" value={formatMoney(taxCents, currency)} muted />
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-outline-variant pt-3">
        <dt className="font-display text-body-customer font-bold text-on-surface">Total</dt>
        <dd className="font-display text-headline-md font-bold tabular-nums text-primary">
          {formatMoney(totalCents, currency)}
        </dd>
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-on-surface-variant' : 'text-on-surface-variant'}>
        {label}
      </dt>
      <dd className="tabular-nums text-on-surface-variant">{value}</dd>
    </div>
  );
}
