'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui';

interface AdminNavProps {
  tenantSlug: string;
}

interface NavTab {
  href: (slug: string) => string;
  label: string;
  matches: (path: string, slug: string) => boolean;
}

const TABS: NavTab[] = [
  {
    href: (slug) => `/${slug}/admin/members`,
    label: 'Members',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/members`),
  },
  {
    href: (slug) => `/${slug}/admin/locations`,
    label: 'Locations',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/locations`),
  },
  {
    href: (slug) => `/${slug}/admin/catalog`,
    label: 'Catalog',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/catalog`),
  },
  {
    href: (slug) => `/${slug}/admin/audit-log`,
    label: 'Audit log',
    matches: (path, slug) => path.startsWith(`/${slug}/admin/audit-log`),
  },
];

/**
 * Tab strip across the top of the admin section. Active state is derived
 * from `usePathname()` so it stays correct after client-side navigation.
 */
export function AdminNav({ tenantSlug }: AdminNavProps): React.JSX.Element {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Admin sections" className="border-b">
      <ul className="flex gap-2 -mb-px">
        {TABS.map((tab) => {
          const active = tab.matches(pathname, tenantSlug);
          return (
            <li key={tab.label}>
              <Link
                href={tab.href(tenantSlug)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center px-4 text-sm font-medium border-b-2 transition-colors',
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
