import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

/**
 * Root authenticated page. Resolves the viewer's tenant/location tree and
 * forwards to the most appropriate destination:
 *   - Single tenant + single location → that location's dashboard.
 *   - Tenant-wide membership with no location-scoped fallback → tenant overview.
 *   - Multiple tenants/locations → first tenant's first location (alphabetical).
 *   - Tenant-wide owner with no locations yet → tenant overview.
 */
export default async function HomePage() {
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  if (data.tenants.length === 0) redirect('/sign-in');
  const first = data.tenants[0]!;
  if (first.locations.length > 0) {
    redirect(`/${first.slug}/${first.locations[0]!.slug}`);
  }
  redirect(`/${first.slug}/overview`);
}
