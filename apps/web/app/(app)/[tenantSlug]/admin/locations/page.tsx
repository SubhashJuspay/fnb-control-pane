'use client';

import { useState } from 'react';
import { useQuery } from 'urql';
import { Button, DataTable, type Column } from '@repo/ui';
import {
  AdminTenantLocationsDocument,
  type AdminTenantLocationsQuery,
} from '@/lib/graphql/generated/graphql';
import { CreateLocationDialog } from '@/components/admin/create-location-dialog';

type LocationRow = NonNullable<NonNullable<AdminTenantLocationsQuery['tenantLocations']>[number]>;

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function AdminLocationsPage(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [{ data, fetching }, refetch] = useQuery({
    query: AdminTenantLocationsDocument,
  });

  const locations: LocationRow[] = (data?.tenantLocations ?? []).filter(
    (l): l is LocationRow => l != null,
  );

  const columns: Column<LocationRow>[] = [
    { key: 'name', header: 'Name', cell: (l) => l.name ?? '—' },
    {
      key: 'slug',
      header: 'Slug',
      cell: (l) => <span className="font-mono text-xs">{l.slug ?? '—'}</span>,
    },
    {
      key: 'timezone',
      header: 'Timezone',
      cell: (l) => l.timezone ?? '—',
    },
    {
      key: 'currency',
      header: 'Currency',
      cell: (l) => <span className="font-mono text-xs">{l.currency ?? '—'}</span>,
    },
    {
      key: 'cutoff',
      header: 'Day cutoff',
      cell: (l) => l.businessDayCutoff ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (l) => <span className="font-mono text-xs">{l.status ?? '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      cell: (l) => formatDate(l.createdAt),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Each tenant can run any number of locations. New locations start empty — sub-projects
            fill in their settings.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Create location</Button>
      </div>
      {fetching && locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading locations…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={locations}
          rowKey={(l) => l.id ?? ''}
          emptyTitle="No locations yet"
          emptyDescription="Create your first location to begin."
        />
      )}
      <CreateLocationDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => refetch({ requestPolicy: 'network-only' })}
      />
    </div>
  );
}
