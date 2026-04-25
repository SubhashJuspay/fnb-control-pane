import { Settings } from 'lucide-react';
import { EmptyState } from '@repo/ui';

export default function LocationSettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Location settings"
      description="Foundation owns location settings. The actual configuration surfaces (hours, taxes, payment methods, printers) ship with their respective sub-projects."
    />
  );
}
