'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui';

interface MenusSubNavProps {
  tenantSlug: string;
  locationSlug: string;
}

interface Tab {
  href: (tenant: string, location: string) => string;
  label: string;
  matches: (path: string, tenant: string, location: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: (t, l) => `/${t}/${l}/menus`,
    label: 'All menus',
    matches: (path, t, l) =>
      path === `/${t}/${l}/menus` || path.startsWith(`/${t}/${l}/menus/new`) || /\/menus\/[^/]+$/.test(path),
  },
  {
    href: (t, l) => `/${t}/${l}/menus/overrides`,
    label: 'Overrides',
    matches: (path, t, l) => path.startsWith(`/${t}/${l}/menus/overrides`),
  },
];

/**
 * Sub-tab strip beneath the "Menus" heading. Mirrors `CatalogSubNav`'s
 * minimalist look so the two surfaces stay visually consistent.
 */
export function MenusSubNav({
  tenantSlug,
  locationSlug,
}: MenusSubNavProps): React.JSX.Element {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Menu sections" className="border-b">
      <ul className="flex gap-2 -mb-px">
        {TABS.map((tab) => {
          const active = tab.matches(pathname, tenantSlug, locationSlug);
          return (
            <li key={tab.label}>
              <Link
                href={tab.href(tenantSlug, locationSlug)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center px-3 text-sm font-medium border-b-2 transition-colors',
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
