'use server';

import { signUpTenantSchema } from '@repo/validation/auth';
import { signIn } from '@/lib/auth';
import { serverFetch } from '@/lib/graphql/server';

export interface SignUpTenantActionResult {
  error?: string;
  redirectTo?: string;
}

const SIGN_UP_TENANT_MUTATION = /* GraphQL */ `
  mutation SignUpTenant($input: SignUpTenantInput!) {
    signUpTenant(input: $input) {
      tenantId
      tenantSlug
      locationSlug
      ownerEmail
    }
  }
`;

interface SignUpTenantData {
  signUpTenant: {
    tenantId: string;
    tenantSlug: string;
    locationSlug: string;
    ownerEmail: string;
  };
}

export interface SignUpTenantInput {
  tenantName: string;
  tenantSlug: string;
  locationName: string;
  locationSlug: string;
  timezone: string;
  currency: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
}

export async function signUpTenantAction(
  input: SignUpTenantInput,
): Promise<SignUpTenantActionResult> {
  const parsed = signUpTenantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const result = await serverFetch<SignUpTenantData>({
    query: SIGN_UP_TENANT_MUTATION,
    variables: { input: parsed.data },
  });
  if (result.errors?.length) {
    return { error: result.errors[0]?.message ?? 'Could not create your tenant.' };
  }
  const out = result.data?.signUpTenant;
  if (!out) {
    return { error: 'Could not complete sign-up.' };
  }
  try {
    await signIn('credentials', {
      email: out.ownerEmail,
      password: parsed.data.password,
      redirect: false,
    });
    return { redirectTo: `/${out.tenantSlug}/${out.locationSlug}/dashboard` };
  } catch {
    return { redirectTo: '/sign-in' };
  }
}
