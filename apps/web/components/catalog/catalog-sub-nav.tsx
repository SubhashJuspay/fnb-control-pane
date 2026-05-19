'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui';

interface CatalogSubNavProps {
  tenantSlug: string;
  /**
   * Base URL the sub-tabs link under. Catalog can be reached two ways:
   *   - `/[tenant]/admin/catalog/*` (tenant-admin entry)
   *   - `/[tenant]/[loc]/catalog/*` (per-store Setup entry)
   * Pass the appropriate base so the active-tab match logic uses the
   * route the user actually came in through.
   */
  basePath: string;
}

interface Tab {
  slug: 'items' | 'modifiers' | 'categories' | 'taxes';
  label: string;
}

const TABS: Tab[] = [
  { slug: 'items', label: 'Items' },
  { slug: 'modifiers', label: 'Modifiers' },
  { slug: 'categories', label: 'Categories' },
  { slug: 'taxes', label: 'Taxes' },
];

/**
 * Sub-tab strip for the catalog section. Lives under either the admin or
 * the per-location route — see [basePath].
 */
export function CatalogSubNav({
  basePath,
}: CatalogSubNavProps): React.JSX.Element {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Catalog sections" className="border-b">
      <ul className="flex gap-2 -mb-px">
        {TABS.map((tab) => {
          const href = `${basePath}/${tab.slug}`;
          const active = pathname.startsWith(href);
          return (
            <li key={tab.label}>
              <Link
                href={href}
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
