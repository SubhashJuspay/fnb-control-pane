'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, Search } from 'lucide-react';
import { PublicMenuItemTile } from './public-menu-item-tile';
import type { PublicMenuItem } from './public-modifier-picker';

export interface PublicMenuSection {
  id?: string | null;
  name?: string | null;
  items?: (PublicMenuItem | null)[] | null;
}

export interface PublicMenu {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  sections?: (PublicMenuSection | null)[] | null;
}

export interface PublicMenuListProps {
  menus: (PublicMenu | null)[];
  currency: string;
}

/** Sentinel for the "show every section" filter. */
const ALL_SECTIONS = '__all__';

export function PublicMenuList({ menus, currency }: PublicMenuListProps): React.JSX.Element {
  const cleanMenus = menus.filter((m): m is PublicMenu => m != null);
  const [activeId, setActiveId] = useState<string>(() => cleanMenus[0]?.id ?? '');
  const [activeSectionId, setActiveSectionId] = useState<string>(ALL_SECTIONS);
  const [search, setSearch] = useState<string>('');

  const active = cleanMenus.find((m) => m.id === activeId) ?? cleanMenus[0];
  const activeSections = (active?.sections ?? []).filter(
    (s): s is PublicMenuSection => s != null,
  );
  const sectionsWithItems = activeSections
    .map((s) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      items: (s.items ?? []).filter((i): i is PublicMenuItem => i != null),
    }))
    .filter((s) => s.items.length > 0);

  const searchQuery = search.trim().toLowerCase();
  const totalItemCount = sectionsWithItems.reduce((sum, s) => sum + s.items.length, 0);

  // Apply category + search filters. Search runs across every section even
  // if a single category is selected — typing in the search box should never
  // miss results just because the wrong category is active. Must run on every
  // render (not after an early return) to keep hook order stable.
  const visibleSections = useMemo(() => {
    const byCategory =
      activeSectionId === ALL_SECTIONS
        ? sectionsWithItems
        : sectionsWithItems.filter((s) => s.id === activeSectionId);
    if (!searchQuery) return byCategory;
    const matched = sectionsWithItems
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => (i.name ?? '').toLowerCase().includes(searchQuery)),
      }))
      .filter((s) => s.items.length > 0);
    return matched;
  }, [sectionsWithItems, activeSectionId, searchQuery]);

  if (cleanMenus.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-6 py-10 text-center"
        data-testid="public-menu-list-empty"
      >
        <p className="text-sm font-medium">Nothing on the menu right now</p>
        <p className="text-xs text-muted-foreground">
          We&apos;re between services. Please check back during opening hours.
        </p>
      </div>
    );
  }

  const inSearchMode = searchQuery.length > 0;
  const noResults = visibleSections.length === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="public-menu-list">
      {cleanMenus.length > 1 ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Menus"
          data-testid="public-menu-tabs"
        >
          {cleanMenus.map((m) => {
            const isActive = m.id === active?.id;
            return (
              <button
                key={m.id ?? ''}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(m.id ?? '')}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted/40',
                ].join(' ')}
                data-testid={`public-menu-tab-${m.name}`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {active?.description ? (
        <p className="text-sm text-muted-foreground">{active.description}</p>
      ) : null}

      {/* Search bar — full-width above the two-pane layout. Filtering across
          every category, so the user never has to pick the right tab before
          typing. */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the menu…"
          aria-label="Search menu"
          data-testid="public-menu-search"
          className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        {/* Left sidebar — Clover-style filter. "All items" + each section.
            Click to filter; the right pane swaps to that category. On mobile
            it collapses to a horizontal pill strip. */}
        {sectionsWithItems.length > 1 ? (
          <nav
            aria-label="Menu sections"
            data-testid="public-menu-section-nav"
            className="md:sticky md:top-[72px] md:w-60 md:shrink-0 lg:w-64"
          >
            {/* Mobile pills */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
              <SectionPill
                label="All items"
                count={totalItemCount}
                active={activeSectionId === ALL_SECTIONS}
                onClick={() => setActiveSectionId(ALL_SECTIONS)}
              />
              {sectionsWithItems.map((s) => (
                <SectionPill
                  key={s.id}
                  label={s.name}
                  count={s.items.length}
                  active={activeSectionId === s.id}
                  onClick={() => setActiveSectionId(s.id)}
                />
              ))}
            </div>
            {/* Desktop vertical list — kiosk-friendly tap targets */}
            <ul className="hidden flex-col gap-1.5 md:flex">
              <SectionRow
                label="All items"
                count={totalItemCount}
                icon={<LayoutGrid className="size-4" aria-hidden />}
                active={activeSectionId === ALL_SECTIONS}
                onClick={() => setActiveSectionId(ALL_SECTIONS)}
              />
              {sectionsWithItems.map((s) => (
                <SectionRow
                  key={s.id}
                  label={s.name}
                  count={s.items.length}
                  active={activeSectionId === s.id}
                  onClick={() => setActiveSectionId(s.id)}
                />
              ))}
            </ul>
          </nav>
        ) : null}

        {/* Right pane: section grids OR search results */}
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          {inSearchMode ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {noResults
                ? `No items match “${searchQuery}”.`
                : `Showing matches for “${searchQuery}”.`}
            </p>
          ) : null}
          {noResults && !inSearchMode ? (
            <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No items in this section.
            </p>
          ) : null}
          {visibleSections.map((section) => (
            <section
              key={section.id}
              id={`section-${section.id}`}
              className="flex scroll-mt-32 flex-col gap-3"
            >
              <h3 className="text-lg font-semibold">{section.name}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <PublicMenuItemTile key={item.id ?? ''} item={item} currency={currency} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SectionRowProps {
  label: string;
  count: number;
  active: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}

function SectionRow({ label, active, icon, onClick }: SectionRowProps): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={[
          // Kiosk-friendly tap target: ~72px tall, large text, full-width row.
          // Active state uses both a left accent bar and a tinted background
          // so it's readable across all theme variants.
          'group relative flex min-h-[72px] w-full items-center gap-3 overflow-hidden rounded-lg pl-6 pr-4 py-4 text-left text-lg font-semibold transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'absolute inset-y-3 left-1 w-1 rounded-full transition-opacity',
            active ? 'bg-primary opacity-100' : 'bg-primary opacity-0 group-hover:opacity-30',
          ].join(' ')}
        />
        {icon ? <span className="text-current [&_svg]:size-5">{icon}</span> : null}
        <span>{label}</span>
      </button>
    </li>
  );
}

interface SectionPillProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function SectionPill({ label, active, onClick }: SectionPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex shrink-0 items-center rounded-full border px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
