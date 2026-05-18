import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { TableQrSheet } from '@/components/floor/table-qr-sheet';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function TableQrPage({
  params,
}: {
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
    redirect(`/${tenantSlug}/${locationSlug}/floor`);
  }

  // Resolve the public origin so the printable QR points at the customer-
  // facing URL rather than the staff app. Prefers AUTH_URL (set on Vercel),
  // falls back to the incoming Host header for local dev.
  const headerList = await headers();
  const forwardedProto = headerList.get('x-forwarded-proto') ?? 'https';
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const fallbackOrigin = host ? `${forwardedProto}://${host}` : '';
  const origin = process.env.AUTH_URL ?? fallbackOrigin;

  return (
    <TableQrSheet
      origin={origin}
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={tenant.name}
      locationName={location.name}
    />
  );
}
