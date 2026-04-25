'use client';

import { useMemo } from 'react';
import { Provider as UrqlProvider } from 'urql';
import { TenantScopeContext, type TenantScope } from './context';
import { createUrqlClient } from './client';

export function GraphqlProvider({
  children,
  scope,
}: {
  children: React.ReactNode;
  scope: TenantScope;
}) {
  const client = useMemo(
    () =>
      createUrqlClient(() => ({
        tenantSlug: scope.tenantSlug,
        locationId: scope.locationId,
      })),
    [scope.tenantSlug, scope.locationId],
  );
  return (
    <TenantScopeContext.Provider value={scope}>
      <UrqlProvider value={client}>{children}</UrqlProvider>
    </TenantScopeContext.Provider>
  );
}
