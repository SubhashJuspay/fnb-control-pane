import type { ReactNode } from 'react';

/**
 * Public route group: anonymous customer-facing pages (online ordering).
 *
 * Intentionally minimal — no auth, no `<GraphqlProvider>` (the children
 * provide their own anonymous urql client via `<PublicGraphqlProvider>`).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
