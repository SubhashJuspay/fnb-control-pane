'use client';

import { useMemo, useState } from 'react';
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
        className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center shadow-card-soft"
        data-testid="public-menu-list-empty"
      >
        <p className="text-body-staff font-semibold text-on-surface">
          Nothing on the menu right now
        </p>
        <p className="text-body-staff text-on-surface-variant">
          We&apos;re between services. Please check back during opening hours.
        </p>
      </div>
    );
  }

  const inSearchMode = searchQuery.length > 0;
  const noResults = visibleSections.length === 0;

  return (
    // Desktop+ (md): the entire menu chrome below the hero is rendered as
    // a "sticky scroll pane". The pane sits flush below the OrderShell
    // header stack (via the --shell-top CSS variable) and fills the
    // remaining viewport. The page itself scrolls naturally only until
    // the hero clears; after that the chrome is locked in place and the
    // item grid handles its own scroll internally. This keeps the menu
    // tabs, search box, and category sidebar permanently in view as the
    // customer browses, which matters most on long menus.
    //
    // Mobile (sm): keep the natural page-scroll layout. Internal-scroll
    // grids on small phones are awkward (no momentum, footer overlap)
    // and the category nav already collapses to horizontal chips at the
    // top, so the customer doesn't really lose the sidebar on scroll.
    <div
      className="flex flex-col gap-gutter md:sticky md:top-[var(--shell-top,64px)] md:flex md:h-[calc(100dvh-var(--shell-top,64px))] md:flex-col md:gap-stack-loose md:overflow-hidden"
      data-testid="public-menu-list"
    >
      <div className="flex flex-col gap-gutter md:shrink-0">
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
                    'rounded-full px-4 py-1.5 font-label-caps text-label-caps uppercase transition-colors',
                    isActive
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
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
          <p className="text-body-customer text-on-surface-variant">{active.description}</p>
        ) : null}

        <div className="relative">
          <span
            aria-hidden
            className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline"
          >
            search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu…"
            aria-label="Search menu"
            data-testid="public-menu-search"
            className="h-14 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-12 pr-4 text-body-customer text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Sidebar + grid row. On md+: flex-1 fills remaining height of the
          sticky pane, sidebar stays in flow, grid has its own scroll. */}
      <div className="flex flex-col gap-gutter md:min-h-0 md:flex-1 md:flex-row md:items-stretch">
        {sectionsWithItems.length > 1 ? (
          <aside
            aria-label="Menu sections"
            data-testid="public-menu-section-nav"
            className="md:w-[240px] md:shrink-0 md:overflow-y-auto"
          >
            <div className="no-scrollbar sticky top-[88px] flex flex-row gap-1 overflow-x-auto pb-2 md:static md:flex-col md:overflow-visible md:pb-0">
              <SectionButton
                label="All items"
                active={activeSectionId === ALL_SECTIONS}
                onClick={() => setActiveSectionId(ALL_SECTIONS)}
              />
              {sectionsWithItems.map((s) => (
                <SectionButton
                  key={s.id}
                  label={s.name}
                  active={activeSectionId === s.id}
                  onClick={() => setActiveSectionId(s.id)}
                />
              ))}
            </div>
          </aside>
        ) : null}

        {/* The grid pane: only this element scrolls inside the sticky
            chrome on md+. `min-w-0` lets the flex child shrink properly
            when the grid is wider than its track; `min-h-0` is the
            paired vertical version that allows `overflow-y-auto` to
            actually clip + scroll. Bottom padding leaves room for the
            sticky cart footer so the last row isn't hidden behind it. */}
        <div className="flex min-w-0 flex-1 flex-col gap-stack-loose md:min-h-0 md:overflow-y-auto md:pb-32 md:pr-1">
          {inSearchMode ? (
            <p
              className="text-body-staff text-on-surface-variant"
              aria-live="polite"
            >
              {noResults
                ? `No items match “${searchQuery}”.`
                : `Showing matches for “${searchQuery}”.`}
            </p>
          ) : null}
          {noResults && !inSearchMode ? (
            <p className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-6 text-center text-body-staff text-on-surface-variant">
              No items in this section.
            </p>
          ) : null}
          {visibleSections.map((section) => (
            <section
              key={section.id}
              id={`section-${section.id}`}
              className="flex scroll-mt-32 flex-col gap-3"
            >
              <h3 className="font-display text-headline-md font-semibold text-on-surface">
                {section.name}
              </h3>
              <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
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

interface SectionButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function SectionButton({ label, active, onClick }: SectionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex w-full min-w-[max-content] items-center gap-3 rounded-lg px-4 py-4 text-left text-body-customer transition-all md:min-h-[56px]',
        active
          ? 'border-l-4 border-on-primary bg-primary font-semibold text-on-primary'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
