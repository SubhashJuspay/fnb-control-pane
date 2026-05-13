'use client';

import { useEffect } from 'react';
import { useQuery } from 'urql';
import { formatMoney } from '@repo/ui';
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

function formatAddressBlock(addr: unknown): string[] | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as AddressShape;
  const line1 = a.line1 ?? null;
  const line2 = [a.city, a.region, a.postalCode].filter(Boolean).join(', ') || null;
  const line3 = a.country ?? null;
  const lines = [line1, line2, line3].filter((p): p is string => Boolean(p));
  return lines.length > 0 ? lines : null;
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('print') === '1' && data?.trackOnlineOrder) {
      const id = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [data]);

  if (fetching && !data) {
    return <p className="text-body-staff text-on-surface-variant">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-error/30 bg-error-container p-3 text-body-staff text-error-on-container">
        {error.message}
      </p>
    );
  }
  const r = data?.trackOnlineOrder ?? null;
  if (!r) {
    return (
      <p className="rounded-xl border border-outline-variant bg-surface-container-low p-6 text-center text-body-staff text-on-surface-variant">
        We couldn&apos;t find that order. The link may have expired.
      </p>
    );
  }

  const liveItems = (r.items ?? []).filter((i) => i.status !== 'VOIDED');
  const addressLines = formatAddressBlock(r.locationAddress);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6" data-testid="receipt-card">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <h1 className="font-display text-headline-md font-bold text-on-surface">Receipt</h1>
        <button
          type="button"
          onClick={() => window.print()}
          data-testid="receipt-print-button"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-caps text-label-caps uppercase tracking-wider text-on-primary transition-all hover:opacity-90 active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print receipt
        </button>
      </div>

      <article
        className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-overlay-soft print:rounded-none print:border-0 print:shadow-none"
        data-testid="receipt-content"
      >
        <section className="flex flex-col items-center border-b border-dashed border-outline-variant p-12 text-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary-container">
            <span
              aria-hidden
              className="material-symbols-outlined text-[36px] text-on-primary"
            >
              restaurant
            </span>
          </div>
          <h2 className="mb-2 font-display text-display-lg text-primary">{r.tenantName}</h2>
          <p className="max-w-[280px] text-body-staff text-on-surface-variant">
            <span className="block font-semibold text-on-surface">{r.locationName}</span>
            {addressLines?.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            {r.locationPhone ? <span className="block">{r.locationPhone}</span> : null}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-y-4 border-b border-outline-variant px-12 py-8 text-body-staff">
          <div>
            <span className="mb-1 block font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Order number
            </span>
            <span className="text-lg font-bold tabular-nums text-on-surface">
              #{r.shortNumber}
            </span>
          </div>
          <div className="text-right">
            <span className="mb-1 block font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Date &amp; time
            </span>
            <span className="font-medium text-on-surface">
              {formatDateTime(r.closedAt ?? r.pickupAt)}
            </span>
          </div>
          <div>
            <span className="mb-1 block font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Customer
            </span>
            <span className="font-medium text-on-surface">{r.customerName}</span>
          </div>
          <div className="text-right">
            <span className="mb-1 block font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Status
            </span>
            <span className="font-medium text-on-surface">
              {STATUS_LABEL[r.confirmStatus ?? ''] ?? r.confirmStatus}
              {r.ticketStatus === 'CLOSED' ? ' · picked up' : ''}
              {r.ticketStatus === 'VOIDED' ? ' · voided' : ''}
            </span>
          </div>
        </section>

        <section className="flex-grow px-12 py-10">
          <table className="w-full text-left text-body-customer">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant">
                <th className="pb-4 font-label-caps text-label-caps uppercase tracking-wider">
                  Item
                </th>
                <th className="pb-4 text-center font-label-caps text-label-caps uppercase tracking-wider">
                  Qty
                </th>
                <th className="pb-4 text-right font-label-caps text-label-caps uppercase tracking-wider">
                  Price
                </th>
                <th className="pb-4 text-right font-label-caps text-label-caps uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {liveItems.map((i, idx) => (
                <tr key={`${i.nameSnapshot}-${idx}`} className="align-top">
                  <td className="py-6">
                    <div className="font-bold text-on-surface">{i.nameSnapshot}</div>
                    {i.modifiers && i.modifiers.length > 0 ? (
                      <div className="mt-1 text-body-staff leading-relaxed text-on-surface-variant">
                        {i.modifiers.map((m, j) => (
                          <div key={j}>
                            + {m.nameSnapshot}
                            {(m.priceDeltaCents ?? 0) > 0
                              ? ` (${formatMoney(m.priceDeltaCents ?? 0, currency)})`
                              : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-6 text-center font-medium tabular-nums text-on-surface">
                    {i.quantity}
                  </td>
                  <td className="py-6 text-right font-medium tabular-nums text-on-surface">
                    {formatMoney(
                      (i.unitPriceCents ?? 0) + (i.modifiersTotalCents ?? 0),
                      currency,
                    )}
                  </td>
                  <td className="py-6 text-right font-medium tabular-nums text-on-surface">
                    {formatMoney(i.lineSubtotalCents ?? 0, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-auto bg-surface-container-low px-12 py-10">
          <div className="mb-6 space-y-3 text-body-staff">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatMoney(r.subtotalCents ?? 0, currency)}
              </span>
            </div>
            {r.taxCents != null && r.taxCents > 0 ? (
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Tax</span>
                <span className="tabular-nums">{formatMoney(r.taxCents, currency)}</span>
              </div>
            ) : null}
            {r.tipCents != null && r.tipCents > 0 ? (
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Tip</span>
                <span className="tabular-nums">{formatMoney(r.tipCents, currency)}</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t-2 border-dashed border-primary pt-6">
            <span className="font-display text-display-lg text-primary">Total</span>
            <span className="font-display text-display-lg tabular-nums text-primary">
              {formatMoney(
                (r.totalCents ?? 0) + (r.tipCents ?? 0),
                currency,
              )}
            </span>
          </div>
        </section>

        <footer className="border-t border-outline-variant px-12 py-10 text-center">
          <p className="text-body-staff text-on-surface-variant">
            Thank you for ordering with {r.tenantName}.
            <br />
            We hope to see you again soon!
          </p>
        </footer>
      </article>
    </div>
  );
}
