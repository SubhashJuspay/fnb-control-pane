import * as React from 'react';
import { cn } from '../lib/cn.js';
import {
  TABLE_STATE_FILLS,
  TableTile,
  type TableTileShape,
  type TableTileState,
} from './table-tile.js';

export interface FloorCanvasTable {
  id: string;
  label: string;
  capacity: number;
  shape: TableTileShape;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  state: TableTileState;
}

export interface FloorCanvasProps {
  tables: FloorCanvasTable[];
  /** "view" renders read-only. "edit" wires up pointer-down for drag. */
  mode?: 'view' | 'edit';
  width?: number;
  height?: number;
  selectedTableId?: string | null;
  onTableClick?: (id: string) => void;
  /**
   * Edit-mode hook: invoked on pointer-down on a tile. The caller is expected
   * to attach `pointermove` / `pointerup` listeners to `window` and translate
   * the new coordinates to a UpdateTable mutation.
   */
  onTablePointerDown?: (
    id: string,
    ev: React.PointerEvent<SVGGElement>,
  ) => void;
  /** Click handler for empty canvas (e.g. deselect in editor). */
  onCanvasClick?: () => void;
  className?: string;
}

const GRID_SIZE = 8;

/**
 * Background grid pattern + per-table SVG rendering. Coordinates are integer
 * pixels. View mode renders click-only tiles; edit mode wires pointer-down so
 * the consumer can implement drag-to-position.
 */
export function FloorCanvas({
  tables,
  mode = 'view',
  width = 1200,
  height = 800,
  selectedTableId = null,
  onTableClick,
  onTablePointerDown,
  onCanvasClick,
  className,
}: FloorCanvasProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative w-full overflow-auto rounded-md border bg-muted/30',
        className,
      )}
    >
      <svg
        data-floor-canvas
        data-mode={mode}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
        onClick={onCanvasClick}
      >
        <defs>
          <pattern
            id="floor-grid"
            width={GRID_SIZE * 4}
            height={GRID_SIZE * 4}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID_SIZE * 4} 0 L 0 0 0 ${GRID_SIZE * 4}`}
              fill="none"
              stroke="rgb(229 231 235)"
              strokeWidth={0.5}
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#floor-grid)" />
        {tables.map((t) => (
          <TableTile
            key={t.id}
            id={t.id}
            label={t.label}
            capacity={t.capacity}
            shape={t.shape}
            positionX={t.positionX}
            positionY={t.positionY}
            width={t.width}
            height={t.height}
            rotation={t.rotation}
            state={t.state}
            selected={selectedTableId === t.id}
            onClick={mode === 'view' || mode === 'edit' ? onTableClick : undefined}
            onPointerDown={mode === 'edit' ? onTablePointerDown : undefined}
          />
        ))}
      </svg>
    </div>
  );
}

/** Snap an integer coordinate to the nearest 8px grid line (>= 0). */
export function snapToGrid(coord: number, gridSize: number = GRID_SIZE): number {
  if (coord <= 0) return 0;
  return Math.round(coord / gridSize) * gridSize;
}

/** Re-export the palette so callers (legend) can read the same colors. */
export { TABLE_STATE_FILLS };
