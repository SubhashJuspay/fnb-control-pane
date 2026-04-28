'use client';

import { formatMoney } from '@repo/ui';
import { useLocationCurrency } from '@/lib/location-currency';

interface TotalsBlockProps {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Right-aligned subtotal/discount/tax/total summary that sits above the
 * action buttons in the active ticket panel. Discount line is suppressed
 * when there is no discount applied.
 */
export function TotalsBlock({
  subtotalCents,
  discountCents,
  taxCents,
  totalCents,
}: TotalsBlockProps): React.JSX.Element {
  const currency = useLocationCurrency();
  return (
    <dl className="flex flex-col gap-1 border-t bg-background px-3 py-3 text-sm">
      <Row label="Subtotal" value={formatMoney(subtotalCents, currency)} />
      {discountCents > 0 ? (
        <Row label="Discount" value={`-${formatMoney(discountCents, currency)}`} muted />
      ) : null}
      <Row label="Tax" value={formatMoney(taxCents, currency)} muted />
      <Row label="Total" value={formatMoney(totalCents, currency)} bold />
    </dl>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd
        className={[
          'tabular-nums',
          bold ? 'text-base font-semibold' : '',
          muted ? 'text-muted-foreground' : '',
        ].filter(Boolean).join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
