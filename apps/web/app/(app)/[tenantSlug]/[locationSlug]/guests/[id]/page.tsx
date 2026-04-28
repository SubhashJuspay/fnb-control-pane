import { GuestDetail } from '@/components/guests/guest-detail';

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string; id: string }>;
}) {
  const { tenantSlug, locationSlug, id } = await params;
  return (
    <GuestDetail
      guestId={id}
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
    />
  );
}
