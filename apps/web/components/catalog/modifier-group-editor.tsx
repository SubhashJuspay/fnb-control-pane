'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'urql';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  MoneyInput,
  Sortable,
} from '@repo/ui';
import { toast } from 'sonner';
import {
  AddModifierDocument,
  CatalogModifierGroupDocument,
  ReorderModifiersDocument,
} from '@/lib/graphql/generated/graphql';
import { ModifierGroupForm } from './modifier-group-form';
import { ModifierRow, type ModifierRowData } from './modifier-row';

interface ModifierGroupEditorProps {
  tenantSlug: string;
  groupId: string;
}

export function ModifierGroupEditor({
  tenantSlug,
  groupId,
}: ModifierGroupEditorProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: CatalogModifierGroupDocument,
    variables: { id: groupId },
  });
  const [, addModifier] = useMutation(AddModifierDocument);
  const [, reorderModifiers] = useMutation(ReorderModifiersDocument);

  const group = data?.catalogModifierGroup;
  const modifiers: ModifierRowData[] = (group?.modifiers ?? [])
    .filter((m): m is NonNullable<typeof m> => Boolean(m?.id && !m.archivedAt))
    .map((m) => ({
      id: m.id ?? '',
      name: m.name ?? '',
      priceDeltaCents: m.priceDeltaCents ?? 0,
      isDefault: m.isDefault ?? false,
    }));
  const ids = modifiers.map((m) => m.id);

  const [newName, setNewName] = useState('');
  const [newDelta, setNewDelta] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);

  const refresh = (): void => refetch({ requestPolicy: 'network-only' });

  const onReorder = async (orderedIds: string[]): Promise<void> => {
    const result = await reorderModifiers({
      input: { modifierGroupId: groupId, orderedIds },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    refresh();
  };

  const onAdd = async (): Promise<void> => {
    if (!newName.trim()) {
      toast.error('Modifier name is required');
      return;
    }
    setSubmitting(true);
    const result = await addModifier({
      input: {
        modifierGroupId: groupId,
        name: newName.trim(),
        priceDeltaCents: newDelta ?? 0,
      },
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setNewName('');
    setNewDelta(0);
    toast.success('Modifier added');
    refresh();
  };

  if (fetching && !group) {
    return <p className="text-sm text-muted-foreground">Loading group…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }
  if (!group) {
    return <p className="text-sm">Modifier group not found.</p>;
  }

  const attachedItems = (group.attachedItems ?? []).filter(
    (i): i is { id: string; name: string } => Boolean(i?.id && i?.name),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <ModifierGroupForm
          mode="edit"
          tenantSlug={tenantSlug}
          initial={{
            id: group.id ?? '',
            name: group.name ?? '',
            minSelections: group.minSelections ?? 0,
            maxSelections: group.maxSelections ?? 1,
          }}
        />
        <Card>
          <CardHeader>
            <CardTitle>Modifiers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {modifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No modifiers yet. Add one below to get started.
              </p>
            ) : (
              <Sortable items={ids} onReorder={onReorder}>
                <ul className="flex flex-col gap-2">
                  {modifiers.map((m) => (
                    <ModifierRow key={m.id} modifier={m} onChanged={refresh} />
                  ))}
                </ul>
              </Sortable>
            )}
            <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add modifier
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid flex-1 gap-1 min-w-48">
                  <Label htmlFor="new-mod-name">Name</Label>
                  <Input
                    id="new-mod-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="grid w-32 gap-1">
                  <Label htmlFor="new-mod-delta">Price delta</Label>
                  <MoneyInput
                    id="new-mod-delta"
                    value={newDelta}
                    onChange={(c) => setNewDelta(c)}
                  />
                </div>
                <Button type="button" onClick={onAdd} disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Attached items</CardTitle>
        </CardHeader>
        <CardContent>
          {attachedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This group is not attached to any items yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {attachedItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/${tenantSlug}/admin/catalog/items/${item.id}`}
                    className="text-sm hover:underline"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
