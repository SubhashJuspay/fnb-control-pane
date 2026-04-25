import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { loadAppShellData } from '@/lib/viewer';
import { GraphqlProvider } from '@/lib/graphql/provider';
import { AppShell } from '@/components/shell/app-shell';

/**
 * Authenticated route-group layout. Server component that:
 *   1. Resolves the Auth.js session — bounces unauthenticated users to /sign-in.
 *   2. Loads viewer + tenant/location tree via the api viewer query.
 *   3. Wraps children in a tenant-less `<GraphqlProvider>` so the location
 *      switcher (which calls viewer with no tenant scope) works. Nested
 *      tenant/location layouts re-wrap with the right scope.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  return (
    <GraphqlProvider scope={{ tenantSlug: null, locationId: null }}>
      <AppShell viewer={data.viewer} tenants={data.tenants}>
        {children}
      </AppShell>
    </GraphqlProvider>
  );
}
