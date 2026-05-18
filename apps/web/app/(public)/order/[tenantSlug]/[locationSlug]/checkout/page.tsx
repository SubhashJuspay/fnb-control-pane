import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

// Checkout is now collected inline in the cart drawer. This route is kept as
// a redirect so any bookmarked URLs land on the menu instead of 404'ing.
export default async function CheckoutPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  redirect(`/order/${tenantSlug}/${locationSlug}`);
}
