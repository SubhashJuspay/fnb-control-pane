'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Card,
  CardContent,
  Input,
  ScheduleEditor,
  ScheduleSummary,
  Sortable,
  type Schedule,
} from '@repo/ui';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveMenuDocument,
  CreateMenuSectionDocument,
  LocationMenuDocument,
  ReorderMenuSectionsDocument,
  UpdateMenuDocument,
  type LocationMenuQuery,
} from '@/lib/graphql/generated/graphql';
import { MenuSectionCard } from './menu-section-card';

interface MenuBuilderProps {
  tenantSlug: string;
  locationSlug: string;
  menuId: string;
}

type MenuRow = NonNullable<LocationMenuQuery['locationMenu']>;
type SectionRow = NonNullable<NonNullable<MenuRow['sections']>[number]>;

const NAME_DEBOUNCE_MS = 600;

function asSchedule(raw: unknown): Schedule {
  if (raw && typeof raw === 'object') {
    const obj = raw as { kind?: unknown; windows?: unknown };
    if (obj.kind === 'always') return { kind: 'always' };
    if (obj.kind === 'weekly' && Array.isArray(obj.windows)) {
      return { kind: 'weekly', windows: obj.windows as Schedule extends { kind: 'weekly'; windows: infer W } ? W : never };
    }
  }
  return { kind: 'always' };
}

export function MenuBuilder({ tenantSlug, locationSlug, menuId }: MenuBuilderProps): React.JSX.Element {
  const router = useRouter();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: LocationMenuDocument,
    variables: { id: menuId },
  });
  const [, updateMenu] = useMutation(UpdateMenuDocument);
  const [, archiveMenu] = useMutation(ArchiveMenuDocument);
  const [, createSection] = useMutation(CreateMenuSectionDocument);
  const [, reorderSections] = useMutation(ReorderMenuSectionsDocument);

  const menu = data?.locationMenu ?? null;
  const sections: SectionRow[] = (menu?.sections ?? []).filter(
    (s): s is SectionRow => s != null && Boolean(s.id) && !s.archivedAt,
  );

  const [name, setName] = useState(menu?.name ?? '');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (menu?.name && menu.name !== name) {
      setName(menu.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.name]);

  const refresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  const onNameChange = (next: string): void => {
    setName(next);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (!next.trim()) return;
    nameDebounceRef.current = setTimeout(async () => {
      const result = await updateMenu({ input: { id: menuId, name: next.trim() } });
      if (result.error) toast.error(result.error.message);
    }, NAME_DEBOUNCE_MS);
  };

  const onScheduleChange = async (schedule: Schedule): Promise<void> => {
    const result = await updateMenu({ input: { id: menuId, schedule } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Schedule saved');
    refresh();
  };

  const onArchive = async (): Promise<void> => {
    const result = await archiveMenu({ input: { id: menuId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Menu archived');
    router.push(`/${tenantSlug}/${locationSlug}/menus`);
  };

  const onReorderSections = async (orderedIds: string[]): Promise<void> => {
    const result = await reorderSections({ input: { menuId, orderedIds } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    refresh();
  };

  const onCreateSection = async (): Promise<void> => {
    const trimmed = newSectionName.trim();
    if (!trimmed) {
      toast.error('Section name is required');
      return;
    }
    const result = await createSection({ input: { menuId, name: trimmed } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Section added');
    setNewSectionName('');
    setAdding(false);
    refresh();
  };

  if (fetching && !menu) {
    return <p className="text-sm text-muted-foreground">Loading menu…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (!menu) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Menu not found.</p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/${tenantSlug}/${locationSlug}/menus`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to menus
          </Link>
        </Button>
      </div>
    );
  }

  const schedule = asSchedule(menu.schedule);
  const ids = sections.map((s) => s.id ?? '');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${tenantSlug}/${locationSlug}/menus`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to menus
          </Link>
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onArchive}>
          <Trash2 className="h-4 w-4 mr-1" />
          Archive menu
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Menu name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="text-lg font-semibold flex-1 min-w-64"
            />
            {menu.isLive ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Live now
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              <ScheduleSummary schedule={schedule} />
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
              Edit schedule
            </Button>
            <ScheduleEditor
              open={scheduleOpen}
              onOpenChange={setScheduleOpen}
              value={schedule}
              onChange={onScheduleChange}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sections yet. Add one below to start composing your menu.
          </p>
        ) : (
          <Sortable items={ids} onReorder={onReorderSections}>
            <ul className="flex flex-col gap-3">
              {sections.map((section) => (
                <MenuSectionCard
                  key={section.id ?? ''}
                  section={section}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </Sortable>
        )}

        {adding ? (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
            <div className="grid flex-1 gap-1 min-w-48">
              <label htmlFor="new-section-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Section name
              </label>
              <Input
                id="new-section-name"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="e.g. Starters"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setAdding(false); setNewSectionName(''); }}>
                Cancel
              </Button>
              <Button type="button" onClick={onCreateSection}>
                Add section
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setAdding(true)}>
            Add section
          </Button>
        )}
      </div>
    </div>
  );
}
