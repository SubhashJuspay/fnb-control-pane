'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui';

interface CatalogSubNavProps {
  tenantSlug: string;
}

interface Tab {
  href: (slug: string) => string;
  label: string;
  matches: (path: string, slug: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: (slug) => `/${slug}/admin/catalog/items`,
    label: 'Items',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/catalog/items`),
  },
  {
    href: (slug) => `/${slug}/admin/catalog/modifiers`,
    label: 'Modifiers',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/catalog/modifiers`),
  },
  {
    href: (slug) => `/${slug}/admin/catalog/categories`,
    label: 'Categories',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/catalog/categories`),
  },
  {
    href: (slug) => `/${slug}/admin/catalog/taxes`,
    label: 'Taxes',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/catalog/taxes`),
  },
];

/**
 * Sub-tab strip for the catalog admin section. Mirrors the visual style of
 * AdminNav but lives one level deeper.
 */
export function CatalogSubNav({ tenantSlug }: CatalogSubNavProps): React.JSX.Element {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Catalog sections" className="border-b">
      <ul className="flex gap-2 -mb-px">
        {TABS.map((tab) => {
          const active = tab.matches(pathname, tenantSlug);
          return (
            <li key={tab.label}>
              <Link
                href={tab.href(tenantSlug)}
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
