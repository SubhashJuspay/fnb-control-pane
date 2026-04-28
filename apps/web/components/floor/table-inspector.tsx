'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { Button, Input } from '@repo/ui';
import {
  ArchiveTableDocument,
  TableShape,
  UpdateTableDocument,
} from '@/lib/graphql/generated/graphql';

export interface InspectorTable {
  id: string;
  label: string;
  capacity: number;
  shape: 'RECT' | 'CIRCLE';
  width: number;
  height: number;
  rotation: number;
  sectionId: string | null;
}

interface TableInspectorProps {
  table: InspectorTable;
  sections: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onArchived: () => void;
}

export function TableInspector({
  table,
  sections,
  onChanged,
  onArchived,
}: TableInspectorProps): React.JSX.Element {
  const [, updateTable] = useMutation(UpdateTableDocument);
  const [, archiveTable] = useMutation(ArchiveTableDocument);
  const [draft, setDraft] = useState<InspectorTable>(table);
  const [busy, setBusy] = useState(false);

  // Keep the draft in sync when a different table is selected.
  useEffect(() => {
    setDraft(table);
  }, [table.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setBusy(true);
    try {
      const result = await updateTable({
        input: {
          id: draft.id,
          label: draft.label,
          capacity: draft.capacity,
          shape: draft.shape === 'CIRCLE' ? TableShape.Circle : TableShape.Rect,
          width: draft.width,
          height: draft.height,
          rotation: draft.rotation,
          sectionId: draft.sectionId,
        },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      const result = await archiveTable({ input: { id: draft.id } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onArchived();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-table-inspector data-table-id={draft.id}>
      <h2 className="text-sm font-semibold">Selected: {table.label}</h2>
      <label className="flex flex-col gap-1 text-xs">
        Label
        <Input
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          data-input="label"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Capacity
        <Input
          type="number"
          value={draft.capacity}
          onChange={(e) =>
            setDraft((d) => ({ ...d, capacity: Number(e.target.value) || 1 }))
          }
          data-input="capacity"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Shape
        <select
          value={draft.shape}
          onChange={(e) =>
            setDraft((d) => ({ ...d, shape: e.target.value as 'RECT' | 'CIRCLE' }))
          }
          data-input="shape"
          className="rounded-md border bg-background px-2 py-1"
        >
          <option value="RECT">Rectangle</option>
          <option value="CIRCLE">Circle</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Width
          <Input
            type="number"
            value={draft.width}
            onChange={(e) =>
              setDraft((d) => ({ ...d, width: Number(e.target.value) || 20 }))
            }
            data-input="width"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Height
          <Input
            type="number"
            value={draft.height}
            onChange={(e) =>
              setDraft((d) => ({ ...d, height: Number(e.target.value) || 20 }))
            }
            data-input="height"
          />
        </label>
      </div>
      <fieldset className="flex flex-col gap-1 text-xs">
        <legend>Rotation</legend>
        <div className="flex gap-1">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, rotation: deg }))}
              className={`rounded-md border px-2 py-1 ${
                draft.rotation === deg ? 'border-primary bg-primary/10' : 'bg-background'
              }`}
              data-rotation={deg}
            >
              {deg}°
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-xs">
        Section
        <select
          value={draft.sectionId ?? ''}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              sectionId: e.target.value === '' ? null : e.target.value,
            }))
          }
          data-input="section"
          className="rounded-md border bg-background px-2 py-1"
        >
          <option value="">None</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2">
        <Button onClick={handleSave} disabled={busy} size="sm" data-action="save">
          Save
        </Button>
        <Button
          onClick={handleArchive}
          disabled={busy}
          variant="destructive"
          size="sm"
          data-action="archive"
        >
          Archive
        </Button>
      </div>
    </div>
  );
}
