'use client';

import Link from 'next/link';
import { useQuery, useMutation } from 'urql';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  type Column,
} from '@repo/ui';
import { LayoutList, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveModifierGroupDocument,
  CatalogModifierGroupsDocument,
  type CatalogModifierGroupsQuery,
} from '@/lib/graphql/generated/graphql';

type Edge = NonNullable<NonNullable<CatalogModifierGroupsQuery['catalogModifierGroups']>['edges']>[number];
export type ModifierGroupRow = NonNullable<NonNullable<Edge>['node']>;

interface ModifierGroupsTableProps {
  tenantSlug: string;
}

export function describeMinMax(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const minN = min ?? 0;
  const maxN = max ?? 1;
  if (minN === 0 && maxN === 1) return 'Optional, choose 1';
  if (minN === 0) return `Optional, up to ${maxN}`;
  if (minN === maxN) return `Required, exactly ${minN}`;
  return `Required, ${minN}–${maxN}`;
}

export function ModifierGroupsTable({
  tenantSlug,
}: ModifierGroupsTableProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: CatalogModifierGroupsDocument,
    variables: { first: 50 },
  });
  const [, archive] = useMutation(ArchiveModifierGroupDocument);

  const rows: ModifierGroupRow[] = (data?.catalogModifierGroups?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is ModifierGroupRow => n != null && Boolean(n.id));

  const onArchive = async (id: string): Promise<void> => {
    const result = await archive({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Modifier group archived');
    refetch({ requestPolicy: 'network-only' });
  };

  const columns: Column<ModifierGroupRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (g) => (
        <Link
          href={`/${tenantSlug}/admin/catalog/modifiers/${g.id ?? ''}`}
          className="font-medium hover:underline"
        >
          {g.name ?? '—'}
        </Link>
      ),
    },
    {
      key: 'minmax',
      header: 'Selection rules',
      cell: (g) => describeMinMax(g.minSelections, g.maxSelections),
    },
    {
      key: 'modCount',
      header: 'Modifiers',
      className: 'text-center tabular-nums',
      cell: (g) => g.modifiers?.length ?? 0,
    },
    {
      key: 'attached',
      header: 'Attached items',
      className: 'text-center tabular-nums',
      cell: (g) => g.attachedItems?.length ?? 0,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (g) =>
        g.archivedAt ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
            Archived
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Active</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (g) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Modifier group actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/${tenantSlug}/admin/catalog/modifiers/${g.id ?? ''}`}>Edit</Link>
            </DropdownMenuItem>
            {!g.archivedAt ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => g.id && onArchive(g.id)}
              >
                Archive
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Modifier groups</h2>
          <p className="text-sm text-muted-foreground">
            Reusable groups of options (e.g. Sauce, Size). Attach them to one or many items.
          </p>
        </div>
        <Button asChild>
          <Link href={`/${tenantSlug}/admin/catalog/modifiers/new`}>New group</Link>
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      {!fetching && rows.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title="No modifier groups yet"
          description="Create a group to start offering options on your menu items."
          action={
            <Button asChild>
              <Link href={`/${tenantSlug}/admin/catalog/modifiers/new`}>New group</Link>
            </Button>
          }
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id ?? ''} />
      )}
    </div>
  );
}
