'use client';

interface CategoryTab {
  id: string | null;
  name: string;
  count: number;
}

interface CategoryTabsProps {
  tabs: CategoryTab[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Horizontal scroll strip of category filters above the menu tile grid.
 * `id === null` is the synthetic "All" tab; otherwise the id matches a
 * `Category.id` from the catalog.
 */
export function CategoryTabs({ tabs, activeId, onSelect }: CategoryTabsProps): React.JSX.Element {
  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto border-b bg-surface px-3 py-2">
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id ?? 'all'}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-pressed={isActive}
            className={[
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            ].join(' ')}
          >
            {tab.name}
            <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
