import { redirect } from 'next/navigation';
import { TimeClockPage } from '@/components/time-clock/time-clock-page';
import { loadAppShellData } from '@/lib/viewer';

export default async function TimeClockRoute({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}): Promise<React.JSX.Element> {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Time clock</h1>
        <p className="text-sm text-muted-foreground">
          Punch in and out at {location.name}. Breaks are tracked separately
          and net minutes are computed automatically.
        </p>
      </header>
      <TimeClockPage locationId={location.id} />
    </div>
  );
}
