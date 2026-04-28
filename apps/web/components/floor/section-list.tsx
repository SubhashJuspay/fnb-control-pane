'use client';

import { useState } from 'react';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { Button, Input, Sortable, useSortableItem } from '@repo/ui';
import {
  ArchiveSectionDocument,
  CreateSectionDocument,
  ReorderSectionsDocument,
} from '@/lib/graphql/generated/graphql';

export interface SectionListItem {
  id: string;
  name: string;
}

interface SectionListProps {
  sections: SectionListItem[];
  selectedSectionId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}

export function SectionList({
  sections,
  selectedSectionId,
  onSelect,
  onChanged,
}: SectionListProps): React.JSX.Element {
  const [, createSection] = useMutation(CreateSectionDocument);
  const [, archiveSection] = useMutation(ArchiveSectionDocument);
  const [, reorderSections] = useMutation(ReorderSectionsDocument);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const result = await createSection({ input: { name: trimmed, sortOrder: sections.length } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      setName('');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (id: string) => {
    setBusy(true);
    try {
      const result = await archiveSection({ input: { id } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      if (selectedSectionId === id) onSelect(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    setBusy(true);
    try {
      const result = await reorderSections({ input: { orderedIds } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Sections</h2>
      <ul className="flex flex-col gap-1">
        <li>
          <button
            type="button"
            data-section="ALL"
            onClick={() => onSelect(null)}
            className={`w-full rounded-md border px-2 py-1 text-left text-xs ${
              selectedSectionId === null ? 'border-primary bg-primary/10' : 'bg-background'
            }`}
          >
            All sections
          </button>
        </li>
      </ul>
      <Sortable
        items={sections.map((s) => s.id)}
        onReorder={handleReorder}
      >
        <ul className="flex flex-col gap-1">
          {sections.map((s) => (
            <SectionRow
              key={s.id}
              id={s.id}
              name={s.name}
              selected={selectedSectionId === s.id}
              busy={busy}
              onSelect={() => onSelect(s.id)}
              onArchive={() => handleArchive(s.id)}
            />
          ))}
        </ul>
      </Sortable>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Section name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-input="new-section-name"
        />
        <Button onClick={handleAdd} disabled={busy || !name.trim()} size="sm">
          Add
        </Button>
      </div>
    </div>
  );
}

interface SectionRowProps {
  id: string;
  name: string;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onArchive: () => void;
}

function SectionRow({ id, name, selected, busy, onSelect, onArchive }: SectionRowProps): React.JSX.Element {
  const { ref, attributes, listeners, style } = useSortableItem(id);
  return (
    <li
      ref={ref}
      style={style}
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs ${
        selected ? 'border-primary bg-primary/10' : 'bg-background'
      }`}
    >
      <button
        type="button"
        data-drag-handle
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        className="flex-1 text-left"
        onClick={onSelect}
        data-section-name
      >
        {name}
      </button>
      <button
        type="button"
        onClick={onArchive}
        disabled={busy}
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Archive ${name}`}
      >
        ✕
      </button>
    </li>
  );
}
