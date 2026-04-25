'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from '@repo/ui';
import { GraphqlProvider } from '@/lib/graphql/provider';

/**
 * Root client provider stack: theme, GraphQL client + tenant scope, toasts.
 * Tenant + location scope is `null` here — tenant/location layouts override
 * it via their own GraphqlProvider (or future `TenantScopeContext.Provider`).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <GraphqlProvider scope={{ tenantSlug: null, locationId: null }}>
        {children}
        <Toaster />
      </GraphqlProvider>
    </ThemeProvider>
  );
}
