'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { AppShellTenant, AppShellViewer } from '@/lib/viewer';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { CommandPalette, useCommandPaletteShortcut } from './command-palette';

export interface AppShellProps {
  viewer: AppShellViewer;
  tenants: AppShellTenant[];
  children: ReactNode;
}

const SIDEBAR_PREF_KEY = 'fnb.shell.sidebar-open';

// The KDS is wall-mounted — staff need maximum cards in view, so the sidebar
// auto-collapses there. Anywhere else it defaults to open. Manual toggle wins
// and persists across navigations within the tab.
function isImmersiveRoute(pathname: string | null): boolean {
  return Boolean(pathname && /\/[^/]+\/[^/]+\/kds(\/|$)/.test(pathname));
}

export function AppShell({ viewer, tenants, children }: AppShellProps) {
  const pathname = usePathname();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPaletteShortcut();

  // Lazy-init from localStorage. Falls back to the route default so the very
  // first visit to /kds opens collapsed, but staff can override with the
  // hamburger and we'll respect that choice for the rest of the session.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return !isImmersiveRoute(pathname);
    const stored = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
    return !isImmersiveRoute(pathname);
  });

  // Re-evaluate the route default whenever the user navigates. We only do this
  // when there is no explicit user preference, otherwise the manual toggle
  // would be silently reset on every navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    if (stored !== null) return;
    setSidebarOpen(!isImmersiveRoute(pathname));
  }, [pathname]);

  const onToggleSidebar = (): void => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_PREF_KEY, next ? 'open' : 'closed');
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {sidebarOpen ? <Sidebar tenants={tenants} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          viewer={viewer}
          tenants={tenants}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onToggleSidebar={onToggleSidebar}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 overflow-y-auto bg-background px-container-margin py-gutter">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
