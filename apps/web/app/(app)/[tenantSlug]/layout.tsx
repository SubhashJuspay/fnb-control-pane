import { redirect } from 'next/navigation';
import { GraphqlProvider } from '@/lib/graphql/provider';
import { loadAppShellData } from '@/lib/viewer';

/**
 * Tenant-scoped layout. Validates that the viewer has at least one ACTIVE
 * membership in this tenant. If not, redirects to `/` silently — we don't
 * want to leak whether a given tenant slug exists. Re-wraps children in a
 * `<GraphqlProvider>` carrying the tenant slug so urql sends
 * `x-tenant-slug` on subsequent requests.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  return <GraphqlProvider scope={{ tenantSlug, locationId: null }}>{children}</GraphqlProvider>;
}
