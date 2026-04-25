'use client';

import { useTransition } from 'react';
import { LogOut, UserCircle2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import { signOutAction } from './sign-out-action';

export interface UserMenuProps {
  viewer: { id: string; email: string; name: string | null };
}

export function UserMenu({ viewer }: UserMenuProps) {
  const [pending, startTransition] = useTransition();
  const initials =
    (viewer.name ?? viewer.email)
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Account menu">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {initials}
          </span>
          <span className="hidden text-sm md:inline">{viewer.name ?? viewer.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserCircle2 className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{viewer.name ?? 'Signed in'}</div>
            <div className="truncate text-xs text-muted-foreground">{viewer.email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => {
              void signOutAction();
            });
          }}
        >
          <LogOut className="size-4" />
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
