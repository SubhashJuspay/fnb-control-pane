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
  ScheduleSummary,
  type Column,
  type Schedule,
} from '@repo/ui';
import { CalendarClock, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveMenuDocument,
  LocationMenusDocument,
  type LocationMenusQuery,
} from '@/lib/graphql/generated/graphql';

interface MenusListProps {
  tenantSlug: string;
  locationSlug: string;
}

type MenuRow = NonNullable<NonNullable<LocationMenusQuery['locationMenus']>[number]>;

function asSchedule(raw: unknown): Schedule {
  // The api returns `schedule` as JSON. Validate the shape minimally — if it
  // doesn't match either variant, fall back to "always" so we still render
  // something sensible instead of crashing the whole list.
  if (raw && typeof raw === 'object') {
    const obj = raw as { kind?: unknown; windows?: unknown };
    if (obj.kind === 'always') return { kind: 'always' };
    if (obj.kind === 'weekly' && Array.isArray(obj.windows)) {
      return { kind: 'weekly', windows: obj.windows as Schedule extends { kind: 'weekly'; windows: infer W } ? W : never };
    }
  }
  return { kind: 'always' };
}

export function MenusList({ tenantSlug, locationSlug }: MenusListProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: LocationMenusDocument,
  });
  const [, archiveMenu] = useMutation(ArchiveMenuDocument);

  const menus: MenuRow[] = (data?.locationMenus ?? []).filter(
    (m): m is MenuRow => m != null && Boolean(m.id) && !m.archivedAt,
  );
  const live = menus.filter((m) => m.isLive);

  const refresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  const onArchive = async (id: string): Promise<void> => {
    const result = await archiveMenu({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Menu archived');
    refresh();
  };

  const columns: Column<MenuRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <Link
          href={`/${tenantSlug}/${locationSlug}/menus/${row.id ?? ''}`}
          className="font-medium hover:underline"
        >
          {row.name ?? '—'}
        </Link>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          <ScheduleSummary schedule={asSchedule(row.schedule)} />
        </span>
      ),
    },
    {
      key: 'shape',
      header: 'Sections / items',
      className: 'text-center tabular-nums',
      cell: (row) => {
        const sections = (row.sections ?? []).filter((s) => s && !s.archivedAt);
        return (
          <span className="text-xs">
            {sections.length} sections
          </span>
        );
      },
    },
    {
      key: 'live',
      header: 'Live',
      cell: (row) =>
        row.isLive ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Live now
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.isActive ? (
          <span className="text-xs text-muted-foreground">Active</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
            Inactive
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/${tenantSlug}/${locationSlug}/menus/${row.id ?? ''}`}>Edit</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => row.id && onArchive(row.id)}
            >
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const showEmpty = !fetching && menus.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {live.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{live.length}</span>{' '}
              {live.length === 1 ? 'menu is' : 'menus are'} live right now:{' '}
              {live.map((m) => m.name ?? '—').join(', ')}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No menus are live right now.
            </p>
          )}
        </div>
        <Button asChild>
          <Link href={`/${tenantSlug}/${locationSlug}/menus/new`}>New menu</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      {showEmpty ? (
        <EmptyState
          icon={CalendarClock}
          title="No menus yet"
          description="Create your first menu to start composing sections and items."
          action={
            <Button asChild>
              <Link href={`/${tenantSlug}/${locationSlug}/menus/new`}>New menu</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={menus}
          rowKey={(r) => r.id ?? ''}
          emptyTitle="No menus"
        />
      )}
    </div>
  );
}
