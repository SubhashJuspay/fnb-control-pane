'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';
import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Sortable,
  useSortableItem,
} from '@repo/ui';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveMenuSectionDocument,
  ReorderMenuSectionItemsDocument,
  UpdateMenuSectionDocument,
  type LocationMenuQuery,
} from '@/lib/graphql/generated/graphql';
import { MenuSectionItemRow } from './menu-section-item-row';
import { MenuItemPicker } from './menu-item-picker';

type SectionRow = NonNullable<NonNullable<NonNullable<LocationMenuQuery['locationMenu']>['sections']>[number]>;
type SectionItem = NonNullable<NonNullable<SectionRow['items']>[number]>;

interface MenuSectionCardProps {
  section: SectionRow;
  onChanged: () => void;
}

const NAME_DEBOUNCE_MS = 600;

export function MenuSectionCard({ section, onChanged }: MenuSectionCardProps): React.JSX.Element {
  const id = section.id ?? '';
  const { ref, attributes, listeners, style } = useSortableItem(id);
  const [, updateSection] = useMutation(UpdateMenuSectionDocument);
  const [, archiveSection] = useMutation(ArchiveMenuSectionDocument);
  const [, reorderItems] = useMutation(ReorderMenuSectionItemsDocument);
  const [name, setName] = useState(section.name ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (section.name && section.name !== name) {
      setName(section.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.name]);

  const items: SectionItem[] = (section.items ?? []).filter(
    (i): i is SectionItem => i != null && Boolean(i.id) && !i.archivedAt,
  );
  const itemIds = items.map((i) => i.id ?? '');

  const onNameChange = (next: string): void => {
    setName(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next.trim()) return;
    debounceRef.current = setTimeout(async () => {
      const result = await updateSection({ input: { id, name: next.trim() } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    }, NAME_DEBOUNCE_MS);
  };

  const onArchive = async (): Promise<void> => {
    const result = await archiveSection({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Section archived');
    onChanged();
  };

  const onReorderItems = async (orderedIds: string[]): Promise<void> => {
    const result = await reorderItems({ input: { menuSectionId: id, orderedIds } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    onChanged();
  };

  const excludeIds = items
    .map((i) => i.menuItem?.id)
    .filter((x): x is string => Boolean(x));

  return (
    <li ref={ref} style={style} className="list-none">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-label={`Reorder ${section.name ?? ''}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Input
              aria-label="Section name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="font-semibold flex-1"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Section actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                  Archive section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No items in this section yet.
            </p>
          ) : (
            <Sortable items={itemIds} onReorder={onReorderItems}>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <MenuSectionItemRow key={item.id ?? ''} item={item} onChanged={onChanged} />
                ))}
              </ul>
            </Sortable>
          )}

          <MenuItemPicker
            menuSectionId={id}
            excludeIds={excludeIds}
            onAdded={onChanged}
            placeholder="Add an item to this section…"
          />
        </CardContent>
      </Card>
    </li>
  );
}
