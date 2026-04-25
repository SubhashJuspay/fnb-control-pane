'use client';

import type { ReactNode } from 'react';
import type { AppShellTenant, AppShellViewer } from '@/lib/viewer';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { CommandPalette, useCommandPaletteShortcut } from './command-palette';

export interface AppShellProps {
  viewer: AppShellViewer;
  tenants: AppShellTenant[];
  children: ReactNode;
}

export function AppShell({ viewer, tenants, children }: AppShellProps) {
  const { open, setOpen } = useCommandPaletteShortcut();
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar tenants={tenants} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar viewer={viewer} tenants={tenants} onOpenCommandPalette={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
