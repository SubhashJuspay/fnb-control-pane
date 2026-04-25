import { redirect } from 'next/navigation';

export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/members`);
}
