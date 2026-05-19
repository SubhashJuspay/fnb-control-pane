'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@repo/ui';
import type { AppShellTenant } from '@/lib/viewer';

/**
 * Role hierarchy used for nav visibility. Members in this app:
 *   OWNER > ADMIN > MANAGER > STAFF > VIEWER
 */
const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  STAFF: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};
function roleAtLeast(actual: string | null | undefined, min: string): boolean {
  return (ROLE_RANK[actual ?? ''] ?? -1) >= (ROLE_RANK[min] ?? 0);
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  matches: (pathname: string) => boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface SidebarProps {
  tenants: AppShellTenant[];
}

export function Sidebar({ tenants }: SidebarProps) {
  const pathname = usePathname() ?? '/';
  const params = useParams<{ tenantSlug?: string; locationSlug?: string }>();
  const tenantSlug = params?.tenantSlug ?? null;
  const locationSlug = params?.locationSlug ?? null;
  const activeTenant = tenants.find((t) => t.slug === tenantSlug) ?? null;
  const role = activeTenant?.role ?? null;

  const groups: NavGroup[] = [];

  if (tenantSlug && locationSlug) {
    const base = `/${tenantSlug}/${locationSlug}`;
    const startsWith = (sub: string) => (path: string) =>
      path.startsWith(`${base}/${sub}`);

    if (roleAtLeast(role, 'STAFF')) {
      groups.push({
        label: 'Operations',
        items: [
          { href: `${base}/pos`, label: 'POS', icon: 'point_of_sale', matches: startsWith('pos') },
          { href: `${base}/kds`, label: 'Kitchen', icon: 'restaurant', matches: startsWith('kds') },
          { href: `${base}/floor`, label: 'Floor', icon: 'table_bar', matches: startsWith('floor') },
          {
            href: `${base}/reservations`,
            label: 'Reservations',
            icon: 'event',
            matches: startsWith('reservations'),
          },
          {
            href: `${base}/online-orders`,
            label: 'Online orders',
            icon: 'shopping_bag',
            matches: startsWith('online-orders'),
          },
        ],
      });
    }

    {
      const isViewer = role === 'VIEWER';
      const isManagerPlus = roleAtLeast(role, 'MANAGER');
      const dashboard: NavItem[] = [];
      // Insights collapsed into Dashboard — dashboard is the single landing
      // page for revenue / day-of-week / labor cost. End-of-Day and the
      // standalone Insights tab are removed.
      if (isManagerPlus || isViewer) {
        dashboard.push({
          href: `${base}/dashboard`,
          label: 'Dashboard',
          icon: 'dashboard',
          matches: startsWith('dashboard'),
        });
      }
      if (isManagerPlus) {
        dashboard.push({
          href: `${base}/tickets`,
          label: 'Ticket history',
          icon: 'history',
          matches: startsWith('tickets'),
        });
        dashboard.push({
          href: `${base}/guests`,
          label: 'Customers',
          icon: 'group',
          matches: startsWith('guests'),
        });
      }
      if (dashboard.length > 0) {
        groups.push({ label: 'Dashboard', items: dashboard });
      }
    }

    // "My day" group (Time clock, Cash drawer, My schedule) hidden for now.

    if (roleAtLeast(role, 'MANAGER')) {
      groups.push({
        label: 'Setup',
        items: [
          // Catalog is mounted inside the per-location route so opening it
          // from Setup doesn't yank the sidebar into the tenant-admin
          // context. The underlying data is still tenant-scoped (shared
          // across locations); only the URL shape changes.
          {
            href: `${base}/catalog/items`,
            label: 'Catalog',
            icon: 'menu_book',
            matches: startsWith('catalog'),
          },
          {
            href: `${base}/settings/tip-pool`,
            label: 'Tip pool',
            icon: 'payments',
            matches: (p) => p.startsWith(`${base}/settings/tip-pool`),
          },
          {
            href: `${base}/inventory`,
            label: 'Inventory',
            icon: 'inventory_2',
            matches: startsWith('inventory'),
          },
          {
            href: `${base}/settings`,
            label: 'Settings',
            icon: 'settings',
            matches: (p) =>
              p === `${base}/settings` || (p.startsWith(`${base}/settings`) && !p.startsWith(`${base}/settings/tip-pool`)),
          },
        ],
      });
    }
  } else if (tenantSlug) {
    groups.push({
      label: 'Workspace',
      items: [
        {
          href: `/${tenantSlug}/overview`,
          label: 'Overview',
          icon: 'dashboard',
          matches: (p) => p.startsWith(`/${tenantSlug}/overview`),
        },
      ],
    });
  }

  if (tenantSlug && roleAtLeast(role, 'ADMIN')) {
    groups.push({
      label: 'Admin',
      items: [
        // Catalog moved to Setup (it's store-specific). Staff & pay and Job
        // roles are hidden for now — pages still exist but the sidebar
        // doesn't surface them.
        {
          href: `/${tenantSlug}/admin/members`,
          label: 'Members',
          icon: 'group',
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/members`),
        },
        {
          href: `/${tenantSlug}/admin/locations`,
          label: 'Locations',
          icon: 'location_on',
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/locations`),
        },
        {
          href: `/${tenantSlug}/admin/audit-log`,
          label: 'Audit log',
          icon: 'fact_check',
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/audit-log`),
        },
      ],
    });
  }

  return (
    // Sidebar is a "fixed-tone" surface — always navy regardless of light/dark
    // mode. Uses --m3-on-secondary-fixed (#131b2e) which is the same value in
    // both palettes, matching the "persistent Navy sidebar" guidance from the
    // design ref.
    <aside
      className="hidden w-60 shrink-0 flex-col lg:flex"
      style={{ backgroundColor: '#131b2e', color: '#e4e1ee' }}
    >
      <div
        className="flex h-16 items-center gap-2 px-card-padding"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span
          aria-hidden
          className="material-symbols-outlined"
          style={{ fontVariationSettings: "'FILL' 1", color: '#c3c0ff' }}
        >
          restaurant_menu
        </span>
        <Link
          href="/"
          className="font-display text-body-customer font-bold tracking-tight"
          style={{ color: '#ffffff' }}
        >
          F&amp;B Control Pane
        </Link>
      </div>
      <nav
        className="flex flex-1 flex-col gap-stack-loose overflow-y-auto px-3 py-gutter"
        aria-label="Primary"
      >
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-body-staff" style={{ color: 'rgba(228,225,238,0.6)' }}>
            Choose a workspace from the location switcher to begin.
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p
              className="px-3 pb-1 font-label-caps text-label-caps uppercase tracking-wider"
              style={{ color: 'rgba(228,225,238,0.5)' }}
            >
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = item.matches(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-staff font-medium transition-colors',
                    isActive
                      ? 'shadow-sm'
                      : 'hover:bg-white/10',
                  )}
                  style={
                    isActive
                      ? { backgroundColor: '#4f46e5', color: '#ffffff' }
                      : { color: 'rgba(228,225,238,0.8)' }
                  }
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span
                    aria-hidden
                    className="material-symbols-outlined text-[20px]"
                    style={{
                      color: isActive ? '#ffffff' : 'rgba(228,225,238,0.7)',
                      fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
