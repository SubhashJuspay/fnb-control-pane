'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserCog,
  MapPinned,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@repo/ui';
import { signOutAction } from './sign-out-action';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Foundation command palette. Sub-projects will register additional actions
 * later — for now we keep the registry inline and focused on navigation,
 * theme toggle, and sign out.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const params = useParams<{ tenantSlug?: string; locationSlug?: string }>();
  const { resolvedTheme, setTheme } = useTheme();
  const [, startTransition] = useTransition();

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const navigate = useCallback(
    (path: string) => {
      close();
      router.push(path);
    },
    [router, close],
  );

  const tenantSlug = params?.tenantSlug ?? null;
  const locationSlug = params?.locationSlug ?? null;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {tenantSlug && locationSlug ? (
            <CommandItem
              onSelect={() => navigate(`/${tenantSlug}/${locationSlug}`)}
            >
              <LayoutDashboard className="size-4" />
              Go to dashboard
            </CommandItem>
          ) : null}
          {tenantSlug ? (
            <>
              <CommandItem
                onSelect={() => navigate(`/${tenantSlug}/admin/members`)}
              >
                <UserCog className="size-4" />
                Members admin
              </CommandItem>
              <CommandItem
                onSelect={() => navigate(`/${tenantSlug}/admin/locations`)}
              >
                <MapPinned className="size-4" />
                Locations admin
              </CommandItem>
            </>
          ) : null}
          {tenantSlug && locationSlug ? (
            <CommandItem
              onSelect={() =>
                navigate(`/${tenantSlug}/${locationSlug}/settings`)
              }
            >
              <Settings className="size-4" />
              Location settings
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
              close();
            }}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            Toggle theme
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem
            onSelect={() => {
              close();
              startTransition(() => {
                void signOutAction();
              });
            }}
          >
            <LogOut className="size-4" />
            Sign out
            <CommandShortcut>⇧⌘Q</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Hook that wires ⌘K / Ctrl+K to toggle a command-palette open state. */
export function useCommandPaletteShortcut(): {
  open: boolean;
  setOpen: (next: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isToggle =
        event.key === 'k' && (event.metaKey || event.ctrlKey);
      if (isToggle) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return { open, setOpen };
}
