'use client';

import { createContext, useContext } from 'react';

export interface TenantScope {
  tenantSlug: string | null;
  locationId: string | null;
}

export const TenantScopeContext = createContext<TenantScope>({
  tenantSlug: null,
  locationId: null,
});

export function useTenantScope(): TenantScope {
  return useContext(TenantScopeContext);
}
