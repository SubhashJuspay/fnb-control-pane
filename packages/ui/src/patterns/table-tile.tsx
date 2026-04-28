import * as React from 'react';

export type TableTileState = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
export type TableTileShape = 'RECT' | 'CIRCLE';

/**
 * Map a derived table state to (fill, stroke, label-color) tokens. Kept as a
 * plain export so consumers (legend, action sheet) can read the same palette
 * without re-implementing the switch.
 */
export const TABLE_STATE_FILLS: Record<
  TableTileState,
  { fill: string; stroke: string; labelClass: string }
> = {
  AVAILABLE: {
    fill: 'rgb(220 252 231)', // emerald-100
    stroke: 'rgb(16 185 129)', // emerald-500
    labelClass: 'fill-emerald-900',
  },
  OCCUPIED: {
    fill: 'rgb(254 226 226)', // red-100
    stroke: 'rgb(239 68 68)', // red-500
    labelClass: 'fill-red-900',
  },
  RESERVED: {
    fill: 'rgb(254 243 199)', // amber-100
    stroke: 'rgb(245 158 11)', // amber-500
    labelClass: 'fill-amber-900',
  },
  CLEANING: {
    fill: 'rgb(229 231 235)', // gray-200
    stroke: 'rgb(107 114 128)', // gray-500
    labelClass: 'fill-gray-700',
  },
};

export interface TableTileProps {
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
  selected?: boolean;
  onClick?: (id: string) => void;
  /** When set, fires while the user drags the tile by its body. */
  onPointerDown?: (id: string, ev: React.PointerEvent<SVGGElement>) => void;
}

/**
 * Single SVG `<g>` for a Table on the floor canvas. Renders a rect or
 * ellipse colored by `state`, with the table label and capacity centered.
 * Rotates around its centerpoint. Clicking the body fires `onClick`.
 */
export const TableTile = React.forwardRef<SVGGElement, TableTileProps>(
  function TableTile(
    {
      id,
      label,
      capacity,
      shape,
      positionX,
      positionY,
      width,
      height,
      rotation,
      state,
      selected = false,
      onClick,
      onPointerDown,
    },
    ref,
  ) {
    const palette = TABLE_STATE_FILLS[state];
    const cx = positionX + width / 2;
    const cy = positionY + height / 2;
    const transform = rotation
      ? `rotate(${rotation} ${cx} ${cy})`
      : undefined;

    return (
      <g
        ref={ref}
        data-table-id={id}
        data-table-state={state}
        data-selected={selected ? 'true' : undefined}
        transform={transform}
        style={{
          cursor: onPointerDown ? 'grab' : onClick ? 'pointer' : 'default',
        }}
        onClick={
          onClick
            ? (ev) => {
                ev.stopPropagation();
                onClick(id);
              }
            : undefined
        }
        onPointerDown={
          onPointerDown
            ? (ev) => {
                onPointerDown(id, ev);
              }
            : undefined
        }
      >
        {shape === 'CIRCLE' ? (
          <ellipse
            cx={cx}
            cy={cy}
            rx={width / 2}
            ry={height / 2}
            fill={palette.fill}
            stroke={selected ? 'rgb(59 130 246)' : palette.stroke}
            strokeWidth={selected ? 3 : 2}
          />
        ) : (
          <rect
            x={positionX}
            y={positionY}
            width={width}
            height={height}
            rx={6}
            ry={6}
            fill={palette.fill}
            stroke={selected ? 'rgb(59 130 246)' : palette.stroke}
            strokeWidth={selected ? 3 : 2}
          />
        )}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className={palette.labelClass}
          fontSize={14}
          fontWeight={600}
        >
          {label}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          dominantBaseline="middle"
          className={palette.labelClass}
          fontSize={10}
          opacity={0.7}
        >
          {capacity} top
        </text>
      </g>
    );
  },
);
