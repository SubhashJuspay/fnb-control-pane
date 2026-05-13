'use client';

import type { AppShellTenant, AppShellViewer } from '@/lib/viewer';
import { LocationSwitcher } from './location-switcher';
import { UserMenu } from './user-menu';

export interface TopBarProps {
  tenants: AppShellTenant[];
  viewer: AppShellViewer;
  onOpenCommandPalette: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function TopBar({
  tenants,
  viewer,
  onOpenCommandPalette,
  onToggleSidebar,
  sidebarOpen,
}: TopBarProps) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-outline-variant bg-surface px-container-margin shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
          data-testid="sidebar-toggle"
          className="inline-flex size-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <span aria-hidden className="material-symbols-outlined">
            {sidebarOpen ? 'menu_open' : 'menu'}
          </span>
        </button>
        <LocationSwitcher tenants={tenants} />
      </div>
      <div className="flex flex-1 justify-center px-4">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className="flex w-full max-w-md items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-staff text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className="material-symbols-outlined text-[18px] text-outline">
              search
            </span>
            Search or jump…
          </span>
          <kbd className="rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
            ⌘K
          </kbd>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <UserMenu viewer={viewer} />
      </div>
    </header>
  );
}
