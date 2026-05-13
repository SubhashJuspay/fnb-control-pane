'use client';

import { useEffect } from 'react';
import { useQuery } from 'urql';
import { Printer } from 'lucide-react';
import { Button, formatMoney } from '@repo/ui';
import { ReceiptOnlineOrderDocument } from '@/lib/graphql/generated/graphql';

export interface ReceiptCardProps {
  token: string;
  currency: string;
}

interface AddressShape {
  line1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

function formatAddressOneLine(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as AddressShape;
  const parts = [a.line1, a.city, a.region, a.postalCode, a.country].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString();
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
};

export function ReceiptCard({ token, currency }: ReceiptCardProps): React.JSX.Element {
  const [{ data, fetching, error }] = useQuery({
    query: ReceiptOnlineOrderDocument,
    variables: { token },
    requestPolicy: 'cache-and-network',
  });

  // Auto-trigger print when ?print=1 is in the URL — handy for "Print receipt"
  // links that go straight to a print dialog.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('print') === '1' && data?.trackOnlineOrder) {
      // Allow the page to lay out before triggering print.
      const id = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [data]);

  if (fetching && !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </p>
    );
  }
  const r = data?.trackOnlineOrder ?? null;
  if (!r) {
    return (
      <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        We couldn&apos;t find that order. The link may have expired.
      </p>
    );
  }

  const liveItems = (r.items ?? []).filter((i) => i.status !== 'VOIDED');
  const addr = formatAddressOneLine(r.locationAddress);

  return (
    <div className="flex flex-col gap-4" data-testid="receipt-card">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <h1 className="text-lg font-semibold">Receipt</h1>
        <Button
          type="button"
          size="sm"
          onClick={() => window.print()}
          data-testid="receipt-print-button"
        >
          <Printer className="mr-2 size-4" />
          Print
        </Button>
      </div>

      <article
        className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-sm print:rounded-none print:border-0 print:p-0"
        data-testid="receipt-content"
      >
        <header className="flex flex-col gap-1 border-b pb-3">
          <p className="text-base font-semibold">{r.tenantName}</p>
          <p className="text-muted-foreground">{r.locationName}</p>
          {addr ? <p className="text-xs text-muted-foreground">{addr}</p> : null}
          {r.locationPhone ? (
            <p className="text-xs text-muted-foreground">{r.locationPhone}</p>
          ) : null}
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Order</dt>
          <dd className="font-semibold tabular-nums">#{r.shortNumber}</dd>
          <dt className="text-muted-foreground">Customer</dt>
          <dd>{r.customerName}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            {STATUS_LABEL[r.confirmStatus ?? ''] ?? r.confirmStatus}
            {r.ticketStatus === 'CLOSED' ? ' • picked up' : ''}
            {r.ticketStatus === 'VOIDED' ? ' • voided' : ''}
          </dd>
          {r.closedAt ? (
            <>
              <dt className="text-muted-foreground">Closed</dt>
              <dd>{formatDateTime(r.closedAt)}</dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">Pickup</dt>
              <dd>{formatDateTime(r.pickupAt)}</dd>
            </>
          )}
        </dl>

        <div>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="py-1 text-left font-medium">Item</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Price</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {liveItems.map((i, idx) => (
                <tr key={`${i.nameSnapshot}-${idx}`} className="align-top">
                  <td className="py-1">
                    <div className="font-medium">{i.nameSnapshot}</div>
                    {i.modifiers && i.modifiers.length > 0 ? (
                      <ul className="text-muted-foreground">
                        {i.modifiers.map((m, j) => (
                          <li key={j}>
                            + {m.nameSnapshot}
                            {(m.priceDeltaCents ?? 0) > 0
                              ? ` (${formatMoney(m.priceDeltaCents ?? 0, currency)})`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">{i.quantity}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoney(
                      (i.unitPriceCents ?? 0) + (i.modifiersTotalCents ?? 0),
                      currency,
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoney(i.lineSubtotalCents ?? 0, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">
            {formatMoney(r.subtotalCents ?? 0, currency)}
          </dd>
          {r.taxCents != null && r.taxCents > 0 ? (
            <>
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(r.taxCents, currency)}
              </dd>
            </>
          ) : null}
          <dt className="border-t pt-1 font-semibold">Total</dt>
          <dd className="border-t pt-1 text-right font-semibold tabular-nums">
            {formatMoney(r.totalCents ?? 0, currency)}
          </dd>
          {r.tipCents != null && r.tipCents > 0 ? (
            <>
              <dt className="text-muted-foreground">Tip</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(r.tipCents, currency)}
              </dd>
              <dt className="border-t pt-1 font-semibold">Grand total</dt>
              <dd className="border-t pt-1 text-right font-semibold tabular-nums">
                {formatMoney((r.totalCents ?? 0) + r.tipCents, currency)}
              </dd>
            </>
          ) : null}
        </dl>

        <p className="text-center text-[10px] text-muted-foreground">
          Thank you for ordering with {r.tenantName}.
        </p>
      </article>
    </div>
  );
}
