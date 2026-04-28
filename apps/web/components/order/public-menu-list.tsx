'use client';

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

export function PublicMenuList({ menus, currency }: PublicMenuListProps): React.JSX.Element {
  const cleanMenus = menus.filter((m): m is PublicMenu => m != null);
  if (cleanMenus.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No menus are currently active. Please check back during opening hours.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6" data-testid="public-menu-list">
      {cleanMenus.map((menu) => {
        const sections = (menu.sections ?? []).filter(
          (s): s is PublicMenuSection => s != null,
        );
        return (
          <section key={menu.id ?? ''} className="flex flex-col gap-3">
            <header>
              <h2 className="text-lg font-semibold">{menu.name}</h2>
              {menu.description ? (
                <p className="text-sm text-muted-foreground">{menu.description}</p>
              ) : null}
            </header>
            {sections.map((section) => {
              const items = (section.items ?? []).filter(
                (i): i is PublicMenuItem => i != null,
              );
              if (items.length === 0) return null;
              return (
                <div key={section.id ?? ''} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.name}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {items.map((item) => (
                      <PublicMenuItemTile key={item.id ?? ''} item={item} currency={currency} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
