'use client';

import { useMemo, type ReactNode } from 'react';
import { Provider as UrqlProvider } from 'urql';
import { createPublicUrqlClient } from '@/components/order/public-graphql-client';

/**
 * Lightweight wrapper for the public booking page. We can't reuse `OrderShell`
 * directly because it forces a `<CartProvider>` and a tenant-aware sticky
 * header oriented around ordering. Booking only needs the anonymous GraphQL
 * client.
 */
export function BookingShell({ children }: { children: ReactNode }): React.JSX.Element {
  const client = useMemo(() => createPublicUrqlClient(), []);
  return (
    <UrqlProvider value={client}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </UrqlProvider>
  );
}
