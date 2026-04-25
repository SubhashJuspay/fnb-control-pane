'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';
import { Button, Input, MoneyInput, useSortableItem } from '@repo/ui';
import { GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveModifierDocument,
  UpdateModifierDocument,
} from '@/lib/graphql/generated/graphql';

export interface ModifierRowData {
  id: string;
  name: string;
  priceDeltaCents: number;
  isDefault: boolean;
}

interface ModifierRowProps {
  modifier: ModifierRowData;
  onChanged: () => void;
}

const DEBOUNCE_MS = 400;

/**
 * Inline-editable row for one modifier inside a group. Name and price-delta
 * commit on blur (or after a short debounce). The default toggle and archive
 * button commit immediately.
 */
export function ModifierRow({ modifier, onChanged }: ModifierRowProps): React.JSX.Element {
  const { ref, attributes, listeners, style } = useSortableItem(modifier.id);
  const [, updateModifier] = useMutation(UpdateModifierDocument);
  const [, archiveModifier] = useMutation(ArchiveModifierDocument);

  const [name, setName] = useState(modifier.name);
  const [priceDelta, setPriceDelta] = useState<number | null>(modifier.priceDeltaCents);
  const [isDefault, setIsDefault] = useState(modifier.isDefault);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from upstream when the parent refetches.
  useEffect(() => setName(modifier.name), [modifier.name]);
  useEffect(() => setPriceDelta(modifier.priceDeltaCents), [modifier.priceDeltaCents]);
  useEffect(() => setIsDefault(modifier.isDefault), [modifier.isDefault]);

  const commit = async (input: {
    name?: string;
    priceDeltaCents?: number;
    isDefault?: boolean;
  }): Promise<void> => {
    const result = await updateModifier({ input: { id: modifier.id, ...input } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    onChanged();
  };

  const scheduleCommit = (input: {
    name?: string;
    priceDeltaCents?: number;
    isDefault?: boolean;
  }): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void commit(input);
    }, DEBOUNCE_MS);
  };

  const onArchive = async (): Promise<void> => {
    const result = await archiveModifier({ input: { id: modifier.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Modifier removed');
    onChanged();
  };

  return (
    <li
      ref={ref}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-surface px-2 py-2"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${modifier.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        aria-label={`${modifier.name} name`}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          scheduleCommit({ name: e.target.value });
        }}
        className="flex-1"
      />
      <div className="w-28">
        <MoneyInput
          aria-label={`${modifier.name} price delta`}
          value={priceDelta}
          onChange={(cents) => {
            setPriceDelta(cents);
            scheduleCommit({ priceDeltaCents: cents ?? 0 });
          }}
        />
      </div>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => {
            setIsDefault(e.target.checked);
            void commit({ isDefault: e.target.checked });
          }}
        />
        Default
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${modifier.name}`}
        onClick={onArchive}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
