'use client';

import { createContext, useContext } from 'react';

/**
 * The active location's ISO 4217 currency code, exposed to client components
 * so price displays don't need to thread `currency` through every prop list.
 *
 * Tenant-only routes (e.g. the catalog admin) default to `USD` because there
 * is no single location in scope; once the user enters a location-scoped
 * surface (`/[tenantSlug]/[locationSlug]/...`) the layout overrides the
 * provider with that location's `currency` from `loadAppShellData()`.
 */
export const LocationCurrencyContext = createContext<string>('USD');

export function useLocationCurrency(): string {
  return useContext(LocationCurrencyContext);
}
