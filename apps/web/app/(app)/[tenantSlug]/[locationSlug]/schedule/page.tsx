import { ScheduleEditor } from '@/components/schedule/schedule-editor';
import { loadAppShellData } from '@/lib/viewer';
import { redirect } from 'next/navigation';

/**
 * Schedule editor page — finds the active location's id and timezone, then
 * passes them to the client editor. The layout already enforces manager
 * scope.
 */
export default async function SchedulePage({
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
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Drag-free week editor for {location.name}. Click an empty cell to
          add a draft shift; click a chip to edit or cancel. Publish the week
          when you&apos;re ready to broadcast it to staff.
        </p>
      </header>
      <ScheduleEditor
        locationId={location.id}
        locationTimezone={location.timezone}
      />
    </div>
  );
}
