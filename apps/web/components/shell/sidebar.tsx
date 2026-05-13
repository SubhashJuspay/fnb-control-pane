'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChefHat,
  Clock,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  MapPin,
  Receipt,
  Settings,
  ShoppingBag,
  Users,
  UserCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@repo/ui';
import type { AppShellTenant } from '@/lib/viewer';

/**
 * Role hierarchy used for nav visibility. Members in this app:
 *   OWNER > ADMIN > MANAGER > STAFF > VIEWER
 * `roleAtLeast(actual, min)` returns true if `actual` ≥ `min` in this rank.
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
  icon: LucideIcon;
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
    const startsWith = (sub: string) => (path: string) => path.startsWith(`${base}/${sub}`);

    // Operations — STAFF+ visible. Day-to-day surfaces servers and cooks use.
    if (roleAtLeast(role, 'STAFF')) {
      groups.push({
        label: 'Operations',
        items: [
          { href: `${base}/pos`, label: 'POS', icon: Receipt, matches: startsWith('pos') },
          { href: `${base}/kds`, label: 'Kitchen', icon: ChefHat, matches: startsWith('kds') },
          { href: `${base}/floor`, label: 'Floor', icon: MapPin, matches: startsWith('floor') },
          {
            href: `${base}/reservations`,
            label: 'Reservations',
            icon: CalendarDays,
            matches: startsWith('reservations'),
          },
          {
            href: `${base}/online-orders`,
            label: 'Online orders',
            icon: ShoppingBag,
            matches: startsWith('online-orders'),
          },
        ],
      });
    }

    // Insights — MANAGER+ (the resolvers reject STAFF). VIEWER also gets
    // Dashboard + Insights as a read-only courtesy.
    {
      const isViewer = role === 'VIEWER';
      const isManagerPlus = roleAtLeast(role, 'MANAGER');
      const insights: NavItem[] = [];
      if (isManagerPlus || isViewer) {
        insights.push({
          href: `${base}/dashboard`,
          label: 'Dashboard',
          icon: LayoutDashboard,
          matches: startsWith('dashboard'),
        });
        insights.push({
          href: `${base}/insights`,
          label: 'Insights',
          icon: BarChart3,
          matches: startsWith('insights'),
        });
      }
      if (isManagerPlus) {
        insights.push({
          href: `${base}/tickets`,
          label: 'Ticket history',
          icon: History,
          matches: startsWith('tickets'),
        });
        insights.push({
          href: `${base}/end-of-day`,
          label: 'End of day',
          icon: FileText,
          matches: startsWith('end-of-day'),
        });
        insights.push({
          href: `${base}/guests`,
          label: 'Guests',
          icon: UserCircle,
          matches: startsWith('guests'),
        });
      }
      if (insights.length > 0) {
        groups.push({ label: 'Insights', items: insights });
      }
    }

    // Personal — every authenticated location user gets these.
    groups.push({
      label: 'My day',
      items: [
        {
          href: `${base}/time-clock`,
          label: 'Time clock',
          icon: Clock,
          matches: startsWith('time-clock'),
        },
        {
          href: `${base}/my-schedule`,
          label: 'My schedule',
          icon: CalendarClock,
          matches: startsWith('my-schedule'),
        },
      ],
    });

    // Setup — MANAGER+. Editorial surfaces.
    if (roleAtLeast(role, 'MANAGER')) {
      groups.push({
        label: 'Setup',
        items: [
          {
            href: `${base}/schedule`,
            label: 'Schedule',
            icon: CalendarRange,
            matches: startsWith('schedule'),
          },
          {
            href: `${base}/time-entries`,
            label: 'Time entries',
            icon: ClipboardList,
            matches: startsWith('time-entries'),
          },
          {
            href: `${base}/settings`,
            label: 'Settings',
            icon: Settings,
            matches: startsWith('settings'),
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
          icon: LayoutDashboard,
          matches: (p) => p.startsWith(`/${tenantSlug}/overview`),
        },
      ],
    });
  }

  // Admin — tenant-wide, ADMIN+. Visible whether or not a location is selected.
  if (tenantSlug && roleAtLeast(role, 'ADMIN')) {
    groups.push({
      label: 'Admin',
      items: [
        {
          href: `/${tenantSlug}/admin/members`,
          label: 'Members',
          icon: Users,
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/members`),
        },
        {
          href: `/${tenantSlug}/admin/catalog`,
          label: 'Catalog',
          icon: Receipt,
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/catalog`),
        },
        {
          href: `/${tenantSlug}/admin/locations`,
          label: 'Locations',
          icon: MapPin,
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/locations`),
        },
        {
          href: `/${tenantSlug}/admin/audit-log`,
          label: 'Audit log',
          icon: History,
          matches: (p) => p.startsWith(`/${tenantSlug}/admin/audit-log`),
        },
      ],
    });
  }

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/30 lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          F&amp;B Control Pane
        </Link>
      </div>
      <nav className="flex flex-col gap-4 overflow-y-auto p-2" aria-label="Primary">
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Choose a workspace from the location switcher to begin.
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = item.matches(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon
                    className={cn(
                      'size-4',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
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
