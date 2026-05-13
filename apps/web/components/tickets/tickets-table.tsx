'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from 'urql';
import {
  Button,
  DataTable,
  EmptyState,
  formatMoney,
  type Column,
} from '@repo/ui';
import { Receipt } from 'lucide-react';
import {
  OrderType,
  TicketHistoryDocument,
  TicketStatus,
  type TicketHistoryQuery,
  type TicketHistoryQueryVariables,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import {
  TicketsFilters,
  type ServerOption,
  type TicketsFilterValues,
} from './tickets-filters';

type TicketRow = NonNullable<
  NonNullable<NonNullable<TicketHistoryQuery['ticketHistory']>['edges']>[number]
>['node'];

interface TicketsTableProps {
  tenantSlug: string;
  locationSlug: string;
  servers: ServerOption[];
  /** Filter state derived from URL search params at server-render time. */
  initialFilters: TicketsFilterValues;
}

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<TicketStatus, string> = {
  [TicketStatus.Open]: 'Open',
  [TicketStatus.Closed]: 'Closed',
  [TicketStatus.Voided]: 'Voided',
};

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.DineIn]: 'Dine-in',
  [OrderType.Takeout]: 'Takeout',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '—';
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function StatusPill({ status }: { status: TicketStatus | null | undefined }): React.JSX.Element {
  const cls = (() => {
    switch (status) {
      case TicketStatus.Open:
        return 'bg-success-container text-success-on-container';
      case TicketStatus.Closed:
        return 'bg-secondary-container text-secondary-on-container';
      case TicketStatus.Voided:
        return 'bg-error-container text-error-on-container';
      default:
        return 'bg-surface-container text-on-surface-variant';
    }
  })();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-status-pill text-status-pill uppercase tracking-wider ${cls}`}
    >
      {status ? STATUS_LABEL[status] : '—'}
    </span>
  );
}

/**
 * Translate the URL-derived filter values into the GraphQL filter input.
 * `from`/`to` are interpreted as local-day boundaries; we convert them to
 * an inclusive `fromDate` (start-of-day) and exclusive `toDate` (next-day
 * start-of-day) so the api's date-range comparison covers the whole day.
 */
function toGraphQlFilter(values: TicketsFilterValues): TicketHistoryQueryVariables['filter'] {
  const fromIso = values.fromDate ? new Date(`${values.fromDate}T00:00:00`).toISOString() : null;
  const toIso = (() => {
    if (!values.toDate) return null;
    const d = new Date(`${values.toDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  })();
  return {
    fromDate: fromIso,
    toDate: toIso,
    status: values.status === 'ALL' ? null : values.status,
    serverId: values.serverId === 'ALL' ? null : values.serverId,
  };
}

/**
 * Tickets history table. Server-paginated via `first/after` on the
 * `ticketHistory` connection; "Load more" appends pages locally. The filter
 * panel above writes URL params and our `useQuery` reruns whenever those
 * URL-derived `initialFilters` change.
 */
export function TicketsTable({
  tenantSlug,
  locationSlug,
  servers,
  initialFilters,
}: TicketsTableProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const router = useRouter();

  const filterInput = useMemo(() => toGraphQlFilter(initialFilters), [initialFilters]);

  // Local accumulator across pages — reset whenever filterInput changes.
  const [accumulated, setAccumulated] = useState<NonNullable<TicketRow>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    setAccumulated([]);
    setCursor(null);
  }, [filterInput]);

  const [{ data, fetching, error }] = useQuery({
    query: TicketHistoryDocument,
    variables: { first: PAGE_SIZE, after: cursor, filter: filterInput },
    requestPolicy: 'cache-and-network',
  });

  // Merge the latest page into our accumulator. We dedupe by id because
  // urql may re-emit the same page during cache-and-network.
  useEffect(() => {
    const edges = data?.ticketHistory?.edges ?? [];
    const fresh = edges
      .map((e) => e?.node)
      .filter((n): n is NonNullable<TicketRow> => Boolean(n?.id));
    if (fresh.length === 0) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((p) => p.id ?? ''));
      const out = [...prev];
      for (const node of fresh) {
        if (!seen.has(node.id ?? '')) {
          out.push(node);
          seen.add(node.id ?? '');
        }
      }
      return out;
    });
  }, [data]);

  const pageInfo = data?.ticketHistory?.pageInfo;
  const hasMore = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);

  const onRowClick = (id: string): void => {
    router.push(`/${tenantSlug}/${locationSlug}/tickets/${id}`);
  };

  const columns: Column<NonNullable<TicketRow>>[] = [
    {
      key: 'shortNumber',
      header: '#',
      className: 'w-16 font-semibold tabular-nums',
      cell: (row) => `#${row.shortNumber ?? '—'}`,
    },
    {
      key: 'businessDay',
      header: 'Business day',
      cell: (row) => <span className="text-sm">{formatDate(row.businessDay)}</span>,
    },
    {
      key: 'opened',
      header: 'Opened',
      cell: (row) => <span className="text-sm tabular-nums">{formatTime(row.openedAt)}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <span className="truncate text-sm">{row.customerLabel ?? '—'}</span>
      ),
    },
    {
      key: 'server',
      header: 'Server',
      cell: (row) => <span className="text-sm">{row.openedBy?.name ?? '—'}</span>,
    },
    {
      key: 'orderType',
      header: 'Type',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.orderType ? ORDER_TYPE_LABEL[row.orderType] : '—'}
        </span>
      ),
    },
    {
      key: 'lines',
      header: 'Lines',
      className: 'text-center tabular-nums',
      cell: (row) => row.items?.filter((i) => i?.status !== 'VOIDED').length ?? 0,
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.totalCents ?? 0, currency),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusPill status={row.status} />,
    },
  ];

  const rowsWithClick = accumulated.map((row) => ({
    ...row,
    __onClick: () => row.id && onRowClick(row.id),
  }));

  // Augment columns to wrap cell content in a clickable Link for keyboard
  // navigation; we wrap the first column in a `<Link>` so the row remains
  // accessible without overriding row semantics from `<DataTable>`.
  const columnsClickable: Column<(typeof rowsWithClick)[number]>[] = columns.map((col, i) =>
    i === 0
      ? {
          ...col,
          cell: (row) => (
            <Link
              href={`/${tenantSlug}/${locationSlug}/tickets/${row.id ?? ''}`}
              className="font-semibold hover:underline"
            >
              #{row.shortNumber ?? '—'}
            </Link>
          ),
        }
      : { ...col, cell: (row) => col.cell(row) },
  );

  const showInitialEmpty = !fetching && accumulated.length === 0;

  return (
    <div className="flex flex-col gap-gutter">
      <TicketsFilters servers={servers} initialValues={initialFilters} />
      {error ? (
        <p className="rounded-xl border border-error/30 bg-error-container p-3 text-body-staff text-error-on-container" role="alert">
          {error.message}
        </p>
      ) : null}

      {showInitialEmpty ? (
        <EmptyState
          icon={Receipt}
          title="No tickets in this range"
          description="Try widening the date range or clearing filters."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
          <DataTable
            columns={columnsClickable}
            rows={rowsWithClick}
            rowKey={(r) => r.id ?? ''}
            emptyTitle="No tickets"
          />
          <div className="flex items-center justify-between gap-2 border-t border-outline-variant bg-surface-container-low px-4 py-3 text-body-staff text-on-surface-variant">
            <span>
              {fetching ? 'Loading…' : `${accumulated.length} tickets shown`}
            </span>
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCursor(pageInfo?.endCursor ?? null)}
                disabled={fetching}
                className="border-primary text-primary hover:bg-primary/5"
              >
                Load more
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
