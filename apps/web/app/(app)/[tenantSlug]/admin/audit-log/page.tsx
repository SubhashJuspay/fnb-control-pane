'use client';

import { useEffect, useState } from 'react';
import { useQuery } from 'urql';
import { Button, DataTable, type Column } from '@repo/ui';
import { AdminAuditLogsDocument, type AdminAuditLogsQuery } from '@/lib/graphql/generated/graphql';

type AuditRow = NonNullable<
  NonNullable<NonNullable<AdminAuditLogsQuery['auditLogs']>['edges']>[number]
>['node'];

const PAGE_SIZE = 50;

function formatTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function AdminAuditLogPage(): React.JSX.Element {
  const [after, setAfter] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<NonNullable<AuditRow>[]>([]);
  const [{ data, fetching }] = useQuery({
    query: AdminAuditLogsDocument,
    variables: { first: PAGE_SIZE, after: after ?? undefined },
  });

  // Merge new edges into the running list whenever data changes for the
  // current cursor. Naive — fine for a 50-rows-per-fetch admin page.
  useEffect(() => {
    const incoming: NonNullable<AuditRow>[] = (data?.auditLogs?.edges ?? [])
      .map((e) => e?.node)
      .filter((n): n is NonNullable<AuditRow> => n != null);
    if (incoming.length === 0) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const accumulated = [...prev];
      for (const row of incoming) {
        if (row.id && !seen.has(row.id)) accumulated.push(row);
      }
      return accumulated.length === prev.length ? prev : accumulated;
    });
  }, [data]);

  const pageInfo = data?.auditLogs?.pageInfo;
  const hasNextPage = pageInfo?.hasNextPage ?? false;
  const endCursor = pageInfo?.endCursor ?? null;

  const columns: Column<NonNullable<AuditRow>>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (a) => <span className="font-mono text-xs">{formatTime(a.createdAt)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (a) =>
        a.actorEmail ?? a.actorUserId ?? <span className="text-muted-foreground">system</span>,
    },
    {
      key: 'action',
      header: 'Action',
      cell: (a) => <span className="font-mono text-xs">{a.action ?? '—'}</span>,
    },
    {
      key: 'resource',
      header: 'Resource',
      cell: (a) => (
        <span className="font-mono text-xs">
          {a.resourceType ?? '—'}
          {a.resourceId ? `:${a.resourceId.slice(0, 8)}` : ''}
        </span>
      ),
    },
    {
      key: 'metadata',
      header: 'Details',
      cell: (a) =>
        a.metadata != null ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">View</summary>
            <pre className="mt-2 overflow-auto rounded bg-muted/50 p-2 text-xs">
              {JSON.stringify(a.metadata, null, 2)}
            </pre>
          </details>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Tenant-wide write activity, newest first. Used for compliance and incident review.
        </p>
      </div>
      {fetching && accumulated.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading audit log…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={accumulated}
          rowKey={(a) => a.id ?? ''}
          emptyTitle="Nothing to show"
          emptyDescription="Audit entries appear here as users act on the tenant."
        />
      )}
      {hasNextPage && endCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setAfter(endCursor)} disabled={fetching}>
            {fetching ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
