import { redirect } from 'next/navigation';

export default async function InsightsIndexRoute({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  redirect(`/${tenantSlug}/${locationSlug}/insights/sales`);
}
