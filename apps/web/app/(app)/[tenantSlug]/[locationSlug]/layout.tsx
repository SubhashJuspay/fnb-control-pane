import { redirect } from 'next/navigation';
import { GraphqlProvider } from '@/lib/graphql/provider';
import { loadAppShellData } from '@/lib/viewer';

/**
 * Location-scoped layout. Validates that the viewer can see this location
 * (either tenant-wide membership in the parent tenant, or a location-scoped
 * membership matching this slug). On miss, bounce to the tenant overview —
 * we already know they belong to the tenant by the time the parent layout
 * has rendered. Wraps children with the resolved `locationId` so the urql
 * client emits the `x-location-id` header.
 */
export default async function LocationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  return (
    <GraphqlProvider scope={{ tenantSlug, locationId: location.id }}>
      {children}
    </GraphqlProvider>
  );
}
