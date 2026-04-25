import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@repo/ui';

export default function LocationDashboardPage() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Location dashboard"
      description="Your data appears here as you set up the platform. Foundation ships the chrome; subsequent sub-projects ship the widgets."
    />
  );
}
