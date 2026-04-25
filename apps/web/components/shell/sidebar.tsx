'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { LayoutDashboard, Settings, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@repo/ui';
import type { AppShellTenant } from '@/lib/viewer';

const ADMIN_ROLES = new Set(['ADMIN', 'OWNER']);

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matches: (pathname: string) => boolean;
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
  const showAdmin = activeTenant ? ADMIN_ROLES.has(activeTenant.role) : false;

  const items: NavItem[] = [];
  if (tenantSlug && locationSlug) {
    items.push({
      href: `/${tenantSlug}/${locationSlug}`,
      label: 'Dashboard',
      icon: LayoutDashboard,
      matches: (path) =>
        path === `/${tenantSlug}/${locationSlug}` ||
        path.startsWith(`/${tenantSlug}/${locationSlug}?`),
    });
    items.push({
      href: `/${tenantSlug}/${locationSlug}/settings`,
      label: 'Settings',
      icon: Settings,
      matches: (path) => path.startsWith(`/${tenantSlug}/${locationSlug}/settings`),
    });
  } else if (tenantSlug) {
    items.push({
      href: `/${tenantSlug}/overview`,
      label: 'Overview',
      icon: LayoutDashboard,
      matches: (path) => path.startsWith(`/${tenantSlug}/overview`),
    });
  }
  if (showAdmin && tenantSlug) {
    items.push({
      href: `/${tenantSlug}/admin/members`,
      label: 'Admin',
      icon: Users,
      matches: (path) => path.startsWith(`/${tenantSlug}/admin`),
    });
  }

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/30 lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          F&amp;B Control Pane
        </Link>
      </div>
      <nav className="flex flex-col gap-0.5 p-2" aria-label="Primary">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Choose a workspace from the location switcher to begin.
          </p>
        ) : null}
        {items.map((item) => {
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
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
