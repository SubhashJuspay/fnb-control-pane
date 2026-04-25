'use client';

import { useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, MapPin } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import type { AppShellTenant } from '@/lib/viewer';

export interface LocationSwitcherProps {
  tenants: AppShellTenant[];
}

export function LocationSwitcher({ tenants }: LocationSwitcherProps) {
  const router = useRouter();
  const params = useParams<{ tenantSlug?: string; locationSlug?: string }>();
  const activeTenantSlug = params?.tenantSlug ?? null;
  const activeLocationSlug = params?.locationSlug ?? null;

  const { activeTenant, activeLocation } = useMemo(() => {
    const t = tenants.find((tt) => tt.slug === activeTenantSlug) ?? null;
    const l = t?.locations.find((ll) => ll.slug === activeLocationSlug) ?? null;
    return { activeTenant: t, activeLocation: l };
  }, [tenants, activeTenantSlug, activeLocationSlug]);

  const triggerLabel = activeLocation
    ? `${activeTenant?.name ?? ''} · ${activeLocation.name}`
    : activeTenant
      ? `${activeTenant.name} · Overview`
      : 'Select workspace';

  const goTo = (tenantSlug: string, locationSlug: string | null) => {
    if (locationSlug) router.push(`/${tenantSlug}/${locationSlug}`);
    else router.push(`/${tenantSlug}/overview`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[280px] justify-between gap-2"
          aria-label="Switch tenant or location"
        >
          <span className="flex min-w-0 items-center gap-2">
            {activeLocation ? (
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {tenants.length === 0 ? (
          <DropdownMenuLabel className="text-muted-foreground">
            No tenants assigned to your account.
          </DropdownMenuLabel>
        ) : null}
        {tenants.map((tenant, index) => (
          <DropdownMenuGroup key={tenant.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="truncate">{tenant.name}</span>
            </DropdownMenuLabel>
            {tenant.isTenantWide ? (
              <DropdownMenuItem
                onSelect={() => goTo(tenant.slug, null)}
                className="pl-8"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">Overview</span>
                </span>
                {activeTenantSlug === tenant.slug && !activeLocationSlug ? (
                  <Check className="size-4" />
                ) : null}
              </DropdownMenuItem>
            ) : null}
            {tenant.locations.length === 0 && !tenant.isTenantWide ? (
              <DropdownMenuLabel className="pl-8 text-xs text-muted-foreground">
                No locations available.
              </DropdownMenuLabel>
            ) : null}
            {tenant.locations.map((location) => {
              const isActive =
                activeTenantSlug === tenant.slug &&
                activeLocationSlug === location.slug;
              return (
                <DropdownMenuItem
                  key={location.id}
                  onSelect={() => goTo(tenant.slug, location.slug)}
                  className="pl-8"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    <span className="truncate">{location.name}</span>
                  </span>
                  {isActive ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
