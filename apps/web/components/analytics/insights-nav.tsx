'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui';

interface InsightsNavProps {
  tenantSlug: string;
  locationSlug: string;
}

const TABS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'sales', label: 'Sales' },
  { slug: 'items', label: 'Items' },
  { slug: 'hours', label: 'Hours' },
  { slug: 'servers', label: 'Servers' },
  { slug: 'labor', label: 'Labor' },
  { slug: 'guests', label: 'Guests' },
];

export function InsightsNav({
  tenantSlug,
  locationSlug,
}: InsightsNavProps): React.JSX.Element {
  const pathname = usePathname() ?? '';
  const base = `/${tenantSlug}/${locationSlug}/insights`;

  return (
    <nav
      className="flex flex-wrap gap-1 border-b"
      aria-label="Insights"
      data-testid="insights-nav"
    >
      {TABS.map((tab) => {
        const href = `${base}/${tab.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
