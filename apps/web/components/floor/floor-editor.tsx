'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'urql';
import { toast } from 'sonner';
import { Button, FloorCanvas, type FloorCanvasTable, snapToGrid } from '@repo/ui';
import {
  FloorSectionsDocument,
  FloorTablesDocument,
  UpdateTableDocument,
  type FloorTablesQuery,
  type FloorSectionsQuery,
  type TableShape as GqlTableShape,
} from '@/lib/graphql/generated/graphql';
import { AddTablePalette } from './add-table-palette';
import { SectionList } from './section-list';
import { TableInspector, type InspectorTable } from './table-inspector';

type FloorTableNode = NonNullable<NonNullable<FloorTablesQuery['floorTables']>[number]>;
type SectionNode = NonNullable<NonNullable<FloorSectionsQuery['floorSections']>[number]>;

interface FloorEditorProps {
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
}

interface DragState {
  tableId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

const DEBOUNCE_MS = 300;

/**
 * Floor plan editor. Drag tables on the SVG canvas via plain pointer events
 * (snap to 8px grid, debounced UpdateTable mutation on drop). Right sidebar
 * inspects + edits the selected table; left sidebar manages sections and an
 * add-table palette.
 */
export function FloorEditor({
  tenantSlug,
  locationSlug,
  locationName,
}: FloorEditorProps): React.JSX.Element {
  const [{ data: tablesData }, refetchTables] = useQuery({
    query: FloorTablesDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: sectionsData }, refetchSections] = useQuery({
    query: FloorSectionsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [, updateTable] = useMutation(UpdateTableDocument);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePositionRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Local override map used while dragging — repaints from this so the
  // canvas mirrors the live drag without round-tripping through the server.
  const [localOverrides, setLocalOverrides] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());

  const allTables: FloorTableNode[] = useMemo(
    () =>
      (tablesData?.floorTables ?? []).filter(
        (t): t is FloorTableNode => t !== null,
      ),
    [tablesData?.floorTables],
  );

  const sections: SectionNode[] = useMemo(
    () =>
      (sectionsData?.floorSections ?? []).filter(
        (s): s is SectionNode => s !== null,
      ),
    [sectionsData?.floorSections],
  );

  const filteredTables = useMemo(() => {
    if (selectedSectionId === null) return allTables;
    return allTables.filter((t) => (t.section?.id ?? null) === selectedSectionId);
  }, [allTables, selectedSectionId]);

  const canvasTables: FloorCanvasTable[] = useMemo(
    () =>
      filteredTables.map((t) => {
        const id = t.id ?? '';
        const override = localOverrides.get(id);
        return {
          id,
          label: t.label ?? '',
          capacity: t.capacity ?? 2,
          shape: (t.shape ?? 'RECT') as GqlTableShape as 'RECT' | 'CIRCLE',
          positionX: override?.x ?? t.positionX ?? 0,
          positionY: override?.y ?? t.positionY ?? 0,
          width: t.width ?? 80,
          height: t.height ?? 80,
          rotation: t.rotation ?? 0,
          // In the editor we don't tint by live state — show all as
          // AVAILABLE for the layout view. (State derivation is live-floor
          // concern; the editor should let the manager focus on geometry.)
          state: 'AVAILABLE',
        };
      }),
    [filteredTables, localOverrides],
  );

  const selectedTable: InspectorTable | null = useMemo(() => {
    if (!selectedTableId) return null;
    const t = allTables.find((tt) => tt.id === selectedTableId);
    if (!t) return null;
    return {
      id: t.id ?? '',
      label: t.label ?? '',
      capacity: t.capacity ?? 2,
      shape: (t.shape ?? 'RECT') as GqlTableShape as 'RECT' | 'CIRCLE',
      width: t.width ?? 80,
      height: t.height ?? 80,
      rotation: t.rotation ?? 0,
      sectionId: t.section?.id ?? null,
    };
  }, [selectedTableId, allTables]);

  const flushUpdate = useCallback(
    (tableId: string) => {
      const pos = livePositionRef.current.get(tableId);
      if (!pos) return;
      const result = updateTable({
        input: { id: tableId, positionX: pos.x, positionY: pos.y },
      });
      void result.then((r) => {
        if (r.error) toast.error(r.error.message);
      });
    },
    [updateTable],
  );

  const handleTablePointerDown = useCallback(
    (id: string, ev: React.PointerEvent<SVGGElement>) => {
      const target = allTables.find((t) => t.id === id);
      if (!target) return;
      setSelectedTableId(id);
      dragStateRef.current = {
        tableId: id,
        startX: ev.clientX,
        startY: ev.clientY,
        origX: target.positionX ?? 0,
        origY: target.positionY ?? 0,
      };
      ev.preventDefault();

      const onMove = (mv: PointerEvent) => {
        const ds = dragStateRef.current;
        if (!ds) return;
        const dx = mv.clientX - ds.startX;
        const dy = mv.clientY - ds.startY;
        const nextX = snapToGrid(Math.max(0, ds.origX + dx));
        const nextY = snapToGrid(Math.max(0, ds.origY + dy));
        livePositionRef.current.set(ds.tableId, { x: nextX, y: nextY });
        setLocalOverrides((prev) => {
          const next = new Map(prev);
          next.set(ds.tableId, { x: nextX, y: nextY });
          return next;
        });
      };
      const onUp = () => {
        const ds = dragStateRef.current;
        dragStateRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!ds) return;
        // Debounce the mutation by DEBOUNCE_MS — if another drag starts on
        // the same table within the window, only the latest fires.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          flushUpdate(ds.tableId);
          // Refetch once the server confirms; clear the override.
          refetchTables({ requestPolicy: 'network-only' });
          setLocalOverrides((prev) => {
            const next = new Map(prev);
            next.delete(ds.tableId);
            return next;
          });
          livePositionRef.current.delete(ds.tableId);
        }, DEBOUNCE_MS);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [allTables, flushUpdate, refetchTables],
  );

  // Cleanup any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onSectionsChanged = useCallback(() => {
    refetchSections({ requestPolicy: 'network-only' });
  }, [refetchSections]);

  const onTablesChanged = useCallback(() => {
    refetchTables({ requestPolicy: 'network-only' });
  }, [refetchTables]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-surface px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">{locationName} · Floor editor</h1>
          <p className="text-xs text-muted-foreground">
            Drag a table to reposition (8px grid). Edits autosave.
          </p>
        </div>
        <Link href={`/${tenantSlug}/${locationSlug}/floor`}>
          <Button variant="outline" size="sm">
            Back to live floor
          </Button>
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-64 flex-col gap-6 border-r bg-muted/20 p-3 text-sm overflow-y-auto">
          <SectionList
            sections={sections.map((s) => ({
              id: s.id ?? '',
              name: s.name ?? '',
            }))}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onChanged={onSectionsChanged}
          />
          <AddTablePalette
            defaultSectionId={selectedSectionId}
            existingTableCount={allTables.length}
            onAdded={onTablesChanged}
          />
        </aside>

        <main className="flex-1 overflow-auto p-4">
          <FloorCanvas
            tables={canvasTables}
            mode="edit"
            selectedTableId={selectedTableId}
            onTableClick={setSelectedTableId}
            onTablePointerDown={handleTablePointerDown}
            onCanvasClick={() => setSelectedTableId(null)}
          />
        </main>

        <aside className="flex w-64 flex-col gap-3 border-l bg-muted/20 p-3 text-sm overflow-y-auto">
          {selectedTable ? (
            <TableInspector
              key={selectedTable.id}
              table={selectedTable}
              sections={sections.map((s) => ({
                id: s.id ?? '',
                name: s.name ?? '',
              }))}
              onChanged={onTablesChanged}
              onArchived={() => {
                setSelectedTableId(null);
                onTablesChanged();
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Click a table to edit its properties.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
