import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * Tenant-admin layout. Re-validates the viewer's role for this tenant — must
 * be OWNER or ADMIN. Anyone else is silently redirected back to the tenant
 * overview page (we don't want to leak that an admin surface exists). The
 * outer tenant layout already wraps children in a <GraphqlProvider> scoped
 * to the tenant slug, so admin pages inherit that scope.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
    redirect(`/${tenantSlug}/overview`);
  }
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tenant admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage members, locations, and audit history for {tenant.name}.
        </p>
      </header>
      <AdminNav tenantSlug={tenantSlug} />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
