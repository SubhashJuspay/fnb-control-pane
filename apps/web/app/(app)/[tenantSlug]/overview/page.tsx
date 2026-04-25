import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@repo/ui';

export default function TenantOverviewPage() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Tenant overview"
      description="Your data appears here as you set up the platform. Sub-projects shipped after Foundation will mount their dashboards into this view."
    />
  );
}
