'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery } from 'urql';
import { FloorTablesDocument } from '@/lib/graphql/generated/graphql';

export interface TableQrSheetProps {
  origin: string;
  tenantSlug: string;
  locationSlug: string;
  tenantName: string;
  locationName: string;
}

/**
 * Printable QR-sticker sheet. Each non-archived table renders one card with
 * its label, capacity, and a QR pointing at the public order URL with the
 * `?table=` flag set. Hitting Print (Cmd+P) gives a paginated sheet ready
 * for paper labels — the `@media print` rules hide chrome, force black ink,
 * and ensure each card fits on its own grid cell.
 */
export function TableQrSheet({
  origin,
  tenantSlug,
  locationSlug,
  tenantName,
  locationName,
}: TableQrSheetProps): React.JSX.Element {
  const [{ data, fetching, error }] = useQuery({ query: FloorTablesDocument });

  const tables = useMemo(() => {
    const rows = data?.floorTables ?? [];
    return rows
      .filter((t) => t?.id && t?.slug && t?.label && t.archivedAt == null)
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  }, [data?.floorTables]);

  function urlFor(slug: string): string {
    const base = origin.replace(/\/$/, '');
    return `${base}/order/${tenantSlug}/${locationSlug}?table=${slug}`;
  }

  return (
    <div className="flex h-full flex-col bg-surface text-on-surface print:bg-white">
      {/* Toolbar — hidden when printing */}
      <header
        className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-container-margin py-stack-loose print:hidden"
      >
        <div className="flex flex-col">
          <h1 className="font-display text-headline-md font-bold text-on-surface">
            Table QR codes
          </h1>
          <p className="text-body-staff text-on-surface-variant">
            Print, cut, and stick one QR per table. Scanning takes guests to a
            dine-in version of the menu — orders fire directly to the kitchen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}/${locationSlug}/floor`}
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-body-staff font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to floor
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary shadow-card-soft transition-transform active:scale-95"
            data-testid="table-qr-print"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            Print sheet
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-container-margin py-stack-loose print:overflow-visible print:p-0">
        {fetching ? (
          <p className="text-body-staff text-on-surface-variant">Loading tables…</p>
        ) : error ? (
          <p className="text-body-staff text-error">{error.message}</p>
        ) : tables.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center">
            <p className="text-body-customer font-semibold text-on-surface">
              No tables yet
            </p>
            <p className="mt-1 text-body-staff text-on-surface-variant">
              Add tables on the floor editor first.
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-2"
            data-testid="table-qr-grid"
          >
            {tables.map((t) => {
              const url = urlFor(t.slug as string);
              return (
                <article
                  key={t.id ?? t.slug}
                  className="flex break-inside-avoid flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding text-center shadow-card-soft print:break-inside-avoid print:rounded-none print:border print:border-black/40 print:bg-white print:shadow-none"
                  data-testid={`table-qr-card-${t.slug}`}
                >
                  <p className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    {tenantName} · {locationName}
                  </p>
                  <h2 className="font-display text-display-lg font-bold text-on-surface print:text-black">
                    Table {t.label}
                  </h2>
                  <div className="rounded-lg bg-white p-3 print:p-0">
                    <QRCodeSVG
                      value={url}
                      size={196}
                      level="M"
                      marginSize={2}
                    />
                  </div>
                  <p className="max-w-full break-all text-body-staff text-on-surface-variant print:text-black">
                    Scan to order at your table
                  </p>
                  <p className="hidden font-label-caps text-label-caps uppercase tracking-wide text-on-surface-variant print:block print:text-[10px]">
                    {url}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
