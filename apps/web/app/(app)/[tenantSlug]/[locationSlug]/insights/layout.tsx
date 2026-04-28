import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { InsightsNav } from '@/components/analytics/insights-nav';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function InsightsLayout({
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
  if (!MANAGER_ROLES.has(tenant.role)) {
    redirect(`/${tenantSlug}/${locationSlug}`);
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Drill into sales, items, hours, server performance, and guest cohort.
        </p>
      </header>
      <InsightsNav tenantSlug={tenantSlug} locationSlug={locationSlug} />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
