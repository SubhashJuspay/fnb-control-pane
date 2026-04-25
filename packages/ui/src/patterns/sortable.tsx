'use client';

import * as React from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableProps {
  /** Stable row identifiers in their current order. */
  items: string[];
  /** Called with the new id list whenever the user drops to a new position. */
  onReorder: (orderedIds: string[]) => void;
  children: React.ReactNode;
}

/**
 * Minimal vertical-list sortable wrapper. Owns the dnd-kit context and
 * sensors so callers only have to think about ids in/ids out.
 *
 * Children must each call `useSortableItem(id)` and spread the returned
 * `attributes` + `listeners` onto the row (or a drag handle inside the row),
 * and apply `transform` + `transition` to the outer element.
 */
export function Sortable({ items, onReorder, children }: SortableProps): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export interface SortableItemBindings {
  ref: (node: HTMLElement | null) => void;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
  /** Inline style fragment to apply to the sortable element. */
  style: React.CSSProperties;
  isDragging: boolean;
}

/**
 * Per-row hook companion to <Sortable>. Returns the bindings the row should
 * spread; the `listeners` should usually go on a drag handle (button) so the
 * rest of the row remains interactive.
 */
export function useSortableItem(id: string): SortableItemBindings {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return {
    ref: setNodeRef,
    attributes,
    listeners,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
    },
    isDragging,
  };
}
