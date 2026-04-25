'use client';

import { Button } from '@repo/ui';
import type { AppShellTenant, AppShellViewer } from '@/lib/viewer';
import { LocationSwitcher } from './location-switcher';
import { UserMenu } from './user-menu';

export interface TopBarProps {
  tenants: AppShellTenant[];
  viewer: AppShellViewer;
  onOpenCommandPalette: () => void;
}

export function TopBar({ tenants, viewer, onOpenCommandPalette }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <LocationSwitcher tenants={tenants} />
      </div>
      <div className="flex flex-1 justify-center px-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full max-w-sm justify-between gap-2 text-muted-foreground"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
        >
          <span className="text-sm">Search or jump…</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <UserMenu viewer={viewer} />
      </div>
    </header>
  );
}
