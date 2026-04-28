import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@repo/ui';
import { TicketDetail } from '@/components/tickets/ticket-detail';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string; id: string }>;
}) {
  const { tenantSlug, locationSlug, id } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const canManagerActions = MANAGER_ROLES.has(tenant.role);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${tenantSlug}/${locationSlug}/tickets`}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
            Back to tickets
          </Link>
        </Button>
      </div>
      <TicketDetail ticketId={id} canManagerActions={canManagerActions} />
    </div>
  );
}
