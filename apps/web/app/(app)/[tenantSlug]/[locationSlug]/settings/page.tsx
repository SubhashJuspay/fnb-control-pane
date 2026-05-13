import { LocationSettingsForm } from '@/components/settings/location-settings-form';

export default function LocationSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Location settings</h1>
        <p className="text-sm text-muted-foreground">
          Phone, address, and opening hours for the current location. Changes
          here apply immediately to the public order surface.
        </p>
      </header>
      <LocationSettingsForm />
    </div>
  );
}
