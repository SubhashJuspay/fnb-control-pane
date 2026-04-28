'use client';

import { useState } from 'react';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { Button } from '@repo/ui';
import {
  CreateTableDocument,
  TableShape,
} from '@/lib/graphql/generated/graphql';

interface PalettePreset {
  id: string;
  label: string;
  capacity: number;
  shape: 'RECT' | 'CIRCLE';
  width: number;
  height: number;
}

const PRESETS: PalettePreset[] = [
  { id: '2-rect', label: '2-top rect', capacity: 2, shape: 'RECT', width: 60, height: 60 },
  { id: '4-rect', label: '4-top rect', capacity: 4, shape: 'RECT', width: 80, height: 80 },
  { id: '6-circle', label: '6-top circle', capacity: 6, shape: 'CIRCLE', width: 100, height: 100 },
  { id: '8-circle', label: '8-top circle', capacity: 8, shape: 'CIRCLE', width: 120, height: 120 },
];

interface AddTablePaletteProps {
  defaultSectionId: string | null;
  /** Used to compute a non-overlapping default position. */
  existingTableCount: number;
  onAdded: () => void;
}

export function AddTablePalette({
  defaultSectionId,
  existingTableCount,
  onAdded,
}: AddTablePaletteProps): React.JSX.Element {
  const [, createTable] = useMutation(CreateTableDocument);
  const [busy, setBusy] = useState(false);

  const handleAdd = async (preset: PalettePreset) => {
    setBusy(true);
    try {
      // Stagger new tables in a 4-column grid so each click adds a visibly
      // distinct table rather than overlapping the last one. 8px-aligned.
      const col = existingTableCount % 4;
      const row = Math.floor(existingTableCount / 4);
      const positionX = 40 + col * 160;
      const positionY = 40 + row * 160;
      // Generate a unique label with a random suffix; the user can rename.
      const label = `${preset.label.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
      const result = await createTable({
        input: {
          label,
          capacity: preset.capacity,
          shape:
            preset.shape === 'CIRCLE' ? TableShape.Circle : TableShape.Rect,
          positionX,
          positionY,
          width: preset.width,
          height: preset.height,
          sectionId: defaultSectionId,
        },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-add-table-palette>
      <h2 className="text-sm font-semibold">Add table</h2>
      <div className="flex flex-col gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            onClick={() => handleAdd(p)}
            disabled={busy}
            size="sm"
            variant="outline"
            data-preset={p.id}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
