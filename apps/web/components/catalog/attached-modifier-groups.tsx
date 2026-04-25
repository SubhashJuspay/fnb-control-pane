'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'urql';
import { Button, Sortable, useSortableItem } from '@repo/ui';
import { GripVertical, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AttachModifierGroupDocument,
  CatalogModifierGroupsDocument,
  DetachModifierGroupDocument,
} from '@/lib/graphql/generated/graphql';

export interface AttachedGroup {
  id: string;
  name: string;
  sortOrder?: number | null;
}

interface AttachedModifierGroupsProps {
  tenantSlug: string;
  menuItemId: string;
  attachedGroups: AttachedGroup[];
  onChanged: () => void;
}

export function AttachedModifierGroups({
  tenantSlug,
  menuItemId,
  attachedGroups,
  onChanged,
}: AttachedModifierGroupsProps): React.JSX.Element {
  const [{ data: groupsData }] = useQuery({
    query: CatalogModifierGroupsDocument,
    variables: { first: 100 },
  });
  const [, attach] = useMutation(AttachModifierGroupDocument);
  const [, detach] = useMutation(DetachModifierGroupDocument);
  const [pickerOpen, setPickerOpen] = useState(false);

  const ids = attachedGroups.map((g) => g.id);
  const attachedSet = useMemo(() => new Set(ids), [ids]);

  const candidates = (groupsData?.catalogModifierGroups?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is { id: string; name: string } =>
      Boolean(n?.id && n?.name && !n.archivedAt && !attachedSet.has(n.id)),
    )
    .map((n) => ({ id: n.id, name: n.name }));

  const onReorder = async (orderedIds: string[]): Promise<void> => {
    // attachModifierGroupToItem is upsert with sortOrder, so we just call it
    // for every group with its new index. Errors are toast-only — the local
    // list will refresh from the parent on success.
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        attach({ input: { menuItemId, modifierGroupId: id, sortOrder: index } }),
      ),
    );
    const failure = results.find((r) => r.error);
    if (failure?.error) {
      toast.error(failure.error.message);
      return;
    }
    onChanged();
  };

  const onDetach = async (groupId: string): Promise<void> => {
    const result = await detach({ input: { menuItemId, modifierGroupId: groupId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Detached');
    onChanged();
  };

  const onAttach = async (groupId: string): Promise<void> => {
    const result = await attach({
      input: { menuItemId, modifierGroupId: groupId, sortOrder: ids.length },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Attached');
    setPickerOpen(false);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Modifier groups</h3>
      {attachedGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No modifier groups attached yet.</p>
      ) : (
        <Sortable items={ids} onReorder={onReorder}>
          <ul className="flex flex-col gap-1">
            {attachedGroups.map((group) => (
              <SortableRow
                key={group.id}
                tenantSlug={tenantSlug}
                group={group}
                onDetach={() => onDetach(group.id)}
              />
            ))}
          </ul>
        </Sortable>
      )}
      <div className="flex items-start gap-2">
        {pickerOpen ? (
          <div className="flex w-full flex-col gap-1 rounded-md border p-2">
            <p className="text-xs text-muted-foreground">Pick a group to attach:</p>
            {candidates.length === 0 ? (
              <p className="text-xs">All groups are already attached.</p>
            ) : (
              <ul className="flex flex-col">
                {candidates.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      onClick={() => onAttach(g.id)}
                    >
                      {g.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            Attach group…
          </Button>
        )}
      </div>
    </div>
  );
}

interface SortableRowProps {
  tenantSlug: string;
  group: AttachedGroup;
  onDetach: () => void;
}

function SortableRow({ tenantSlug, group, onDetach }: SortableRowProps): React.JSX.Element {
  const { ref, attributes, listeners, style } = useSortableItem(group.id);
  return (
    <li
      ref={ref}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${group.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link
        href={`/${tenantSlug}/admin/catalog/modifiers/${group.id}`}
        className="flex-1 text-sm hover:underline"
      >
        {group.name}
      </Link>
      <button
        type="button"
        aria-label={`Detach ${group.name}`}
        onClick={onDetach}
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
